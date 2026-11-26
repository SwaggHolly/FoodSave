export type OrderDelivery =
  | { method: 'pickup' }
  | {
      method: 'delivery';
      city: string;
      zone: string;
      neighborhood: string;
      address: string;
      reference?: string;
    };

export interface CreateOrderRequest {
  buyerName: string;
  buyerPhone: string;
  buyerEmail?: string;
  privacyPolicyVersion: string;
  delivery?: OrderDelivery;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
}

export interface OrderReceipt {
  orderId: string;
  status: 'reserved';
  total: number;
  createdAt: string;
  reservationExpiresAt: string;
  statusSubscriptionToken: string;
  items: Array<{
    productId: string;
    title: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
}
