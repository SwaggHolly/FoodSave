export interface Product {
  id: string;
  title: string;
  storeName: string;
  category: 'frutas' | 'panaderia' | 'lacteos' | 'sorpresa';
  originalPrice: number;
  discountPrice: number;
  expirationDate: Date;
  stock: number;
  imageUrl: string;
  // Protocolos asociados para fines demostrativos académicos
  protocol: 'REST' | 'GraphQL' | 'gRPC' | 'SOAP';
}

export interface ProtocolStatus {
  name: string;
  type: 'REST' | 'GraphQL' | 'gRPC' | 'SOAP';
  status: 'online' | 'degraded' | 'offline';
  latencyMs: number;
}