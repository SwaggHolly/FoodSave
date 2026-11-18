import { DynamoDBClient, TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand
} from '@aws-sdk/lib-dynamodb';
import type { ScanCommandInput } from '@aws-sdk/lib-dynamodb';
import type { Order } from '../../../domain/models/order.js';
import { productSchema, type Product, type ProductCategory } from '../../../domain/models/product.js';
import type {
  UpdateUserProfile,
  UserProfile
} from '../../../domain/models/user-profile.js';
import { userProfileSchema } from '../../../domain/models/user-profile.js';
import type {
  FoodSaveRepository,
  ProductListOptions
} from '../../../ports/output/foodsave-repository.js';
import { InventoryConflictError } from '../../../domain/services/reserve-order.js';

const productsTable = process.env.PRODUCTS_TABLE ?? 'FoodSaveProducts';
const ordersTable = process.env.ORDERS_TABLE ?? 'FoodSaveOrders';
const usersTable = process.env.USERS_TABLE ?? 'FoodSaveUsers';
const endpoint = process.env.DYNAMODB_ENDPOINT;

const documentClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: process.env.AWS_REGION ?? 'us-east-1',
    ...(endpoint
      ? {
          endpoint,
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'local',
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'local'
          }
        }
      : {})
  })
);

export class DynamoDBFoodSaveRepository implements FoodSaveRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient = documentClient
  ) {}

  async listProducts(options: ProductListOptions): Promise<Product[]> {
    const products: Product[] = [];
    let lastEvaluatedKey: ScanCommandInput['ExclusiveStartKey'];

    do {
      const page = options.category
        ? await this.client.send(
            new QueryCommand({
              TableName: productsTable,
              IndexName: 'CategoryTitleIndex',
              KeyConditionExpression: '#category = :category',
              ExpressionAttributeNames: { '#category': 'category' },
              ExpressionAttributeValues: { ':category': options.category },
              ExclusiveStartKey: lastEvaluatedKey
            })
          )
        : await this.client.send(
            new ScanCommand({
              TableName: productsTable,
              ExclusiveStartKey: lastEvaluatedKey
            })
          );

      products.push(...(page.Items ?? []).map((item) => productSchema.parse(item)));
      lastEvaluatedKey = page.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    const search = options.search?.trim().toLocaleLowerCase('es');
    const now = Date.now();
    return products
      .filter(
        (product) =>
          product.stock > 0 &&
          new Date(product.expirationDate).getTime() > now &&
          (!search ||
            `${product.title} ${product.storeName}`.toLocaleLowerCase('es').includes(search))
      )
      .sort((left, right) => left.title.localeCompare(right.title, 'es'));
  }

  async getProductsByIds(ids: string[]): Promise<Product[]> {
    const products = await Promise.all(
      ids.map(async (id) => {
        const response = await this.client.send(
          new GetCommand({
            TableName: productsTable,
            Key: { id },
            ConsistentRead: true
          })
        );
        const item = response.Item;
        return item ? productSchema.parse(item) : undefined;
      })
    );
    return products.filter((product): product is Product => product !== undefined);
  }

  async createOrder(order: Order): Promise<void> {
    try {
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: [
            ...order.items.map((item) => ({
              Update: {
                TableName: productsTable,
                Key: { id: item.productId },
                UpdateExpression: 'SET #stock = #stock - :quantity',
                ConditionExpression:
                  '#stock >= :quantity AND #expirationDate > :createdAt',
                ExpressionAttributeNames: {
                  '#stock': 'stock',
                  '#expirationDate': 'expirationDate'
                },
                ExpressionAttributeValues: {
                  ':quantity': item.quantity,
                  ':createdAt': order.createdAt
                }
              }
            })),
            {
              Put: {
                TableName: ordersTable,
                Item: order,
                ConditionExpression: 'attribute_not_exists(id)'
              }
            }
          ]
        })
      );
    } catch (error: unknown) {
      if (error instanceof TransactionCanceledException) {
        throw new InventoryConflictError();
      }
      throw error;
    }
  }

  async getUserProfile(sub: string): Promise<UserProfile | undefined> {
    const response = await this.client.send(
      new GetCommand({
        TableName: usersTable,
        Key: { sub },
        ConsistentRead: true
      })
    );
    return response.Item ? userProfileSchema.parse(response.Item) : undefined;
  }

  async saveUserProfile(
    sub: string,
    email: string,
    profile: UpdateUserProfile
  ): Promise<UserProfile> {
    const saved: UserProfile = {
      sub,
      email,
      ...profile,
      updatedAt: new Date().toISOString()
    };
    await this.client.send(
      new PutCommand({
        TableName: usersTable,
        Item: saved
      })
    );
    return saved;
  }
}
