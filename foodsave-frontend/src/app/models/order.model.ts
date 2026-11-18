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
}
