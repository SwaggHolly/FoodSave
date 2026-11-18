import assert from 'node:assert/strict';
import test from 'node:test';
import { createOrderRequestSchema } from './order.js';

const request = {
  buyerName: 'Ana Pérez',
  buyerPhone: '+573001234567',
  items: [{ productId: 'apple-1', quantity: 2 }]
};

test('trims buyer contact fields and accepts a valid reservation request', () => {
  const result = createOrderRequestSchema.safeParse({
    ...request,
    buyerName: ' Ana Pérez ',
    buyerPhone: ' +573001234567 '
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.buyerName, 'Ana Pérez');
    assert.equal(result.data.buyerPhone, '+573001234567');
  }
});

test('rejects duplicate products in one reservation', () => {
  const result = createOrderRequestSchema.safeParse({
    ...request,
    items: [
      { productId: 'apple-1', quantity: 1 },
      { productId: 'apple-1', quantity: 1 }
    ]
  });

  assert.equal(result.success, false);
});

test('rejects invalid phone numbers and quantities outside the API limits', () => {
  for (const invalid of [
    { ...request, buyerPhone: '555 ABCD' },
    { ...request, items: [{ productId: 'apple-1', quantity: 0 }] },
    { ...request, items: [{ productId: 'apple-1', quantity: 21 }] }
  ]) {
    assert.equal(createOrderRequestSchema.safeParse(invalid).success, false);
  }
});

test('accepts and normalizes a complete delivery address', () => {
  const result = createOrderRequestSchema.safeParse({
    ...request,
    delivery: {
      method: 'delivery',
      city: ' Bogotá ',
      zone: ' Norte ',
      neighborhood: ' Chapinero ',
      address: ' Carrera 7 # 45-10 '
    }
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.deepEqual(result.data.delivery, {
      method: 'delivery',
      city: 'Bogotá',
      zone: 'Norte',
      neighborhood: 'Chapinero',
      address: 'Carrera 7 # 45-10',
      reference: ''
    });
  }
});

test('rejects delivery requests without a neighborhood or complete address', () => {
  assert.equal(
    createOrderRequestSchema.safeParse({
      ...request,
      delivery: {
        method: 'delivery',
        city: 'Bogotá',
        zone: 'Norte',
        address: 'Calle 1 # 2-3'
      }
    }).success,
    false
  );
});
