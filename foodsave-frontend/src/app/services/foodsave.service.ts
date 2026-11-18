import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable, of } from 'rxjs';
import { environment } from '../../environments/environment';
import { CreateOrderRequest, OrderReceipt } from '../models/order.model';
import { Product, ProtocolStatus } from '../models/product.model';

export interface OrderStatusUpdate {
  orderId: string;
  status: 'pending_payment' | 'paid' | 'expired' | 'payment_late';
  paymentExpiresAt: string;
}

function isOrderStatus(status: unknown): status is OrderStatusUpdate['status'] {
  return (
    status === 'pending_payment' ||
    status === 'paid' ||
    status === 'expired' ||
    status === 'payment_late'
  );
}

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

  getOrderStatus(orderId: string, token: string): Observable<OrderStatusUpdate> {
    return this.http.get<OrderStatusUpdate>(
      `${environment.apiBaseUrl}/orders/${encodeURIComponent(orderId)}/status`,
      { headers: new HttpHeaders({ 'x-order-token': token }) }
    );
  }

  watchOrderStatus(
    orderId: string,
    token: string,
    onConnected: () => void
  ): Observable<OrderStatusUpdate> {
    return new Observable((subscriber) => {
      if (!environment.websocketUrl) {
        subscriber.error(new Error('Las actualizaciones en tiempo real no están configuradas.'));
        return;
      }

      const endpoint = new URL(environment.websocketUrl);
      endpoint.searchParams.set('orderId', orderId);
      endpoint.searchParams.set('token', token);
      const socket = new WebSocket(endpoint);
      socket.onopen = onConnected;
      socket.onmessage = (event: MessageEvent<string>) => {
        try {
          const value: unknown = JSON.parse(event.data);
          if (
            typeof value !== 'object' ||
            value === null ||
            !('orderId' in value) ||
            !('status' in value) ||
            !('paymentExpiresAt' in value) ||
            typeof value.orderId !== 'string' ||
            value.orderId !== orderId ||
            typeof value.paymentExpiresAt !== 'string' ||
            !isOrderStatus(value.status)
          ) {
            throw new Error('El servidor envió una actualización de pedido no válida.');
          }
          subscriber.next({
            orderId: value.orderId,
            status: value.status,
            paymentExpiresAt: value.paymentExpiresAt
          });
        } catch (error: unknown) {
          subscriber.error(error);
        }
      };
      socket.onerror = () => subscriber.error(
        new Error('No se pudo abrir la conexión de actualizaciones del pedido.')
      );
      socket.onclose = () => subscriber.complete();
      return () => socket.close();
    });
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