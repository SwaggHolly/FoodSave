import {
  ApiGatewayManagementApiClient,
  GoneException,
  PostToConnectionCommand
} from '@aws-sdk/client-apigatewaymanagementapi';
import { DynamoDBClient, type AttributeValue as DynamoAttributeValue } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import type { AttributeValue as StreamAttributeValue, DynamoDBStreamHandler } from 'aws-lambda';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { orderSchema } from './src/domain/models/order.js';

const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sesClient = new SESv2Client({});
const connectionsTable = process.env['CONNECTIONS_TABLE'] ?? '';
const fromEmail = process.env['NOTIFICATION_FROM_EMAIL'] ?? '';
const websocketEndpoint = process.env['WEBSOCKET_MANAGEMENT_URL'] ?? '';

function toDynamoAttribute(value: StreamAttributeValue): DynamoAttributeValue {
  if (value.B !== undefined) return { B: Buffer.from(value.B, 'base64') };
  if (value.BS !== undefined) return { BS: value.BS.map((item) => Buffer.from(item, 'base64')) };
  if (value.L !== undefined) return { L: value.L.map(toDynamoAttribute) };
  if (value.M !== undefined) {
    return { M: Object.fromEntries(Object.entries(value.M).map(([key, item]) => [key, toDynamoAttribute(item)])) };
  }
  return value;
}

async function notifyConnectedClients(
  orderId: string,
  status: string,
  paymentExpiresAt: string
): Promise<void> {
  const response = await documentClient.send(
    new QueryCommand({
      TableName: connectionsTable,
      IndexName: 'OrderIdIndex',
      KeyConditionExpression: 'orderId = :orderId',
      ExpressionAttributeValues: { ':orderId': orderId }
    })
  );
  if (!response.Items?.length) return;

  const managementClient = new ApiGatewayManagementApiClient({
    endpoint: websocketEndpoint
  });
  await Promise.all(
    response.Items.map(async (connection) => {
      const connectionId = connection['connectionId'];
      if (typeof connectionId !== 'string') return;
      try {
        await managementClient.send(
          new PostToConnectionCommand({
            ConnectionId: connectionId,
            Data: Buffer.from(JSON.stringify({ orderId, status, paymentExpiresAt }))
          })
        );
      } catch (error: unknown) {
        if (!(error instanceof GoneException)) throw error;
        await documentClient.send(
          new DeleteCommand({
            TableName: connectionsTable,
            Key: { connectionId }
          })
        );
      }
    })
  );
}

async function emailOrderConfirmation(
  email: string,
  orderId: string,
  total: number
): Promise<void> {
  if (!fromEmail) throw new Error('NOTIFICATION_FROM_EMAIL no está configurado.');
  await sesClient.send(
    new SendEmailCommand({
      FromEmailAddress: fromEmail,
      Destination: { ToAddresses: [email] },
      Content: {
        Simple: {
          Subject: { Data: 'Tu pago en FoodSave fue confirmado', Charset: 'UTF-8' },
          Body: {
            Text: {
              Data: `Confirmamos el pago de tu pedido ${orderId} por ${new Intl.NumberFormat(
                'es-CO',
                { style: 'currency', currency: 'COP' }
              ).format(total)}. Gracias por ayudar a reducir el desperdicio de alimentos.`,
              Charset: 'UTF-8'
            }
          }
        }
      }
    })
  );
}

export const handler: DynamoDBStreamHandler = async (event) => {
  for (const record of event.Records) {
    const oldImage = record.dynamodb?.OldImage;
    const newImage = record.dynamodb?.NewImage;
    if (!oldImage || !newImage) continue;

    const oldStatus = oldImage['status']?.S;
    const image = Object.fromEntries(
      Object.entries(newImage).map(([key, value]) => [key, toDynamoAttribute(value)])
    );
    const parsedOrder = orderSchema.safeParse(unmarshall(image));
    if (!parsedOrder.success || parsedOrder.data.status === oldStatus) continue;

    const order = parsedOrder.data;
    await notifyConnectedClients(order.id, order.status, order.paymentExpiresAt);
    if (order.status === 'paid' && order.buyerEmail) {
      await emailOrderConfirmation(order.buyerEmail, order.id, order.total);
    }
  }
};
