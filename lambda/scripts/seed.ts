declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  exitCode?: number;
};
import {
  CreateTableCommand,
  DynamoDBClient,
  ListTablesCommand,
  ResourceInUseException,
  waitUntilTableExists
} from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { seedProducts } from '../src/seed/products.js';

const isLocal = process.argv.includes('--local');
const endpoint =
  process.env.DYNAMODB_ENDPOINT ?? (isLocal ? 'http://localhost:8000' : undefined);
const client = new DynamoDBClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
  ...(endpoint
    ? {
        endpoint,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? (isLocal ? 'local' : ''),
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? (isLocal ? 'local' : '')
        }
      }
    : {})
});
const documentClient = DynamoDBDocumentClient.from(client);
const productsTable = process.env.PRODUCTS_TABLE ?? 'FoodSaveProducts';
const ordersTable = process.env.ORDERS_TABLE ?? 'FoodSaveOrders';
const usersTable = process.env.USERS_TABLE ?? 'FoodSaveUsers';

async function waitForLocalDatabase(): Promise<void> {
  if (!isLocal) return;

  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await client.send(new ListTablesCommand({ Limit: 1 }));
      return;
    } catch (error: unknown) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error('DynamoDB Local no respondió después de 30 segundos.', {
    cause: lastError
  });
}

async function createTableIfNeeded(
  command: CreateTableCommand,
  tableName: string
): Promise<void> {
  try {
    await client.send(command);
  } catch (error: unknown) {
    if (!(error instanceof ResourceInUseException)) throw error;
  }
  await waitUntilTableExists(
    { client, maxWaitTime: 30 },
    { TableName: tableName }
  );
}

async function ensureTables(): Promise<void> {
  await createTableIfNeeded(
    new CreateTableCommand({
      TableName: productsTable,
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [
        { AttributeName: 'id', AttributeType: 'S' },
        { AttributeName: 'category', AttributeType: 'S' },
        { AttributeName: 'title', AttributeType: 'S' }
      ],
      KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'CategoryTitleIndex',
          KeySchema: [
            { AttributeName: 'category', KeyType: 'HASH' },
            { AttributeName: 'title', KeyType: 'RANGE' }
          ],
          Projection: { ProjectionType: 'ALL' }
        }
      ]
    }),
    productsTable
  );
  await createTableIfNeeded(
    new CreateTableCommand({
      TableName: ordersTable,
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }]
    }),
    ordersTable
  );
  await createTableIfNeeded(
    new CreateTableCommand({
      TableName: usersTable,
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [{ AttributeName: 'sub', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'sub', KeyType: 'HASH' }]
    }),
    usersTable
  );
}

async function waitForDeployedTables(): Promise<void> {
  await Promise.all([
    waitUntilTableExists(
      { client, maxWaitTime: 60 },
      { TableName: productsTable }
    ),
    waitUntilTableExists(
      { client, maxWaitTime: 60 },
      { TableName: ordersTable }
    ),
    waitUntilTableExists(
      { client, maxWaitTime: 60 },
      { TableName: usersTable }
    )
  ]);
}

async function seed(): Promise<void> {
  await waitForLocalDatabase();
  if (isLocal) {
    await ensureTables();
  } else {
    await waitForDeployedTables();
  }

  for (const product of seedProducts) {
    await documentClient.send(
      new PutCommand({ TableName: productsTable, Item: product })
    );
  }

  console.log(`Se cargaron ${seedProducts.length} productos en ${productsTable}.`);
}

seed().catch((error: unknown) => {
  console.error('No se pudo preparar DynamoDB.', error);
  process.exitCode = 1;
});
