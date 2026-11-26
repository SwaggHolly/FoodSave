import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type { Order } from '../models/order.js';
import type { Product } from '../models/product.js';
import type { FoodSaveRepository } from '../../ports/output/foodsave-repository.js';
import { PRIVACY_POLICY_VERSION } from '../models/privacy.js';
import {
  InventoryConflictError,
  ProductNotFoundError,
  ReserveOrderService
} from './reserve-order.js';

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

function createRepository(availableProducts: Product[]) {
  const createdOrders: Order[] = [];
  const repository: FoodSaveRepository = {
    listProducts: async () => availableProducts,
    getProductsByIds: async (ids) =>
      availableProducts.filter((availableProduct) => ids.includes(availableProduct.id)),
    createOrder: async (order) => {
      createdOrders.push(order);
    },
    consumeReservationRateLimit: async () => true,
    getOrder: async () => undefined,
    attachPaymentPreference: async () => undefined,
    markOrderPaid: async () => true,
    expirePendingOrders: async () => 0,
    getUserProfile: async () => undefined,
    saveUserProfile: async (sub, email, profile) => ({
      sub,
      email,
      ...profile,
      updatedAt: new Date().toISOString()
    }),
    getMerchantApplication: async () => undefined,
    createMerchantApplication: async (sub, input, now) => ({
      sub,
      ...input,
      status: 'pending_review',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    }),
    reviewMerchantApplication: async () => undefined,
    createMerchantProduct: async () => undefined
  };
  return { repository, createdOrders };
}

const request = {
  buyerName: 'Ana Pérez',
  buyerPhone: '+573001234567',
  privacyPolicyVersion: PRIVACY_POLICY_VERSION,
  items: [{ productId: 'apple-1', quantity: 2 }]
};

test('uses the server price and records the reservation atomically', async () => {
  const { repository, createdOrders } = createRepository([product]);
  const service = new ReserveOrderService(
    repository,
    () => new Date('2026-11-17T12:00:00.000Z'),
    () => 'order-123'
  );

  const receipt = await service.execute(request);
  const { statusSubscriptionToken, ...receiptDetails } = receipt;

  assert.deepEqual(receiptDetails, {
    orderId: 'order-123',
    status: 'reserved',
    total: 9600,
    createdAt: '2026-11-17T12:00:00.000Z',
    reservationExpiresAt: '2026-11-17T12:15:00.000Z',
    items: [{ productId: 'apple-1', title: 'Manzanas rojas', quantity: 2, unitPrice: 4800, lineTotal: 9600 }]
  });
  assert.match(statusSubscriptionToken, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(createdOrders.length, 1);
  assert.equal(createdOrders[0]?.items[0]?.unitPrice, 4800);
  assert.equal(createdOrders[0]?.items[0]?.quantity, 2);
  assert.equal(createdOrders[0]?.privacyPolicyVersion, PRIVACY_POLICY_VERSION);
  assert.equal(createdOrders[0]?.privacyAcceptedAt, '2026-11-17T12:00:00.000Z');
  assert.equal(createdOrders[0]?.paymentExpiresAt, '2026-11-17T12:15:00.000Z');
  assert.equal(
    createdOrders[0]?.statusSubscriptionTokenHash,
    createHash('sha256').update(statusSubscriptionToken).digest('hex')
  );
  assert.deepEqual(createdOrders[0]?.delivery, { method: 'pickup' });
});

test('stores the delivery address with the reservation', async () => {
  const { repository, createdOrders } = createRepository([product]);
  const delivery = {
    method: 'delivery' as const,
    city: 'Bogotá',
    zone: 'Norte',
    neighborhood: 'Chapinero',
    address: 'Carrera 7 # 45-10',
    reference: 'Torre 2'
  };
  const service = new ReserveOrderService(
    repository,
    () => new Date('2026-11-17T12:00:00.000Z'),
    () => 'order-123'
  );

  await service.execute({ ...request, delivery });

  assert.deepEqual(createdOrders[0]?.delivery, delivery);
});

test('rejects a reservation when stock is insufficient', async () => {
  const { repository, createdOrders } = createRepository([product]);
  const service = new ReserveOrderService(repository);

  await assert.rejects(
    service.execute({ ...request, items: [{ productId: 'apple-1', quantity: 6 }] }),
    InventoryConflictError
  );
  assert.equal(createdOrders.length, 0);
});

test('rejects products that no longer exist', async () => {
  const { repository, createdOrders } = createRepository([]);
  const service = new ReserveOrderService(repository);

  await assert.rejects(service.execute(request), ProductNotFoundError);
  assert.equal(createdOrders.length, 0);
});

test('rejects products that expire at the reservation time', async () => {
  const expiringProduct = {
    ...product,
    expirationDate: '2026-11-17T12:00:00.000Z'
  };
  const { repository, createdOrders } = createRepository([expiringProduct]);
  const service = new ReserveOrderService(
    repository,
    () => new Date('2026-11-17T12:00:00.000Z')
  );

  await assert.rejects(service.execute(request), InventoryConflictError);
  assert.equal(createdOrders.length, 0);
});

test('rejects a vegetable once its publication reaches the removal deadline', async () => {
  const { repository, createdOrders } = createRepository([{
    ...product, category: 'verduras', removeAt: '2026-11-17T12:00:00.000Z'
  }]);
  const service = new ReserveOrderService(repository, () => new Date('2026-11-17T12:00:00.000Z'));
  await assert.rejects(service.execute(request), InventoryConflictError);
  assert.equal(createdOrders.length, 0);
});
