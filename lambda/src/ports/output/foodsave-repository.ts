import type { Order } from '../../domain/models/order.js';
import type { Product, ProductCategory } from '../../domain/models/product.js';
import type { UpdateUserProfile, UserProfile } from '../../domain/models/user-profile.js';
import type {
  MerchantApplication,
  MerchantApplicationRequest
} from '../../domain/models/merchant.js';

export interface ProductListOptions {
  category?: ProductCategory;
  search?: string;
}

export interface FoodSaveRepository {
  listProducts(options: ProductListOptions): Promise<Product[]>;
  getProductsByIds(ids: string[]): Promise<Product[]>;
  createOrder(order: Order): Promise<void>;
  getOrder(orderId: string): Promise<Order | undefined>;
  attachPaymentPreference(orderId: string, preferenceId: string, checkoutUrl: string): Promise<void>;
  markOrderPaid(orderId: string, paymentId: string, paidAt: Date): Promise<boolean>;
  markOrderPaymentLate(orderId: string, paymentId: string, paidAt: Date): Promise<void>;
  expirePendingOrders(now: Date): Promise<number>;
  getMerchantApplication(sub: string): Promise<MerchantApplication | undefined>;
  createMerchantApplication(
    sub: string,
    input: MerchantApplicationRequest,
    now: Date
  ): Promise<MerchantApplication>;
  reviewMerchantApplication(
    sub: string,
    status: 'approved' | 'rejected',
    reviewerSub: string,
    now: Date
  ): Promise<MerchantApplication | undefined>;
  createMerchantProduct(product: Product): Promise<void>;
  consumeReservationRateLimit(sourceIp: string, now: Date): Promise<boolean>;
  getUserProfile(sub: string): Promise<UserProfile | undefined>;
  saveUserProfile(
    sub: string,
    email: string,
    profile: UpdateUserProfile
  ): Promise<UserProfile>;
}
