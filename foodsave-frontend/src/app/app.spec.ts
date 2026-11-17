import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AppComponent } from './app.component';
import { CreateOrderRequest } from './models/order.model';
import { Product } from './models/product.model';
import { FoodsaveService } from './services/foodsave.service';

const demoProducts: Product[] = [
  {
    id: '1',
    title: 'Manzanas rojas frescas',
    storeName: 'Fruver El Campestre',
    category: 'frutas',
    originalPrice: 12000,
    discountPrice: 4800,
    expirationDate: '2027-01-02T00:00:00.000Z',
    stock: 15,
    imageUrl: 'https://example.com/apples.jpg'
  },
  {
    id: '2',
    title: 'Combo de panadería artesanal',
    storeName: 'Pan y Hojaldre',
    category: 'panaderia',
    originalPrice: 25000,
    discountPrice: 8500,
    expirationDate: '2026-11-18T00:00:00.000Z',
    stock: 4,
    imageUrl: 'https://example.com/bread.jpg'
  },
  {
    id: '3',
    title: 'Canasta de frutas de temporada',
    storeName: 'Mercado La Huerta',
    category: 'frutas',
    originalPrice: 22000,
    discountPrice: 9900,
    expirationDate: '2026-11-18T00:00:00.000Z',
    stock: 8,
    imageUrl: 'https://example.com/fruit.jpg'
  },
  {
    id: '4',
    title: 'Yogur natural artesanal',
    storeName: 'Lácteos La Pradera',
    category: 'lacteos',
    originalPrice: 14000,
    discountPrice: 6500,
    expirationDate: '2026-11-18T00:00:00.000Z',
    stock: 6,
    imageUrl: 'https://example.com/yogurt.jpg'
  },
  {
    id: '5',
    title: 'Caja sorpresa de temporada',
    storeName: 'Mercado La Huerta',
    category: 'sorpresa',
    originalPrice: 30000,
    discountPrice: 12000,
    expirationDate: '2026-11-18T00:00:00.000Z',
    stock: 5,
    imageUrl: 'https://example.com/surprise.jpg'
  },
  {
    id: '6',
    title: 'Banano maduro, 1 kg',
    storeName: 'Fruver El Campestre',
    category: 'frutas',
    originalPrice: 6000,
    discountPrice: 2500,
    expirationDate: '2026-11-18T00:00:00.000Z',
    stock: 12,
    imageUrl: 'https://example.com/banana.jpg'
  }
];

describe('AppComponent', () => {
  let submittedOrders: CreateOrderRequest[];

  async function createLoadedApp() {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(async () => {
    localStorage.removeItem('foodsave-cart');
    submittedOrders = [];
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        {
          provide: FoodsaveService,
          useValue: {
            getProducts: () => of(demoProducts),
            createOrder: (request: CreateOrderRequest) => {
              submittedOrders.push(request);
              return of({
                orderId: 'order-123',
                status: 'reserved',
                total: 4800,
                createdAt: '2026-11-17T12:00:00.000Z'
              });
            }
          }
        }
      ]
    }).compileComponents();
  });

  it('renders the food rescue storefront', async () => {
    const fixture = await createLoadedApp();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Rescata comida.');
    expect(compiled.querySelectorAll('.product-card').length).toBe(demoProducts.length);
  });

  it('adds products to the cart and updates the total', async () => {
    const fixture = await createLoadedApp();
    const app = fixture.componentInstance;

    app.addToCart(app.products[0]);
    app.addToCart(app.products[0]);

    expect(app.totalItems).toBe(2);
    expect(app.cartTotal).toBe(demoProducts[0].discountPrice * 2);
  });

  it('persists cart contents in local storage', async () => {
    const fixture = await createLoadedApp();
    const app = fixture.componentInstance;
    app.addToCart(app.products[0]);

    expect(JSON.parse(localStorage.getItem('foodsave-cart') ?? '[]')).toEqual([
      { productId: demoProducts[0].id, quantity: 1 }
    ]);
  });

  it('filters the catalog by category and search text', async () => {
    const fixture = await createLoadedApp();
    const app = fixture.componentInstance;

    app.selectedCategory = 'frutas';
    app.searchTerm = 'banano';

    expect(app.filteredProducts).toHaveLength(1);
    expect(app.filteredProducts[0].title).toContain('Banano');
  });

  it('removes an item when its cart quantity reaches zero', async () => {
    const fixture = await createLoadedApp();
    const app = fixture.componentInstance;
    app.addToCart(app.products[0]);

    app.changeQuantity(app.products[0].id, -1);

    expect(app.cartItems).toHaveLength(0);
  });

  it('submits a reservation and empties the cart after success', async () => {
    const fixture = await createLoadedApp();
    const app = fixture.componentInstance;
    app.addToCart(demoProducts[0]);
    app.buyerName = 'Ana Pérez';
    app.buyerPhone = '+573001234567';

    app.finishOrder();

    expect(submittedOrders).toEqual([
      {
        buyerName: 'Ana Pérez',
        buyerPhone: '+573001234567',
        items: [{ productId: '1', quantity: 1 }]
      }
    ]);
    expect(app.cartItems).toHaveLength(0);
    expect(app.cartOpen).toBe(false);
  });
});
