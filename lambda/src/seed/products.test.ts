import assert from 'node:assert/strict';
import test from 'node:test';
import { productSchema } from '../domain/models/product.js';
import { seedProducts } from './products.js';

test('seed products are valid, uniquely identified, and not expired', () => {
  const now = Date.now();
  const productIds = seedProducts.map((product) => product.id);

  assert.equal(new Set(productIds).size, productIds.length);
  for (const product of seedProducts) {
    assert.equal(productSchema.safeParse(product).success, true);
    assert.ok(new Date(product.expirationDate).getTime() > now);
  }
});
