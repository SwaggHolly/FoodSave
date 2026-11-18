import { TestBed } from '@angular/core/testing';
import {
  provideHttpClient
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting
} from '@angular/common/http/testing';
import { FoodsaveService } from './foodsave.service';
import { environment } from '../../environments/environment';
import { Product, ProtocolStatus } from '../models/product.model';
import { PRIVACY_POLICY_VERSION } from '../models/privacy-policy';

const product: Product = {
  id: '1',
  title: 'Manzanas rojas frescas',
  storeName: 'Fruver El Campestre',
  category: 'frutas',
  originalPrice: 12000,
  discountPrice: 4800,
  expirationDate: '2027-01-02T00:00:00.000Z',
  stock: 15,
  imageUrl: 'https://example.com/apples.jpg'
};

describe('FoodsaveService', () => {
  let service: FoodsaveService;
  let httpController: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        FoodsaveService,
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(FoodsaveService);
    httpController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpController.verify());

  it('loads products from the API', () => {
    let response: Product[] | undefined;
    service.getProducts().subscribe((products) => (response = products));

    const request = httpController.expectOne(`${environment.apiBaseUrl}/products`);
    expect(request.request.method).toBe('GET');
    request.flush({ products: [product] });

    expect(response).toEqual([product]);
  });

  it('posts the buyer and product quantities to create a reservation', () => {
    const order = {
      buyerName: 'Ana Pérez',
      buyerPhone: '+573001234567',
      privacyPolicyVersion: PRIVACY_POLICY_VERSION,
      items: [{ productId: '1', quantity: 2 }]
    };
    let orderId: string | undefined;
    service.createOrder(order).subscribe((receipt) => (orderId = receipt.orderId));

    const request = httpController.expectOne(`${environment.apiBaseUrl}/orders`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(order);
    request.flush({
      orderId: 'order-123',
      status: 'pending_payment',
      total: 9600,
      createdAt: '2026-11-17T12:00:00.000Z',
      paymentExpiresAt: '2026-11-17T12:15:00.000Z',
      statusSubscriptionToken: 'private-token',
      checkoutUrl: 'https://mercadopago.example/checkout'
    });

    expect(orderId).toBe('order-123');
  });

  it('uses the private order token to retrieve payment status', () => {
    let response: unknown;
    service.getOrderStatus('order-123', 'private-token').subscribe((status) => {
      response = status;
    });

    const request = httpController.expectOne(
      `${environment.apiBaseUrl}/orders/order-123/status`
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('x-order-token')).toBe('private-token');
    request.flush({
      orderId: 'order-123',
      status: 'paid',
      paymentExpiresAt: '2026-11-17T12:15:00.000Z'
    });

    expect(response).toEqual({
      orderId: 'order-123',
      status: 'paid',
      paymentExpiresAt: '2026-11-17T12:15:00.000Z'
    });
  });

  it('reports the configured protocol status list', () => {
    let response: ProtocolStatus[] | undefined;
    service.getProtocolsStatus().subscribe((statuses) => (response = statuses));

    expect(response).toHaveLength(4);
    expect(response?.every((status) => status.status === 'online')).toBe(true);
  });
});
