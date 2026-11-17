import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable, of } from 'rxjs';
import { environment } from '../../environments/environment';
import { CreateOrderRequest, OrderReceipt } from '../models/order.model';
import { Product, ProtocolStatus } from '../models/product.model';

@Injectable({ providedIn: 'root' })
export class FoodsaveService {
  constructor(private readonly http: HttpClient) {}

  getProducts(): Observable<Product[]> {
    return this.http
      .get<{ products: Product[] }>(`${environment.apiBaseUrl}/products`)
      .pipe(map((response) => response.products));
  }

  createOrder(request: CreateOrderRequest): Observable<OrderReceipt> {
    return this.http.post<OrderReceipt>(`${environment.apiBaseUrl}/orders`, request);
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