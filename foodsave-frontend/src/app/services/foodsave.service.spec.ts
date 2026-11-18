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
      items: [{ productId: '1', quantity: 2 }]
    };
    let orderId: string | undefined;
    service.createOrder(order).subscribe((receipt) => (orderId = receipt.orderId));

    const request = httpController.expectOne(`${environment.apiBaseUrl}/orders`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(order);
    request.flush({
      orderId: 'order-123',
      status: 'reserved',
      total: 9600,
      createdAt: '2026-11-17T12:00:00.000Z'
    });

    expect(orderId).toBe('order-123');
  });

  it('reports the configured protocol status list', () => {
    let response: ProtocolStatus[] | undefined;
    service.getProtocolsStatus().subscribe((statuses) => (response = statuses));

    expect(response).toHaveLength(4);
    expect(response?.every((status) => status.status === 'online')).toBe(true);
  });
});
