import { Product } from './product.model';

export type MerchantApplicationStatus = 'pending_review' | 'approved' | 'rejected';

export interface MerchantApplication {
  sub: string;
  storeName: string;
  ownerName: string;
  contactEmail: string;
  phone: string;
  city: string;
  address: string;
  description: string;
  status: MerchantApplicationStatus;
  createdAt: string;
  updatedAt: string;
  reviewedBy?: string;
}

export interface MerchantApplicationRequest {
  storeName: string;
  ownerName: string;
  contactEmail: string;
  phone: string;
  city: string;
  address: string;
  description?: string;
}

export type MerchantProductRequest = Pick<
  Product,
  'title' | 'category' | 'originalPrice' | 'discountPrice' | 'expirationDate' | 'stock'
> & { imageKey: string };

export interface MerchantImageUpload {
  key: string;
  url: string;
  fields: Record<string, string>;
}
