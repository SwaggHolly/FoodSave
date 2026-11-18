import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Order } from './src/domain/models/order.js';
import type { Product } from './src/domain/models/product.js';
import type { UserProfile } from './src/domain/models/user-profile.js';
import type {
  FoodSaveRepository,
  ProductListOptions
} from './src/ports/output/foodsave-repository.js';
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
  queryStringParameters?: Record<string, string>,
  identity?: { sub: string; email: string }
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
      ...(identity
        ? {
            authorizer: {
              jwt: {
                claims: identity,
                scopes: []
              }
            }
          }
        : {}),
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
  const profiles: UserProfile[] = [];
  const listOptions: ProductListOptions[] = [];
  const repository: FoodSaveRepository = {
    listProducts: async (options) => {
      listOptions.push(options);
      return [product];
    },
    getProductsByIds: async (ids) =>
      ids.includes(product.id) ? [product] : [],
    createOrder: async (order) => {
      orders.push(order);
    },
    getUserProfile: async (sub) => profiles.find((profile) => profile.sub === sub),
    saveUserProfile: async (sub, email, profile) => {
      const saved = { sub, email, ...profile, updatedAt: '2026-11-17T12:00:00.000Z' };
      const index = profiles.findIndex((entry) => entry.sub === sub);
      if (index >= 0) profiles[index] = saved;
      else profiles.push(saved);
      return saved;
    }
  };
  return { repository, orders, listOptions, profiles };
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

test('returns health without querying the repository', async () => {
  const { repository, listOptions } = createRepository();
  const response = await createApiHandler(repository)(event('GET', '/health'));

  assert.equal(response.statusCode, 200);
  assert.deepEqual(responseBody(response), {
    status: 'ok',
    service: 'foodsave-api'
  });
  assert.equal(listOptions.length, 0);
});

test('passes trimmed catalog filters to the repository', async () => {
  const { repository, listOptions } = createRepository();
  const response = await createApiHandler(repository)(
    event('GET', '/products', undefined, {
      category: ' frutas ',
      search: ' manzanas '
    })
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(listOptions, [{ category: 'frutas', search: 'manzanas' }]);
});

test('rejects invalid catalog filters without querying the repository', async () => {
  const { repository, listOptions } = createRepository();
  const handler = createApiHandler(repository);

  const invalidCategory = await handler(
    event('GET', '/products', undefined, { category: 'comidas' })
  );
  const longSearch = await handler(
    event('GET', '/products', undefined, { search: 'a'.repeat(101) })
  );

  assert.equal(invalidCategory.statusCode, 400);
  assert.equal(longSearch.statusCode, 400);
  assert.equal(listOptions.length, 0);
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

test('rejects malformed JSON before reaching the repository', async () => {
  const { repository, orders } = createRepository();
  const response = await createApiHandler(repository)(
    event('POST', '/orders', '{not-json')
  );

  assert.equal(response.statusCode, 400);
  assert.equal(orders.length, 0);
});

test('accepts a base64-encoded reservation request', async () => {
  const { repository, orders } = createRepository();
  const request = {
    buyerName: 'Ana Pérez',
    buyerPhone: '+573001234567',
    items: [{ productId: product.id, quantity: 2 }]
  };
  const response = await createApiHandler(repository)({
    ...event('POST', '/orders'),
    body: Buffer.from(JSON.stringify(request)).toString('base64'),
    isBase64Encoded: true
  });

  assert.equal(response.statusCode, 201);
  assert.equal(orders.length, 1);
  assert.equal(orders[0]?.total, 9600);
  assert.deepEqual(orders[0]?.delivery, { method: 'pickup' });
  const receipt = responseBody(response) as {
    orderId: string;
    status: string;
    total: number;
  };
  assert.equal(typeof receipt.orderId, 'string');
  assert.equal(receipt.status, 'reserved');
  assert.equal(receipt.total, 9600);
});

test('maps unavailable products and inventory conflicts to their HTTP statuses', async () => {
  const unavailable = createRepository();
  unavailable.repository.getProductsByIds = async () => [];
  const notFound = await createApiHandler(unavailable.repository)(
    event(
      'POST',
      '/orders',
      JSON.stringify({
        buyerName: 'Ana Pérez',
        buyerPhone: '+573001234567',
        items: [{ productId: product.id, quantity: 1 }]
      })
    )
  );

  const outOfStock = createRepository();
  outOfStock.repository.getProductsByIds = async () => [{ ...product, stock: 0 }];
  const conflict = await createApiHandler(outOfStock.repository)(
    event(
      'POST',
      '/orders',
      JSON.stringify({
        buyerName: 'Ana Pérez',
        buyerPhone: '+573001234567',
        items: [{ productId: product.id, quantity: 1 }]
      })
    )
  );

  assert.equal(notFound.statusCode, 404);
  assert.equal(unavailable.orders.length, 0);
  assert.equal(conflict.statusCode, 409);
  assert.equal(outOfStock.orders.length, 0);
});

test('returns not found for unknown routes', async () => {
  const { repository } = createRepository();
  const response = await createApiHandler(repository)(event('GET', '/unknown'));

  assert.equal(response.statusCode, 404);
});

test('requires an authenticated identity to read a user profile', async () => {
  const { repository } = createRepository();
  const response = await createApiHandler(repository)(event('GET', '/profile'));

  assert.equal(response.statusCode, 401);
});

test('returns only the profile associated with the authenticated subject', async () => {
  const { repository, profiles } = createRepository();
  profiles.push({
    sub: 'cognito-user-123',
    name: 'Ana Pérez',
    email: 'ana@example.com',
    phone: '+573001234567',
    updatedAt: '2026-11-17T12:00:00.000Z'
  });

  const response = await createApiHandler(repository)(
    event('GET', '/profile', undefined, undefined, {
      sub: 'cognito-user-123',
      email: 'ana@example.com'
    })
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(responseBody(response), profiles[0]);
});

test('saves a validated profile using the authenticated email claim', async () => {
  const { repository, profiles } = createRepository();
  const response = await createApiHandler(repository)(
    event(
      'PUT',
      '/profile',
      JSON.stringify({ name: 'Ana Pérez', phone: '+573001234567', email: 'attacker@example.com' }),
      undefined,
      { sub: 'cognito-user-123', email: 'ana@example.com' }
    )
  );

  assert.equal(response.statusCode, 200);
  assert.equal(profiles[0]?.email, 'ana@example.com');
  assert.equal(profiles[0]?.sub, 'cognito-user-123');
  assert.equal(profiles[0]?.name, 'Ana Pérez');
});

test('rejects invalid profile data without writing it', async () => {
  const { repository, profiles } = createRepository();
  const response = await createApiHandler(repository)(
    event(
      'PUT',
      '/profile',
      JSON.stringify({ name: 'A', phone: 'not-a-phone' }),
      undefined,
      { sub: 'cognito-user-123', email: 'ana@example.com' }
    )
  );

  assert.equal(response.statusCode, 400);
  assert.equal(profiles.length, 0);
});
