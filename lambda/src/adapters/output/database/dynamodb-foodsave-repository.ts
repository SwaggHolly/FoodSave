import { createHash } from 'node:crypto';
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
import type { ScanCommandInput } from '@aws-sdk/lib-dynamodb';
import {
  orderSchema,
  type Order
} from '../../../domain/models/order.js';
import {
  merchantApplicationSchema,
  MerchantApplicationAlreadyExistsError,
  MerchantNotApprovedError,
  type MerchantApplication,
  type MerchantApplicationRequest
} from '../../../domain/models/merchant.js';
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
const rateLimitsTable = process.env.RATE_LIMITS_TABLE ?? 'FoodSaveRateLimits';
const merchantsTable = process.env.MERCHANTS_TABLE ?? 'FoodSaveMerchants';
const reservationRateLimit = 5;
const reservationWindowSeconds = 10 * 60;
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
          (!product.removeAt || new Date(product.removeAt).getTime() > now) &&
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
    const { statusSubscriptionToken: _statusSubscriptionToken, ...persistedOrder } = order;
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
                  '#stock >= :quantity AND #expirationDate > :createdAt AND (attribute_not_exists(#removeAt) OR #removeAt > :createdAt)',
                ExpressionAttributeNames: {
                  '#stock': 'stock',
                  '#expirationDate': 'expirationDate',
                  '#removeAt': 'removeAt'
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
                Item: persistedOrder,
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

  async getOrder(orderId: string): Promise<Order | undefined> {
    const response = await this.client.send(
      new GetCommand({
        TableName: ordersTable,
        Key: { id: orderId },
        ConsistentRead: true
      })
    );
    return response.Item ? orderSchema.parse(response.Item) : undefined;
  }

  async attachPaymentPreference(
    orderId: string,
    preferenceId: string,
    checkoutUrl: string
  ): Promise<void> {
    await this.client.send(
      new UpdateCommand({
        TableName: ordersTable,
        Key: { id: orderId },
        UpdateExpression: 'SET #preferenceId = :preferenceId, #checkoutUrl = :checkoutUrl',
        ConditionExpression: '#status = :pending',
        ExpressionAttributeNames: {
          '#preferenceId': 'paymentPreferenceId',
          '#checkoutUrl': 'checkoutUrl',
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':preferenceId': preferenceId,
          ':checkoutUrl': checkoutUrl,
          ':pending': 'pending_payment'
        }
      })
    );
  }

  async markOrderPaid(orderId: string, paymentId: string, paidAt: Date): Promise<boolean> {
    const paidAtIso = paidAt.toISOString();
    try {
      await this.client.send(
        new UpdateCommand({
          TableName: ordersTable,
          Key: { id: orderId },
          UpdateExpression:
            'SET #status = :paid, #paymentId = :paymentId, #paidAt = :paidAt',
          ConditionExpression:
            '#status = :pending AND #paymentExpiresAt > :paidAt',
          ExpressionAttributeNames: {
            '#status': 'status',
            '#paymentId': 'paymentId',
            '#paidAt': 'paidAt',
            '#paymentExpiresAt': 'paymentExpiresAt'
          },
          ExpressionAttributeValues: {
            ':paid': 'paid',
            ':paymentId': paymentId,
            ':paidAt': paidAtIso,
            ':pending': 'pending_payment'
          }
        })
      );
      return true;
    } catch (error: unknown) {
      if (!(error instanceof ConditionalCheckFailedException)) throw error;
      const current = await this.getOrder(orderId);
      return current?.status === 'paid' && current.paymentId === paymentId;
    }
  }

  async markOrderPaymentLate(
    orderId: string,
    paymentId: string,
    paidAt: Date
  ): Promise<void> {
    const paidAtIso = paidAt.toISOString();
    const order = await this.getOrder(orderId);
    if (!order) throw new Error('No se encontró la reserva del pago aprobado.');
    if (order.status === 'payment_late' && order.paymentId === paymentId) return;
    if (order.status === 'paid') {
      if (order.paymentId === paymentId) return;
      throw new Error('La reserva ya fue confirmada con otro pago.');
    }

    if (order.status === 'expired') {
      await this.client.send(
        new UpdateCommand({
          TableName: ordersTable,
          Key: { id: orderId },
          UpdateExpression:
            'SET #status = :late, #paymentId = :paymentId, #paidAt = :paidAt',
          ConditionExpression: '#status = :expired',
          ExpressionAttributeNames: {
            '#status': 'status',
            '#paymentId': 'paymentId',
            '#paidAt': 'paidAt'
          },
          ExpressionAttributeValues: {
            ':late': 'payment_late',
            ':expired': 'expired',
            ':paymentId': paymentId,
            ':paidAt': paidAtIso
          }
        })
      );
      return;
    }

    if (
      order.status !== 'pending_payment' ||
      order.paymentExpiresAt > paidAtIso
    ) {
      throw new Error('La reserva no está vencida ni puede recibir este pago.');
    }

    await this.releaseStockWithDeletedProducts(order, (stockUpdates) =>
      new TransactWriteCommand({
        TransactItems: [
          ...stockUpdates,
          {
            Update: {
              TableName: ordersTable,
              Key: { id: orderId },
              UpdateExpression:
                'SET #status = :late, #paymentId = :paymentId, #paidAt = :paidAt',
              ConditionExpression:
                '#status = :pending AND #paymentExpiresAt <= :paidAt',
              ExpressionAttributeNames: {
                '#status': 'status',
                '#paymentExpiresAt': 'paymentExpiresAt',
                '#paymentId': 'paymentId',
                '#paidAt': 'paidAt'
              },
              ExpressionAttributeValues: {
                ':late': 'payment_late',
                ':pending': 'pending_payment',
                ':paymentId': paymentId,
                ':paidAt': paidAtIso
              }
            }
          }
        ]
      })
    );
  }

  async expirePendingOrders(now: Date): Promise<number> {
    const nowIso = now.toISOString();
    let expiredCount = 0;
    for (const status of ['reserved', 'pending_payment'] as const) {
      let lastEvaluatedKey: Record<string, unknown> | undefined;
      do {
        const page = await this.client.send(
          new QueryCommand({
            TableName: ordersTable,
            IndexName: 'StatusExpiryIndex',
            KeyConditionExpression: '#status = :pending AND #paymentExpiresAt <= :now',
            ExpressionAttributeNames: {
              '#status': 'status',
              '#paymentExpiresAt': 'paymentExpiresAt'
            },
            ExpressionAttributeValues: {
              ':pending': status,
              ':now': nowIso
            },
            ExclusiveStartKey: lastEvaluatedKey
          })
        );
        for (const rawOrder of page.Items ?? []) {
          const order = orderSchema.parse(rawOrder);
          const released = await this.expireOrder(order, nowIso);
          if (released) expiredCount += 1;
        }
        lastEvaluatedKey = page.LastEvaluatedKey;
      } while (lastEvaluatedKey);
    }
    return expiredCount;
  }

  private async expireOrder(order: Order, nowIso: string): Promise<boolean> {
    try {
      await this.releaseStockWithDeletedProducts(order, (stockUpdates) =>
        new TransactWriteCommand({
          TransactItems: [
            ...stockUpdates,
            {
              Update: {
                TableName: ordersTable,
                Key: { id: order.id },
                UpdateExpression: 'SET #status = :expired, #expiredAt = :now',
                ConditionExpression:
                  '#status = :pending AND #paymentExpiresAt <= :now',
                ExpressionAttributeNames: {
                  '#status': 'status',
                  '#paymentExpiresAt': 'paymentExpiresAt',
                  '#expiredAt': 'expiredAt'
                },
                ExpressionAttributeValues: {
                  ':expired': 'expired',
                  ':pending': order.status,
                  ':now': nowIso
                }
              }
            }
          ]
        })
      );
      return true;
    } catch (error: unknown) {
      if (!(error instanceof TransactionCanceledException)) throw error;
      const current = await this.getOrder(order.id);
      if (
        current?.status !== order.status ||
        current.paymentExpiresAt > nowIso
      ) {
        return false;
      }
      throw error;
    }
  }

  private async releaseStockWithDeletedProducts(
    order: Order,
    transaction: (stockUpdates: NonNullable<ConstructorParameters<typeof TransactWriteCommand>[0]['TransactItems']>) => TransactWriteCommand
  ): Promise<void> {
    let missing = new Set<string>();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const updates = order.items.map((item) =>
        missing.has(item.productId)
          ? {
              ConditionCheck: {
                TableName: productsTable,
                Key: { id: item.productId },
                ConditionExpression: 'attribute_not_exists(id)'
              }
            }
          : {
              Update: {
                TableName: productsTable,
                Key: { id: item.productId },
                UpdateExpression: 'SET #stock = #stock + :quantity',
                ConditionExpression: 'attribute_exists(id)',
                ExpressionAttributeNames: { '#stock': 'stock' },
                ExpressionAttributeValues: { ':quantity': item.quantity }
              }
            }
      );
      try {
        await this.client.send(transaction(updates));
        return;
      } catch (error: unknown) {
        if (!(error instanceof TransactionCanceledException) || attempt === 2) throw error;
        const products = await this.getProductsByIds(order.items.map((item) => item.productId));
        const present = new Set(products.map((product) => product.id));
        const nextMissing = new Set(order.items.map((item) => item.productId).filter((id) => !present.has(id)));
        if (nextMissing.size === missing.size && [...nextMissing].every((id) => missing.has(id))) {
          throw error;
        }
        missing = nextMissing;
      }
    }
  }

  async deleteExpiredVegetables(now: Date): Promise<number> {
    const nowIso = now.toISOString();
    let deleted = 0;
    let lastEvaluatedKey: Record<string, unknown> | undefined;
    do {
      const page = await this.client.send(new QueryCommand({
        TableName: productsTable,
        IndexName: 'CategoryTitleIndex',
        KeyConditionExpression: '#category = :category',
        FilterExpression: '#removeAt <= :now',
        ExpressionAttributeNames: { '#category': 'category', '#removeAt': 'removeAt' },
        ExpressionAttributeValues: { ':category': 'verduras', ':now': nowIso },
        ExclusiveStartKey: lastEvaluatedKey
      }));
      for (const item of page.Items ?? []) {
        const product = productSchema.parse(item);
        try {
          await this.client.send(new DeleteCommand({
            TableName: productsTable,
            Key: { id: product.id },
            ConditionExpression: '#category = :category AND #removeAt <= :now',
            ExpressionAttributeNames: { '#category': 'category', '#removeAt': 'removeAt' },
            ExpressionAttributeValues: { ':category': 'verduras', ':now': nowIso }
          }));
          deleted += 1;
        } catch (error: unknown) {
          if (!(error instanceof ConditionalCheckFailedException)) throw error;
        }
      }
      lastEvaluatedKey = page.LastEvaluatedKey;
    } while (lastEvaluatedKey);
    return deleted;
  }

  async consumeReservationRateLimit(sourceIp: string, now: Date): Promise<boolean> {
    const window = Math.floor(now.getTime() / (reservationWindowSeconds * 1000));
    const windowEndsAt = (window + 1) * reservationWindowSeconds;
    const key = createHash('sha256')
      .update(`${sourceIp}:${window}`)
      .digest('hex');
    try {
      await this.client.send(
        new UpdateCommand({
          TableName: rateLimitsTable,
          Key: { key },
          UpdateExpression:
            'SET #requestCount = if_not_exists(#requestCount, :zero) + :one, #expiresAt = :expiresAt',
          ConditionExpression:
            'attribute_not_exists(#requestCount) OR #requestCount < :limit',
          ExpressionAttributeNames: {
            '#requestCount': 'requestCount',
            '#expiresAt': 'expiresAt'
          },
          ExpressionAttributeValues: {
            ':zero': 0,
            ':one': 1,
            ':limit': reservationRateLimit,
            ':expiresAt': windowEndsAt + 24 * 60 * 60
          }
        })
      );
      return true;
    } catch (error: unknown) {
      if (error instanceof ConditionalCheckFailedException) return false;
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
    const acceptedAt = new Date().toISOString();
    const saved: UserProfile = {
      sub,
      email,
      ...profile,
      privacyAcceptedAt: acceptedAt,
      updatedAt: acceptedAt
    };
    await this.client.send(
      new PutCommand({
        TableName: usersTable,
        Item: saved
      })
    );
    return saved;
  }

  async getMerchantApplication(sub: string): Promise<MerchantApplication | undefined> {
    const response = await this.client.send(
      new GetCommand({
        TableName: merchantsTable,
        Key: { sub },
        ConsistentRead: true
      })
    );
    if (!response.Item) return undefined;
    const application = merchantApplicationSchema.parse(response.Item);
    if (application.status !== 'pending_review') return application;
    try {
      const updated = await this.client.send(new UpdateCommand({
        TableName: merchantsTable,
        Key: { sub },
        UpdateExpression: 'SET #status = :approved, #updatedAt = :now',
        ConditionExpression: '#status = :pending',
        ExpressionAttributeNames: { '#status': 'status', '#updatedAt': 'updatedAt' },
        ExpressionAttributeValues: {
          ':approved': 'approved',
          ':pending': 'pending_review',
          ':now': new Date().toISOString()
        },
        ReturnValues: 'ALL_NEW'
      }));
      return merchantApplicationSchema.parse(updated.Attributes);
    } catch (error: unknown) {
      if (!(error instanceof ConditionalCheckFailedException)) throw error;
      const current = await this.client.send(new GetCommand({
        TableName: merchantsTable, Key: { sub }, ConsistentRead: true
      }));
      return current.Item ? merchantApplicationSchema.parse(current.Item) : undefined;
    }
  }

  async createMerchantApplication(
    sub: string,
    input: MerchantApplicationRequest,
    now: Date
  ): Promise<MerchantApplication> {
    const timestamp = now.toISOString();
    const application: MerchantApplication = {
      sub,
      ...input,
      status: 'approved',
      createdAt: timestamp,
      updatedAt: timestamp
    };
    try {
      await this.client.send(
        new PutCommand({
          TableName: merchantsTable,
          Item: application,
          ConditionExpression: 'attribute_not_exists(sub)'
        })
      );
      return application;
    } catch (error: unknown) {
      if (error instanceof ConditionalCheckFailedException) {
        throw new MerchantApplicationAlreadyExistsError();
      }
      throw error;
    }
  }

  async reviewMerchantApplication(
    sub: string,
    status: 'approved' | 'rejected',
    reviewerSub: string,
    now: Date
  ): Promise<MerchantApplication | undefined> {
    try {
      const response = await this.client.send(
        new UpdateCommand({
          TableName: merchantsTable,
          Key: { sub },
          UpdateExpression:
            'SET #status = :status, #updatedAt = :updatedAt, #reviewedBy = :reviewedBy',
          ConditionExpression: '#status = :pending',
          ExpressionAttributeNames: {
            '#status': 'status',
            '#updatedAt': 'updatedAt',
            '#reviewedBy': 'reviewedBy'
          },
          ExpressionAttributeValues: {
            ':status': status,
            ':pending': 'pending_review',
            ':updatedAt': now.toISOString(),
            ':reviewedBy': reviewerSub
          },
          ReturnValues: 'ALL_NEW'
        })
      );
      return response.Attributes
        ? merchantApplicationSchema.parse(response.Attributes)
        : undefined;
    } catch (error: unknown) {
      if (error instanceof ConditionalCheckFailedException) return undefined;
      throw error;
    }
  }

  async createMerchantProduct(product: Product): Promise<void> {
    if (!product.merchantId) {
      throw new MerchantNotApprovedError();
    }
    try {
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              ConditionCheck: {
                TableName: merchantsTable,
                Key: { sub: product.merchantId },
                ConditionExpression: '#status = :approved',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: { ':approved': 'approved' }
              }
            },
            {
              Put: {
                TableName: productsTable,
                Item: product,
                ConditionExpression: 'attribute_not_exists(id)'
              }
            }
          ]
        })
      );
    } catch (error: unknown) {
      if (error instanceof TransactionCanceledException) {
        throw new MerchantNotApprovedError();
      }
      throw error;
    }
  }
}
