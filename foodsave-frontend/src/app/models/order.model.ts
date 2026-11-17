export interface CreateOrderRequest {
  buyerName: string;
  buyerPhone: string;
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
