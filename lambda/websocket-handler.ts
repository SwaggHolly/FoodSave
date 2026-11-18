import { createHash, timingSafeEqual } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand
} from '@aws-sdk/lib-dynamodb';
import { orderSchema } from './src/domain/models/order.js';

interface WebSocketEvent {
  queryStringParameters?: Record<string, string | undefined> | null;
  requestContext: {
    connectionId: string;
    routeKey: string;
  };
}

interface WebSocketResponse {
  statusCode: number;
  body?: string;
}

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ordersTable = process.env['ORDERS_TABLE'] ?? '';
const connectionsTable = process.env['CONNECTIONS_TABLE'] ?? '';

function unauthorized(): WebSocketResponse {
  return { statusCode: 403, body: 'No autorizado.' };
}

export async function handler(event: WebSocketEvent): Promise<WebSocketResponse> {
  const { connectionId, routeKey } = event.requestContext;
  if (routeKey === '$disconnect') {
    await client.send(
      new DeleteCommand({ TableName: connectionsTable, Key: { connectionId } })
    );
    return { statusCode: 200 };
  }
  if (routeKey !== '$connect') return { statusCode: 400, body: 'Ruta no válida.' };

  const orderId = event.queryStringParameters?.['orderId'];
  const token = event.queryStringParameters?.['token'];
  if (!orderId || !token) return unauthorized();

  const response = await client.send(
    new GetCommand({
      TableName: ordersTable,
      Key: { id: orderId },
      ConsistentRead: true
    })
  );
  if (!response.Item) return unauthorized();
  const parsedOrder = orderSchema.safeParse(response.Item);
  const tokenHash = createHash('sha256').update(token).digest();
  const savedHash = parsedOrder.success
    ? Buffer.from(parsedOrder.data.statusSubscriptionTokenHash ?? '', 'hex')
    : Buffer.alloc(0);
  if (
    !parsedOrder.success ||
    savedHash.length !== tokenHash.length ||
    !timingSafeEqual(savedHash, tokenHash)
  ) {
    return unauthorized();
  }

  await client.send(
    new PutCommand({
      TableName: connectionsTable,
      Item: {
        connectionId,
        orderId,
        expiresAt: Math.floor(Date.now() / 1000) + 24 * 60 * 60
      }
    })
  );
  return { statusCode: 200, body: 'Conexión autorizada.' };
}
