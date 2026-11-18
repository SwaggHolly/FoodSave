import { randomUUID } from 'node:crypto';
import type {
  CreateOrderRequest,
  Order,
  OrderReceipt
} from '../models/order.js';
import type { FoodSaveRepository } from '../../ports/output/foodsave-repository.js';
import type { Product } from '../models/product.js';

export class ProductNotFoundError extends Error {
  constructor() {
    super('Uno o más productos ya no están disponibles.');
    this.name = 'ProductNotFoundError';
  }
}

export class InventoryConflictError extends Error {
  constructor() {
    super('El inventario cambió o uno de los productos ya venció. Actualiza el catálogo e inténtalo de nuevo.');
    this.name = 'InventoryConflictError';
  }
}

export class ReserveOrderService {
  constructor(
    private readonly repository: FoodSaveRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = randomUUID
  ) {}

  async execute(request: CreateOrderRequest): Promise<OrderReceipt> {
    const products = await this.repository.getProductsByIds(
      request.items.map((item) => item.productId)
    );
    const productsById = new Map(products.map((product) => [product.id, product]));
    if (productsById.size !== request.items.length) {
      throw new ProductNotFoundError();
    }

    const now = this.now();
    const orderItems = request.items.map((item) => {
      const product = productsById.get(item.productId);
      if (!product) throw new ProductNotFoundError();
      this.assertAvailable(product, item.quantity, now);
      return {
        productId: product.id,
        title: product.title,
        quantity: item.quantity,
        unitPrice: product.discountPrice,
        lineTotal: product.discountPrice * item.quantity
      };
    });

    const order: Order = {
      id: this.createId(),
      buyerName: request.buyerName,
      buyerPhone: request.buyerPhone,
      delivery: request.delivery ?? { method: 'pickup' },
      status: 'reserved',
      items: orderItems,
      total: orderItems.reduce((total, item) => total + item.lineTotal, 0),
      createdAt: now.toISOString()
    };

    await this.repository.createOrder(order);
    return {
      orderId: order.id,
      status: order.status,
      total: order.total,
      createdAt: order.createdAt
    };
  }

  private assertAvailable(product: Product, quantity: number, now: Date): void {
    if (
      product.stock < quantity ||
      new Date(product.expirationDate).getTime() <= now.getTime()
    ) {
      throw new InventoryConflictError();
    }
  }
}
