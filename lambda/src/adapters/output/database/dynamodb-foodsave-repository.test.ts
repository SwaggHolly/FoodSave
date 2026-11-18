import assert from 'node:assert/strict';
import { DynamoDBClient, TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand
} from '@aws-sdk/lib-dynamodb';
import test from 'node:test';
import type { Order } from '../../../domain/models/order.js';
import type { Product } from '../../../domain/models/product.js';
import type { UserProfile } from '../../../domain/models/user-profile.js';
import { InventoryConflictError } from '../../../domain/services/reserve-order.js';
import { DynamoDBFoodSaveRepository } from './dynamodb-foodsave-repository.js';

const product: Product = {
  id: 'apple-1',
  title: 'Manzanas rojas',
  storeName: 'Fruver local',
  category: 'frutas',
  originalPrice: 12000,
  discountPrice: 4800,
  expirationDate: new Date(Date.now() + 86_400_000).toISOString(),
  stock: 5,
  imageUrl: 'https://example.com/apples.jpg'
};

function createClient(): DynamoDBDocumentClient {
  return DynamoDBDocumentClient.from(
    new DynamoDBClient({
      region: 'us-east-1',
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' }
    })
  );
}

test('scans all catalog pages and filters unavailable, expired, and non-matching products', async (context) => {
  const client = createClient();
  const expiredProduct = {
    ...product,
    id: 'expired',
    expirationDate: new Date(Date.now() - 1).toISOString()
  };
  const unavailableProduct = { ...product, id: 'unavailable', stock: 0 };
  let page = 0;
  const scanCommands: ScanCommand[] = [];

  context.mock.method(client, 'send', async (command) => {
    assert.ok(command instanceof ScanCommand);
    scanCommands.push(command);
    page += 1;
    return page === 1
      ? {
          Items: [product, expiredProduct],
          LastEvaluatedKey: { id: 'next-page' },
          $metadata: { httpStatusCode: 200 }
        }
      : {
          Items: [unavailableProduct, { ...product, id: 'bread', title: 'Pan artesanal' }],
          $metadata: { httpStatusCode: 200 }
        };
  });

  const results = await new DynamoDBFoodSaveRepository(client).listProducts({
    search: ' manzanas '
  });

  assert.deepEqual(results.map((item) => item.id), ['apple-1']);
  assert.equal(scanCommands.length, 2);
  assert.deepEqual(scanCommands[1]?.input.ExclusiveStartKey, { id: 'next-page' });
});

test('queries the category index when a category filter is supplied', async (context) => {
  const client = createClient();
  let queryCommand: QueryCommand | undefined;
  context.mock.method(client, 'send', async (command) => {
    assert.ok(command instanceof QueryCommand);
    queryCommand = command;
    return { Items: [product], $metadata: { httpStatusCode: 200 } };
  });

  const results = await new DynamoDBFoodSaveRepository(client).listProducts({
    category: 'frutas'
  });

  assert.equal(results.length, 1);
  assert.equal(queryCommand?.input.IndexName, 'CategoryTitleIndex');
  assert.deepEqual(queryCommand?.input.ExpressionAttributeValues, {
    ':category': 'frutas'
  });
});

test('loads existing products by id and omits missing items', async (context) => {
  const client = createClient();
  const requestedIds: string[] = [];
  context.mock.method(client, 'send', async (command) => {
    assert.ok(command instanceof GetCommand);
    const id = String(command.input.Key?.['id']);
    requestedIds.push(id);
    return {
      ...(id === product.id ? { Item: product } : {}),
      $metadata: { httpStatusCode: 200 }
    };
  });

  const results = await new DynamoDBFoodSaveRepository(client).getProductsByIds([
    product.id,
    'missing'
  ]);

  assert.deepEqual(requestedIds.sort(), ['apple-1', 'missing']);
  assert.deepEqual(results, [product]);
});

test('writes inventory updates and the order in one DynamoDB transaction', async (context) => {
  const client = createClient();
  let transaction: TransactWriteCommand | undefined;
  context.mock.method(client, 'send', async (command) => {
    assert.ok(command instanceof TransactWriteCommand);
    transaction = command;
    return { $metadata: { httpStatusCode: 200 } };
  });
  const order: Order = {
    id: 'order-123',
    buyerName: 'Ana Pérez',
    buyerPhone: '+573001234567',
    status: 'reserved',
    items: [
      {
        productId: product.id,
        title: product.title,
        quantity: 2,
        unitPrice: product.discountPrice,
        lineTotal: product.discountPrice * 2
      }
    ],
    total: product.discountPrice * 2,
    createdAt: new Date().toISOString()
  };

  await new DynamoDBFoodSaveRepository(client).createOrder(order);

  const transactions = transaction?.input.TransactItems;
  assert.equal(transactions?.length, 2);
  assert.deepEqual(transactions?.[0]?.Update?.Key, { id: product.id });
  assert.equal(transactions?.[0]?.Update?.ConditionExpression, '#stock >= :quantity AND #expirationDate > :createdAt');
  assert.deepEqual(transactions?.[1]?.Put?.Item, order);
});

test('maps DynamoDB transaction cancellation to an inventory conflict', async (context) => {
  const client = createClient();
  context.mock.method(client, 'send', async () => {
    throw new TransactionCanceledException({
      message: 'Transaction cancelled',
      $metadata: { httpStatusCode: 400 }
    });
  });
  const order: Order = {
    id: 'order-123',
    buyerName: 'Ana Pérez',
    buyerPhone: '+573001234567',
    status: 'reserved',
    items: [],
    total: 0,
    createdAt: new Date().toISOString()
  };

  await assert.rejects(
    new DynamoDBFoodSaveRepository(client).createOrder(order),
    InventoryConflictError
  );
});

test('reads and stores user profiles by Cognito subject', async (context) => {
  const client = createClient();
  const profile: UserProfile = {
    sub: 'cognito-user-123',
    name: 'Ana Pérez',
    email: 'ana@example.com',
    phone: '+573001234567',
    updatedAt: '2026-11-17T12:00:00.000Z'
  };
  let storedProfile: UserProfile | undefined;
  context.mock.method(client, 'send', async (command) => {
    if (command instanceof GetCommand) {
      assert.deepEqual(command.input.Key, { sub: profile.sub });
      return { Item: storedProfile, $metadata: { httpStatusCode: 200 } };
    }
    assert.ok(command instanceof PutCommand);
    storedProfile = command.input.Item as UserProfile;
    return { $metadata: { httpStatusCode: 200 } };
  });
  const repository = new DynamoDBFoodSaveRepository(client);

  const beforeSave = await repository.getUserProfile(profile.sub);
  const saved = await repository.saveUserProfile(profile.sub, profile.email, {
    name: profile.name,
    phone: profile.phone
  });
  const afterSave = await repository.getUserProfile(profile.sub);

  assert.equal(beforeSave, undefined);
  assert.deepEqual(saved, afterSave);
  assert.equal(saved.email, profile.email);
});
