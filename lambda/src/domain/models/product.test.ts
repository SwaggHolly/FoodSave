import assert from 'node:assert/strict';
import test from 'node:test';
import { productSchema } from './product.js';

const product = {
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

test('accepts a valid discounted catalog product', () => {
  assert.equal(productSchema.safeParse(product).success, true);
});

test('rejects a discount price equal to or above the original price', () => {
  for (const discountPrice of [12000, 12001]) {
    assert.equal(
      productSchema.safeParse({ ...product, discountPrice }).success,
      false
    );
  }
});
