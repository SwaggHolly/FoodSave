import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Order } from './src/domain/models/order.js';
import type { Product } from './src/domain/models/product.js';
import type { FoodSaveRepository } from './src/ports/output/foodsave-repository.js';
import { createApiHandler } from './handler.js';

const product: Product = {
  id: 'apple-1',
  title: 'Manzanas rojas',
  storeName: 'Fruver local',
  category: 'frutas',
  originalPrice: 12000,
  discountPrice: 4800,
  expirationDate: '2027-01-02T00:00:00.000Z',
  stock: 5,
  imageUrl: 'https://example.com/apples.jpg'
};

function event(
  method: string,
  path: string,
  body?: string,
  queryStringParameters?: Record<string, string>
): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: `${method} ${path}`,
    rawPath: path,
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: 'test',
      apiId: 'test',
      domainName: 'localhost',
      domainPrefix: 'localhost',
      http: {
        method,
        path,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'vitest'
      },
      requestId: 'test',
      routeKey: `${method} ${path}`,
      stage: '$default',
      time: '2026-11-17T12:00:00Z',
      timeEpoch: 0
    },
    isBase64Encoded: false,
    ...(body === undefined ? {} : { body }),
    ...(queryStringParameters === undefined ? {} : { queryStringParameters })
  };
}

function createRepository() {
  const orders: Order[] = [];
  const repository: FoodSaveRepository = {
    listProducts: async () => [product],
    getProductsByIds: async (ids) =>
      ids.includes(product.id) ? [product] : [],
    createOrder: async (order) => {
      orders.push(order);
    }
  };
  return { repository, orders };
}

function responseBody(response: { body?: string }): unknown {
  return JSON.parse(response.body ?? '{}');
}

test('returns products from the catalog route', async () => {
  const { repository } = createRepository();
  const handler = createApiHandler(repository);
  const response = await handler(event('GET', '/products'));

  assert.equal(response.statusCode, 200);
  assert.deepEqual(responseBody(response), { products: [product] });
});

test('rejects an invalid order before reaching the repository', async () => {
  const { repository, orders } = createRepository();
  const handler = createApiHandler(repository);
  const response = await handler(
    event('POST', '/orders', JSON.stringify({ items: [] }))
  );

  assert.equal(response.statusCode, 400);
  assert.equal(orders.length, 0);
});
