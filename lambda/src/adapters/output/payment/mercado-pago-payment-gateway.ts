import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Order } from '../../../domain/models/order.js';

const preferenceResponseSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  init_point: z.string().url()
});

const paymentResponseSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  status: z.string(),
  external_reference: z.string(),
  transaction_amount: z.number(),
  currency_id: z.string()
});

export interface VerifiedPayment {
  id: string;
  status: string;
  orderId: string;
  amount: number;
  currency: string;
}

export interface PaymentCheckout {
  preferenceId: string;
  checkoutUrl: string;
}

export interface PaymentGateway {
  isConfigured(): boolean;
  createCheckout(order: Order): Promise<PaymentCheckout>;
  verifyWebhookSignature(dataId: string, requestId: string, signatureHeader: string): boolean;
  getPayment(paymentId: string): Promise<VerifiedPayment>;
}

export class PaymentConfigurationError extends Error {
  constructor() {
    super('Mercado Pago no está configurado para iniciar pagos.');
    this.name = 'PaymentConfigurationError';
  }
}

export class PaymentProviderError extends Error {
  constructor() {
    super('Mercado Pago no pudo procesar la solicitud.');
    this.name = 'PaymentProviderError';
  }
}

export class MercadoPagoPaymentGateway implements PaymentGateway {
  constructor(
    private readonly accessToken = process.env['MERCADOPAGO_ACCESS_TOKEN'] ?? '',
    private readonly webhookSecret = process.env['MERCADOPAGO_WEBHOOK_SECRET'] ?? '',
    private readonly apiUrl = process.env['PUBLIC_API_URL'] ?? '',
    private readonly frontendOrigin = process.env['FRONTEND_ORIGIN'] ?? '',
    private readonly request: typeof fetch = fetch
  ) {}

  isConfigured(): boolean {
    return Boolean(
      this.accessToken &&
        this.webhookSecret &&
        this.apiUrl &&
        this.frontendOrigin
    );
  }

  async createCheckout(order: Order): Promise<PaymentCheckout> {
    if (!this.isConfigured()) throw new PaymentConfigurationError();
    const frontendUrl = new URL(this.frontendOrigin);
    const paymentReturnUrl = (status: 'success' | 'failure' | 'pending'): string => {
      const returnUrl = new URL(frontendUrl);
      returnUrl.searchParams.set('payment', status);
      returnUrl.searchParams.set('order_id', order.id);
      return returnUrl.toString();
    };
    const response = await this.request('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.accessToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        items: order.items.map((item) => ({
          id: item.productId,
          title: item.title,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          currency_id: 'COP'
        })),
        ...(order.buyerEmail ? { payer: { email: order.buyerEmail } } : {}),
        external_reference: order.id,
        expires: true,
        date_of_expiration: order.paymentExpiresAt,
        notification_url: `${this.apiUrl.replace(/\/$/, '')}/webhooks/mercadopago`,
        back_urls: {
          success: paymentReturnUrl('success'),
          failure: paymentReturnUrl('failure'),
          pending: paymentReturnUrl('pending')
        },
        auto_return: 'approved'
      })
    });

    if (!response.ok) throw new PaymentProviderError();
    const result = preferenceResponseSchema.safeParse(await response.json());
    if (!result.success) throw new PaymentProviderError();
    return {
      preferenceId: result.data.id,
      checkoutUrl: result.data.init_point
    };
  }

  verifyWebhookSignature(
    dataId: string,
    requestId: string,
    signatureHeader: string
  ): boolean {
    if (!this.webhookSecret) throw new PaymentConfigurationError();
    const signatureParts = new Map(
      signatureHeader.split(',').map((part) => {
        const [key, value] = part.trim().split('=', 2);
        return [key, value] as const;
      })
    );
    const timestamp = signatureParts.get('ts');
    const signature = signatureParts.get('v1');
    if (!timestamp || !signature || !/^[a-f\d]{64}$/i.test(signature)) return false;

    const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${timestamp};`;
    const expected = createHmac('sha256', this.webhookSecret)
      .update(manifest)
      .digest();
    const received = Buffer.from(signature, 'hex');
    return received.length === expected.length && timingSafeEqual(received, expected);
  }

  async getPayment(paymentId: string): Promise<VerifiedPayment> {
    if (!this.isConfigured()) throw new PaymentConfigurationError();
    const response = await this.request(
      `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
      { headers: { authorization: `Bearer ${this.accessToken}` } }
    );
    if (!response.ok) throw new PaymentProviderError();
    const result = paymentResponseSchema.safeParse(await response.json());
    if (!result.success) throw new PaymentProviderError();
    return {
      id: result.data.id,
      status: result.data.status,
      orderId: result.data.external_reference,
      amount: result.data.transaction_amount,
      currency: result.data.currency_id
    };
  }
}
