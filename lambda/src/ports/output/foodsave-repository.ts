import type { Order } from '../../domain/models/order.js';
import type { Product, ProductCategory } from '../../domain/models/product.js';
import type { UpdateUserProfile, UserProfile } from '../../domain/models/user-profile.js';

export interface ProductListOptions {
  category?: ProductCategory;
  search?: string;
}

export interface FoodSaveRepository {
  listProducts(options: ProductListOptions): Promise<Product[]>;
  getProductsByIds(ids: string[]): Promise<Product[]>;
  createOrder(order: Order): Promise<void>;
  getUserProfile(sub: string): Promise<UserProfile | undefined>;
  saveUserProfile(sub: string, email: string, profile: UpdateUserProfile): Promise<UserProfile>;
}
