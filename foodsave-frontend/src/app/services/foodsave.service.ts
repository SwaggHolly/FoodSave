import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Product, ProtocolStatus } from '../models/product.model';

@Injectable({ providedIn: 'root' })
export class FoodsaveService {
  private productsMock: Product[] = [
    {
      id: '1',
      title: 'Manzanas rojas frescas',
      storeName: 'Fruver El Campestre',
      category: 'frutas',
      originalPrice: 12000,
      discountPrice: 4800,
      expirationDate: new Date(Date.now() + 86400000 * 2),
      stock: 15,
      imageUrl: 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?auto=format&fit=crop&w=800&q=80',
      protocol: 'REST'
    },
    {
      id: '2',
      title: 'Combo de panadería artesanal',
      storeName: 'Pan y Hojaldre',
      category: 'panaderia',
      originalPrice: 25000,
      discountPrice: 8500,
      expirationDate: new Date(Date.now() + 3600000 * 5),
      stock: 4,
      imageUrl: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=800&q=80',
      protocol: 'GraphQL'
    },
    {
      id: '3',
      title: 'Canasta de frutas de temporada',
      storeName: 'Mercado La Huerta',
      category: 'frutas',
      originalPrice: 22000,
      discountPrice: 9900,
      expirationDate: new Date(Date.now() + 86400000),
      stock: 8,
      imageUrl: 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?auto=format&fit=crop&w=800&q=80',
      protocol: 'REST'
    },
    {
      id: '4',
      title: 'Yogur natural artesanal',
      storeName: 'Lácteos La Pradera',
      category: 'lacteos',
      originalPrice: 14000,
      discountPrice: 6500,
      expirationDate: new Date(Date.now() + 3600000 * 18),
      stock: 6,
      imageUrl: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=800&q=80',
      protocol: 'GraphQL'
    },
    {
      id: '5',
      title: 'Caja sorpresa de temporada',
      storeName: 'Mercado La Huerta',
      category: 'sorpresa',
      originalPrice: 30000,
      discountPrice: 12000,
      expirationDate: new Date(Date.now() + 3600000 * 12),
      stock: 5,
      imageUrl: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=800&q=80',
      protocol: 'REST'
    },
    {
      id: '6',
      title: 'Banano maduro, 1 kg',
      storeName: 'Fruver El Campestre',
      category: 'frutas',
      originalPrice: 6000,
      discountPrice: 2500,
      expirationDate: new Date(Date.now() + 3600000 * 8),
      stock: 12,
      imageUrl: 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=800&q=80',
      protocol: 'gRPC'
    }
  ];

  getProducts(): Observable<Product[]> {
    return of(this.productsMock);
  }

  getProtocolsStatus(): Observable<ProtocolStatus[]> {
    return of([
      { name: 'Catálogo de Productos', type: 'REST', status: 'online', latencyMs: 45 },
      { name: 'Filtro & Búsqueda Avanzada', type: 'GraphQL', status: 'online', latencyMs: 60 },
      { name: 'Inventario & Stock Tiempo Real', type: 'gRPC', status: 'online', latencyMs: 12 },
      { name: 'Facturación & Pagos Comercio', type: 'SOAP', status: 'online', latencyMs: 120 }
    ]);
  }
}