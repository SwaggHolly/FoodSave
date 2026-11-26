import assert from 'node:assert/strict';
import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  TransactionCanceledException
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
  UpdateCommand
} from '@aws-sdk/lib-dynamodb';
import test from 'node:test';
import type { Order } from '../../../domain/models/order.js';
import type { Product } from '../../../domain/models/product.js';
import type { UserProfile } from '../../../domain/models/user-profile.js';
import { PRIVACY_POLICY_VERSION } from '../../../domain/models/privacy.js';
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

  test('hides vegetables at the exact removal time even before scheduled deletion', async (context) => {
    const client = createClient();
    context.mock.method(client, 'send', async () => ({
      Items: [{ ...product, category: 'verduras', removeAt: new Date(Date.now() - 1).toISOString() }]
    }));
    assert.deepEqual(await new DynamoDBFoodSaveRepository(client).listProducts({}), []);
  });

  test('deletes only due vegetables with a conditional write', async (context) => {
    const client = createClient();
    const deletes: DeleteCommand[] = [];
    context.mock.method(client, 'send', async (command) => {
      if (command instanceof QueryCommand) {
        assert.equal(command.input.ExpressionAttributeValues?.[':category'], 'verduras');
        return { Items: [{ ...product, category: 'verduras', removeAt: '2026-11-25T12:00:00.000Z' }] };
      }
      assert.ok(command instanceof DeleteCommand);
      deletes.push(command);
      return {};
    });
    const count = await new DynamoDBFoodSaveRepository(client).deleteExpiredVegetables(new Date('2026-11-25T12:00:00.000Z'));
    assert.equal(count, 1);
    assert.equal(deletes[0]?.input.ConditionExpression, '#category = :category AND #removeAt <= :now');
  });

  test('expires a reservation without recreating a product already deleted', async (context) => {
    const client = createClient();
    const commands: TransactWriteCommand[] = [];
    const expiredOrder = {
      id: 'expired-order', buyerName: 'Ana Pérez', buyerPhone: '+573001234567',
      privacyPolicyVersion: PRIVACY_POLICY_VERSION, privacyAcceptedAt: '2026-11-18T12:00:00.000Z',
      status: 'reserved', items: [{ productId: product.id, title: product.title, quantity: 1, unitPrice: 4800, lineTotal: 4800 }],
      total: 4800, createdAt: '2026-11-18T12:00:00.000Z', paymentExpiresAt: '2026-11-18T12:15:00.000Z'
    };
    context.mock.method(client, 'send', async (command) => {
      if (command instanceof QueryCommand) return { Items: command.input.ExpressionAttributeValues?.[':pending'] === 'reserved' ? [expiredOrder] : [] };
      if (command instanceof GetCommand) return {};
      assert.ok(command instanceof TransactWriteCommand);
      commands.push(command);
      if (commands.length === 1) throw new TransactionCanceledException({ message: 'deleted', $metadata: {} });
      return {};
    });
    assert.equal(await new DynamoDBFoodSaveRepository(client).expirePendingOrders(new Date('2026-11-18T12:16:00.000Z')), 1);
    assert.equal(commands[1]?.input.TransactItems?.[0]?.ConditionCheck?.ConditionExpression, 'attribute_not_exists(id)');
    assert.equal(commands[1]?.input.TransactItems?.[1]?.Update?.ExpressionAttributeValues?.[':expired'], 'expired');
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
    privacyPolicyVersion: PRIVACY_POLICY_VERSION,
    privacyAcceptedAt: new Date().toISOString(),
    status: 'pending_payment',
    statusSubscriptionToken: 'one-time-status-token',
    statusSubscriptionTokenHash: 'a'.repeat(64),
    paymentExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
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
  assert.equal(transactions?.[0]?.Update?.ConditionExpression, '#stock >= :quantity AND #expirationDate > :createdAt AND (attribute_not_exists(#removeAt) OR #removeAt > :createdAt)');
  const { statusSubscriptionToken: _token, ...persistedOrder } = order;
  assert.deepEqual(transactions?.[1]?.Put?.Item, persistedOrder);
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
    privacyPolicyVersion: PRIVACY_POLICY_VERSION,
    privacyAcceptedAt: new Date().toISOString(),
    status: 'pending_payment',
    paymentExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    items: [],
    total: 0,
    createdAt: new Date().toISOString()
  };

  await assert.rejects(
    new DynamoDBFoodSaveRepository(client).createOrder(order),
    InventoryConflictError
  );
});

test('expires overdue orders and restores their reserved stock transactionally', async (context) => {
  const client = createClient();
  const releases: TransactWriteCommand[] = [];
  context.mock.method(client, 'send', async (command) => {
    if (command instanceof QueryCommand) {
      const status = command.input.ExpressionAttributeValues?.[':pending'];
      return {
        Items: [
          {
            id: 'expired-order',
            buyerName: 'Ana Pérez',
            buyerPhone: '+573001234567',
            privacyPolicyVersion: PRIVACY_POLICY_VERSION,
            privacyAcceptedAt: '2026-11-18T12:00:00.000Z',
            status,
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
            createdAt: '2026-11-18T12:00:00.000Z',
            paymentExpiresAt: '2026-11-18T12:15:00.000Z'
          }
        ]
      };
    }
    assert.ok(command instanceof TransactWriteCommand);
    releases.push(command);
    return { $metadata: { httpStatusCode: 200 } };
  });

  const expiredCount = await new DynamoDBFoodSaveRepository(client).expirePendingOrders(
    new Date('2026-11-18T12:16:00.000Z')
  );

  assert.equal(expiredCount, 2);
  assert.deepEqual(releases.map((release) =>
    release.input.TransactItems?.[1]?.Update?.ExpressionAttributeValues?.[':pending']
  ), ['reserved', 'pending_payment']);
  for (const release of releases) {
    const operations = release.input.TransactItems;
    assert.equal(operations?.length, 2);
    assert.deepEqual(operations?.[0]?.Update?.Key, { id: product.id });
    assert.equal(operations?.[0]?.Update?.UpdateExpression, 'SET #stock = #stock + :quantity');
    assert.equal(
      operations?.[1]?.Update?.ConditionExpression,
      '#status = :pending AND #paymentExpiresAt <= :now'
    );
  }
});

test('limits reservations atomically without persisting the source IP', async (context) => {
  const client = createClient();
  let update: UpdateCommand | undefined;
  context.mock.method(client, 'send', async (command) => {
    assert.ok(command instanceof UpdateCommand);
    update = command;
    return { $metadata: { httpStatusCode: 200 } };
  });

  const allowed = await new DynamoDBFoodSaveRepository(client).consumeReservationRateLimit(
    '203.0.113.42',
    new Date('2026-11-18T12:00:00.000Z')
  );

  assert.equal(allowed, true);
  assert.match(String(update?.input.Key?.['key']), /^[a-f0-9]{64}$/);
  assert.notEqual(update?.input.Key?.['key'], '203.0.113.42');
  assert.equal(update?.input.ConditionExpression, 'attribute_not_exists(#requestCount) OR #requestCount < :limit');
  assert.equal(update?.input.ExpressionAttributeValues?.[':limit'], 5);
  assert.equal(
    update?.input.ExpressionAttributeValues?.[':expiresAt'],
    Math.floor(Date.parse('2026-11-18T12:00:00.000Z') / 1000) + 24 * 60 * 60 + 10 * 60
  );
});

test('returns a rejected result when the DynamoDB reservation limit is reached', async (context) => {
  const client = createClient();
  context.mock.method(client, 'send', async () => {
    throw new ConditionalCheckFailedException({
      message: 'Rate limit reached',
      $metadata: { httpStatusCode: 400 }
    });
  });

  const allowed = await new DynamoDBFoodSaveRepository(client).consumeReservationRateLimit(
    '203.0.113.42',
    new Date('2026-11-18T12:00:00.000Z')
  );

  assert.equal(allowed, false);
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

test('activates new merchant applications with a conditional write', async (context) => {
  const client = createClient();
  let write: PutCommand | undefined;
  context.mock.method(client, 'send', async (command) => {
    assert.ok(command instanceof PutCommand);
    write = command;
    return { $metadata: { httpStatusCode: 200 } };
  });

  const application = await new DynamoDBFoodSaveRepository(client).createMerchantApplication(
    'merchant-sub',
    {
      storeName: 'Fruver del barrio',
      ownerName: 'Ana Pérez',
      contactEmail: 'tienda@example.com',
      phone: '+573001234567',
      city: 'Bogotá',
      address: 'Carrera 7 # 45-10',
      description: ''
    },
    new Date('2026-11-18T12:00:00.000Z')
  );

  assert.equal(application.status, 'approved');
  assert.equal(application.sub, 'merchant-sub');
  assert.equal(write?.input.ConditionExpression, 'attribute_not_exists(sub)');
});

test('activates an existing pending merchant when the account is consulted', async (context) => {
  const client = createClient();
  const application = {
    sub: 'merchant-sub', storeName: 'Tienda', ownerName: 'Ana Pérez',
    contactEmail: 'ana@example.com', phone: '+573001234567', city: 'Bogotá',
    address: 'Carrera 7 # 45-10', description: '', status: 'pending_review',
    createdAt: '2026-11-18T12:00:00.000Z', updatedAt: '2026-11-18T12:00:00.000Z'
  };
  context.mock.method(client, 'send', async (command) => {
    if (command instanceof GetCommand) return { Item: application };
    assert.ok(command instanceof UpdateCommand);
    assert.equal(command.input.ConditionExpression, '#status = :pending');
    return { Attributes: { ...application, status: 'approved' } };
  });
  assert.equal((await new DynamoDBFoodSaveRepository(client).getMerchantApplication(application.sub))?.status, 'approved');
});

test('publishes a merchant product only inside an approved-merchant transaction', async (context) => {
  const client = createClient();
  let transaction: TransactWriteCommand | undefined;
  context.mock.method(client, 'send', async (command) => {
    assert.ok(command instanceof TransactWriteCommand);
    transaction = command;
    return { $metadata: { httpStatusCode: 200 } };
  });
  const merchantProduct: Product = {
    ...product,
    id: 'merchant-product-1',
    merchantId: 'merchant-sub',
    imageKey: 'merchant-images/merchant-sub/image.webp'
  };

  await new DynamoDBFoodSaveRepository(client).createMerchantProduct(merchantProduct);

  const operations = transaction?.input.TransactItems;
  assert.equal(operations?.length, 2);
  assert.equal(operations?.[0]?.ConditionCheck?.ConditionExpression, '#status = :approved');
  assert.deepEqual(operations?.[0]?.ConditionCheck?.Key, { sub: 'merchant-sub' });
  assert.deepEqual(operations?.[1]?.Put?.Item, merchantProduct);
});
