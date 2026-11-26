export interface Product {
  id: string;
  title: string;
  storeName: string;
  category: 'frutas' | 'verduras' | 'panaderia' | 'lacteos' | 'sorpresa';
  originalPrice: number;
  discountPrice: number;
  expirationDate: string;
  stock: number;
  imageUrl: string;
}

export interface ProtocolStatus {
  name: string;
  type: 'REST' | 'GraphQL' | 'gRPC' | 'SOAP';
  status: 'online' | 'degraded' | 'offline';
  latencyMs: number;
}