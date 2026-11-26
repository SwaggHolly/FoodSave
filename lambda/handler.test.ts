import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type { Order } from './src/domain/models/order.js';
import type { Product } from './src/domain/models/product.js';
import type { UserProfile } from './src/domain/models/user-profile.js';
import { PRIVACY_POLICY_VERSION } from './src/domain/models/privacy.js';
import type {
  FoodSaveRepository,
  ProductListOptions
} from './src/ports/output/foodsave-repository.js';
import { createApiHandler as createApiHandlerWithDependencies } from './handler.js';
import type { PaymentGateway } from './src/adapters/output/payment/mercado-pago-payment-gateway.js';
import type { ImageStorage } from './src/adapters/output/storage/s3-image-storage.js';
import { merchantProductExpirationError } from './src/domain/models/merchant.js';

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

const testPaymentGateway: PaymentGateway = {
  isConfigured: () => true,
  createCheckout: async () => ({
    preferenceId: 'preference-123',
    checkoutUrl: 'https://mercadopago.example/checkout'
  }),
  verifyWebhookSignature: () => true,
  getPayment: async (paymentId) => ({
    id: paymentId,
    status: 'approved',
    orderId: 'order-123',
    amount: 9600,
    currency: 'COP'
  })
};

function createApiHandler(repository: FoodSaveRepository) {
  return createApiHandlerWithDependencies(repository, testPaymentGateway);
}

function event(
  method: string,
  path: string,
  body?: string,
  queryStringParameters?: Record<string, string>,
  identity?: {
    sub: string;
    email: string;
    'custom:privacy_version'?: string;
    'cognito:groups'?: string[];
  }
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
    consumeReservationRateLimit: async () => true,
    getOrder: async () => undefined,
    attachPaymentPreference: async () => undefined,
    markOrderPaid: async () => true,
    expirePendingOrders: async () => 0,
    getUserProfile: async (sub) => profiles.find((profile) => profile.sub === sub),
    saveUserProfile: async (sub, email, profile) => {
      const saved = { sub, email, ...profile, updatedAt: '2026-11-17T12:00:00.000Z' };
      const index = profiles.findIndex((entry) => entry.sub === sub);
      if (index >= 0) profiles[index] = saved;
      else profiles.push(saved);
      return saved;
    },
    getMerchantApplication: async () => undefined,
    createMerchantApplication: async (sub, input, now) => ({
      sub,
      ...input,
      status: 'approved',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    }),
    reviewMerchantApplication: async () => undefined,
    createMerchantProduct: async () => undefined
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
    privacyPolicyVersion: PRIVACY_POLICY_VERSION,
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
    reservationExpiresAt: string;
    items: Array<{ title: string; quantity: number; lineTotal: number }>;
    statusSubscriptionToken: string;
  };
  assert.equal(typeof receipt.orderId, 'string');
  assert.equal(receipt.status, 'reserved');
  assert.equal(receipt.total, 9600);
  assert.equal(receipt.items[0]?.lineTotal, 9600);
  assert.equal(typeof receipt.reservationExpiresAt, 'string');
  assert.match(receipt.statusSubscriptionToken, /^[A-Za-z0-9_-]{43}$/);
});

test('returns only the order status for a valid private tracking token', async () => {
  const { repository } = createRepository();
  const token = 'private-order-status-token';
  const order: Order = {
    id: 'order-123',
    buyerName: 'Ana Pérez',
    buyerPhone: '+573001234567',
    privacyPolicyVersion: PRIVACY_POLICY_VERSION,
    privacyAcceptedAt: new Date().toISOString(),
    status: 'paid',
    items: [],
    total: 9600,
    createdAt: new Date().toISOString(),
    paymentExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    statusSubscriptionTokenHash: createHash('sha256').update(token).digest('hex')
  };
  repository.getOrder = async () => order;

  const response = await createApiHandler(repository)({
    ...event('GET', '/orders/order-123/status'),
    headers: { 'x-order-token': token }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(responseBody(response), {
    orderId: order.id,
    status: order.status,
    paymentExpiresAt: order.paymentExpiresAt
  });
});

test('does not disclose order status to an invalid tracking token', async () => {
  const { repository } = createRepository();
  repository.getOrder = async () => ({
    id: 'order-123',
    buyerName: 'Ana Pérez',
    buyerPhone: '+573001234567',
    privacyPolicyVersion: PRIVACY_POLICY_VERSION,
    privacyAcceptedAt: new Date().toISOString(),
    status: 'paid',
    items: [],
    total: 9600,
    createdAt: new Date().toISOString(),
    paymentExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    statusSubscriptionTokenHash: createHash('sha256').update('valid-token').digest('hex')
  });

  const response = await createApiHandler(repository)({
    ...event('GET', '/orders/order-123/status'),
    headers: { 'x-order-token': 'wrong-token' }
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(responseBody(response), {
    message: 'El token de consulta del pedido no es válido.'
  });
});

test('returns 429 before reserving when the source has exceeded the limit', async () => {
  const { repository, orders } = createRepository();
  repository.consumeReservationRateLimit = async (sourceIp) => sourceIp !== '127.0.0.1';
  const response = await createApiHandler(repository)(
    event(
      'POST',
      '/orders',
      JSON.stringify({
        buyerName: 'Ana Pérez',
        buyerPhone: '+573001234567',
        privacyPolicyVersion: PRIVACY_POLICY_VERSION,
        items: [{ productId: product.id, quantity: 1 }]
      })
    )
  );

  assert.equal(response.statusCode, 429);
  assert.equal(orders.length, 0);
});

test('reserves inventory without configuring Mercado Pago', async () => {
  const { repository, orders } = createRepository();
  const response = await createApiHandlerWithDependencies(repository, {
    ...testPaymentGateway,
    isConfigured: () => false
  })(
    event(
      'POST',
      '/orders',
      JSON.stringify({
        buyerName: 'Ana Pérez',
        buyerPhone: '+573001234567',
        privacyPolicyVersion: PRIVACY_POLICY_VERSION,
        items: [{ productId: product.id, quantity: 1 }]
      })
    )
  );

  assert.equal(response.statusCode, 201);
  assert.equal(orders.length, 1);
  assert.equal(orders[0]?.status, 'reserved');
});

test('confirms an order only after a valid Mercado Pago webhook', async () => {
  const { repository } = createRepository();
  const order: Order = {
    id: 'order-123',
    buyerName: 'Ana Pérez',
    buyerPhone: '+573001234567',
    privacyPolicyVersion: PRIVACY_POLICY_VERSION,
    privacyAcceptedAt: new Date().toISOString(),
    status: 'pending_payment',
    items: [],
    total: 9600,
    createdAt: new Date().toISOString(),
    paymentExpiresAt: new Date(Date.now() + 60_000).toISOString()
  };
  let confirmedPaymentId = '';
  repository.getOrder = async () => order;
  repository.markOrderPaid = async (_orderId, paymentId) => {
    confirmedPaymentId = paymentId;
    return true;
  };
  const response = await createApiHandler(repository)({
    ...event(
      'POST',
      '/webhooks/mercadopago',
      JSON.stringify({ data: { id: 'payment-456' } })
    ),
    headers: {
      'x-signature': 'verified-by-test-gateway',
      'x-request-id': 'request-789'
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(confirmedPaymentId, 'payment-456');
  assert.deepEqual(responseBody(response), { received: true, status: 'paid' });
});

test('rejects Mercado Pago webhooks with an invalid signature', async () => {
  const { repository } = createRepository();
  let fetchedPayment = false;
  const response = await createApiHandlerWithDependencies(repository, {
    ...testPaymentGateway,
    verifyWebhookSignature: () => false,
    getPayment: async () => {
      fetchedPayment = true;
      throw new Error('Untrusted webhook must not fetch a payment.');
    }
  })({
    ...event(
      'POST',
      '/webhooks/mercadopago',
      JSON.stringify({ data: { id: 'payment-456' } })
    ),
    headers: {
      'x-signature': 'invalid',
      'x-request-id': 'request-789'
    }
  });

  assert.equal(response.statusCode, 401);
  assert.equal(fetchedPayment, false);
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
        privacyPolicyVersion: PRIVACY_POLICY_VERSION,
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
        privacyPolicyVersion: PRIVACY_POLICY_VERSION,
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
      email: 'ana@example.com',
      'custom:privacy_version': PRIVACY_POLICY_VERSION
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
      JSON.stringify({
        name: 'Ana Pérez',
        phone: '+573001234567',
        privacyPolicyVersion: PRIVACY_POLICY_VERSION,
        email: 'attacker@example.com'
      }),
      undefined,
      {
        sub: 'cognito-user-123',
        email: 'ana@example.com',
        'custom:privacy_version': PRIVACY_POLICY_VERSION
      }
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
      {
        sub: 'cognito-user-123',
        email: 'ana@example.com',
        'custom:privacy_version': PRIVACY_POLICY_VERSION
      }
    )
  );

  assert.equal(response.statusCode, 400);
  assert.equal(profiles.length, 0);
});

test('requires the current privacy policy claim for profile access', async () => {
  const { repository } = createRepository();
  const response = await createApiHandler(repository)(
    event('GET', '/profile', undefined, undefined, {
      sub: 'cognito-user-123',
      email: 'ana@example.com',
      'custom:privacy_version': 'old-version'
    })
  );

  assert.equal(response.statusCode, 403);
});

test('creates a merchant application tied to the authenticated user', async () => {
  const { repository } = createRepository();
  const response = await createApiHandler(repository)(
    event(
      'POST',
      '/merchant/application',
      JSON.stringify({
        storeName: 'Fruver del barrio',
        ownerName: 'Ana Pérez',
        contactEmail: 'tienda@example.com',
        phone: '+573001234567',
        city: 'Bogotá',
        address: 'Carrera 7 # 45-10'
      }),
      undefined,
      {
        sub: 'cognito-user-123',
        email: 'ana@example.com',
        'custom:privacy_version': PRIVACY_POLICY_VERSION
      }
    )
  );

  assert.equal(response.statusCode, 201);
  assert.equal((responseBody(response) as { sub: string }).sub, 'cognito-user-123');
  assert.equal((responseBody(response) as { status: string }).status, 'approved');
});

test('requires the FoodSaveAdmins Cognito group to review an application', async () => {
  const { repository } = createRepository();
  const response = await createApiHandler(repository)(
    event(
      'PUT',
      '/admin/merchant-applications/cognito-user-123/decision',
      JSON.stringify({ status: 'approved' }),
      undefined,
      {
        sub: 'regular-user',
        email: 'user@example.com',
        'custom:privacy_version': PRIVACY_POLICY_VERSION
      }
    )
  );

  assert.equal(response.statusCode, 403);
});

test('creates products only for approved merchants and their uploaded images', async () => {
  const { repository } = createRepository();
  let createdProduct: Product | undefined;
  repository.getMerchantApplication = async (sub) => ({
    sub,
    storeName: 'Fruver del barrio',
    ownerName: 'Ana Pérez',
    contactEmail: 'tienda@example.com',
    phone: '+573001234567',
    city: 'Bogotá',
    address: 'Carrera 7 # 45-10',
    description: '',
    status: 'approved',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  repository.createMerchantProduct = async (product) => {
    createdProduct = product;
  };
  const imageStorage: ImageStorage = {
    isConfigured: () => true,
    createUpload: async () => ({
      key: 'merchant-images/cognito-user-123/a.webp',
      url: 'https://images.example.com',
      fields: { key: 'merchant-images/cognito-user-123/a.webp' }
    }),
    createReadUrl: async () => 'https://images.example.com/signed-image',
    imageExists: async () => true
  };
  const response = await createApiHandlerWithDependencies(
    repository,
    testPaymentGateway,
    imageStorage
  )(
    event(
      'POST',
      '/merchant/products',
      JSON.stringify({
        title: 'Lechuga fresca',
        category: 'verduras',
        originalPrice: 12000,
        discountPrice: 4800,
        expirationDate: new Date(Date.now() + 86_400_000).toISOString(),
        stock: 5,
        imageKey: 'merchant-images/cognito-user-123/a.webp'
      }),
      undefined,
      {
        sub: 'cognito-user-123',
        email: 'ana@example.com',
        'custom:privacy_version': PRIVACY_POLICY_VERSION
      }
    )
  );

  assert.equal(response.statusCode, 201);
  assert.equal(createdProduct?.storeName, 'Fruver del barrio');
  assert.equal(createdProduct?.merchantId, 'cognito-user-123');
  assert.equal(createdProduct?.imageUrl, 'https://images.example.com/signed-image');
  assert.equal(Date.parse(createdProduct?.removeAt ?? '') - Date.parse(createdProduct?.publishedAt ?? ''), 48 * 3_600_000);
});

test('enforces the precise publication windows for vegetables and other products', () => {
  const now = new Date('2026-11-25T12:00:00.000Z');
  for (const [category, days] of [['verduras', 2], ['frutas', 5]] as const) {
    const expires = (offset: number) => new Date(now.getTime() + offset).toISOString();
    assert.equal(merchantProductExpirationError({ category, expirationDate: expires(days * 86_400_000) }, now), undefined);
    assert.match(merchantProductExpirationError({ category, expirationDate: expires(days * 86_400_000 + 1) }, now) ?? '', new RegExp(`${days} días`));
    assert.match(merchantProductExpirationError({ category, expirationDate: expires(0) }, now) ?? '', /futuro/);
  }
});

test('refuses to publish a vegetable outside its window before checking its image', async () => {
  const { repository } = createRepository();
  repository.getMerchantApplication = async (sub) => ({
    sub, storeName: 'Tienda', ownerName: 'Ana Pérez', contactEmail: 'ana@example.com',
    phone: '+573001234567', city: 'Bogotá', address: 'Carrera 7 # 45-10',
    description: '', status: 'approved', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  });
  let published = false;
  repository.createMerchantProduct = async () => { published = true; };
  const imageStorage: ImageStorage = {
    isConfigured: () => true,
    createUpload: async () => { throw new Error('No debe llamarse'); },
    createReadUrl: async () => { throw new Error('No debe llamarse'); },
    imageExists: async () => { throw new Error('No debe llamarse'); }
  };
  const response = await createApiHandlerWithDependencies(repository, testPaymentGateway, imageStorage)(
    event('POST', '/merchant/products', JSON.stringify({
      title: 'Lechuga', category: 'verduras', originalPrice: 5000, discountPrice: 2000,
      expirationDate: new Date(Date.now() + 3 * 86_400_000).toISOString(), stock: 1,
      imageKey: 'merchant-images/user/a.webp'
    }), undefined, { sub: 'user', email: 'ana@example.com', 'custom:privacy_version': PRIVACY_POLICY_VERSION })
  );
  assert.equal(response.statusCode, 400);
  assert.equal(published, false);
});
