import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Product, ProtocolStatus } from '../models/product.model';

export class FoodsaveService {
  private productsMock: Product[] = [
    {
      id: '1',
      title: 'Manzanas Orgánicas Excedente',
      storeName: 'Fruver El Campestre',
      category: 'frutas',
      originalPrice: 12000,
      discountPrice: 4800,
      expirationDate: new Date(Date.now() + 86400000 * 2), // 2 días
      stock: 15,
      imageUrl: 'assets/apples.jpg',
      protocol: 'REST'
    },
    {
      id: '2',
      title: 'Combo Panadería Artesanal',
      storeName: 'Pan y Hojaldre',
      category: 'panaderia',
      originalPrice: 25000,
      discountPrice: 8500,
      expirationDate: new Date(Date.now() + 3600000 * 5), // 5 horas
      stock: 4,
      imageUrl: 'assets/bread.jpg',
      protocol: 'GraphQL'
    }
  ];

  // Simulación de catálogo vía REST / GraphQL
  getProducts(): Observable<Product[]> {
    return of(this.productsMock);
  }

  // Simulación del monitor de la arquitectura (gRPC / SOAP / REST / GraphQL)
  getProtocolsStatus(): Observable<ProtocolStatus[]> {
    return of([
      { name: 'Catálogo de Productos', type: 'REST', status: 'online', latencyMs: 45 },
      { name: 'Filtro & Búsqueda Avanzada', type: 'GraphQL', status: 'online', latencyMs: 60 },
      { name: 'Inventario & Stock Tiempo Real', type: 'gRPC', status: 'online', latencyMs: 12 },
      { name: 'Facturación & Pagos Comercio', type: 'SOAP', status: 'online', latencyMs: 120 }
    ]);
  }
}

Injectable({ providedIn: 'root' })(FoodsaveService);