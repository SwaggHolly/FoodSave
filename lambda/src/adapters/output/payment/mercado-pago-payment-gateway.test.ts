import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import type { Order } from '../../../domain/models/order.js';
import { MercadoPagoPaymentGateway } from './mercado-pago-payment-gateway.js';

const order: Order = {
  id: 'order-123',
  buyerName: 'Ana Pérez',
  buyerPhone: '+573001234567',
  buyerEmail: 'ana@example.com',
  privacyPolicyVersion: '2026-11-18',
  privacyAcceptedAt: '2026-11-18T12:00:00.000Z',
  status: 'pending_payment',
  items: [
    {
      productId: 'apple-1',
      title: 'Manzanas rojas',
      quantity: 2,
      unitPrice: 4800,
      lineTotal: 9600
    }
  ],
  total: 9600,
  createdAt: '2026-11-18T12:00:00.000Z',
  paymentExpiresAt: '2026-11-18T12:15:00.000Z'
};

test('creates an expiring COP preference with the order as external reference', async () => {
  let requestUrl = '';
  let requestInit: RequestInit | undefined;
  const gateway = new MercadoPagoPaymentGateway(
    'test-access-token',
    'test-webhook-secret',
    'https://api.foodsave.test',
    'https://foodsave.test',
    async (input, init) => {
      requestUrl = String(input);
      requestInit = init;
      return new Response(
        JSON.stringify({
          id: 12345,
          init_point: 'https://www.mercadopago.com/checkout/12345'
        }),
        { status: 201 }
      );
    }
  );

  const result = await gateway.createCheckout(order);
  const body = JSON.parse(String(requestInit?.body)) as {
    external_reference: string;
    date_of_expiration: string;
    items: Array<{ currency_id: string; unit_price: number }>;
    payer: { email: string };
    back_urls: { success: string; failure: string; pending: string };
  };

  assert.equal(requestUrl, 'https://api.mercadopago.com/checkout/preferences');
  assert.equal(result.preferenceId, '12345');
  assert.equal(result.checkoutUrl, 'https://www.mercadopago.com/checkout/12345');
  assert.equal(body.external_reference, order.id);
  assert.equal(body.date_of_expiration, order.paymentExpiresAt);
  assert.equal(body.items[0]?.currency_id, 'COP');
  assert.equal(body.items[0]?.unit_price, 4800);
  assert.equal(body.payer.email, 'ana@example.com');
  assert.equal(
    new URL(body.back_urls.success).searchParams.get('order_id'),
    order.id
  );
});

test('verifies the Mercado Pago webhook manifest with a constant-time comparison', () => {
  const secret = 'test-webhook-secret';
  const timestamp = '1795003200';
  const dataId = 'payment-456';
  const requestId = 'request-789';
  const manifest = `id:${dataId};request-id:${requestId};ts:${timestamp};`;
  const signature = createHmac('sha256', secret).update(manifest).digest('hex');
  const gateway = new MercadoPagoPaymentGateway(
    'test-access-token',
    secret,
    'https://api.foodsave.test',
    'https://foodsave.test'
  );

  assert.equal(
    gateway.verifyWebhookSignature(dataId, requestId, `ts=${timestamp},v1=${signature}`),
    true
  );
  assert.equal(
    gateway.verifyWebhookSignature(dataId, 'tampered-request', `ts=${timestamp},v1=${signature}`),
    false
  );
});

test('fetches payment status and merchant reference from Mercado Pago', async () => {
  const gateway = new MercadoPagoPaymentGateway(
    'test-access-token',
    'test-webhook-secret',
    'https://api.foodsave.test',
    'https://foodsave.test',
    async () =>
      new Response(
        JSON.stringify({
          id: 456,
          status: 'approved',
          external_reference: order.id,
          transaction_amount: 9600,
          currency_id: 'COP'
        }),
        { status: 200 }
      )
  );

  assert.deepEqual(await gateway.getPayment('456'), {
    id: '456',
    status: 'approved',
    orderId: order.id,
    amount: 9600,
    currency: 'COP'
  });
});
