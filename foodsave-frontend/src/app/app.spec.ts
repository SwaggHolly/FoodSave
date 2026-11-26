import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Observable, of, Subject, throwError } from 'rxjs';
import { AppComponent } from './app.component';
import { CreateOrderRequest, OrderReceipt } from './models/order.model';
import { PRIVACY_POLICY_VERSION } from './models/privacy-policy';
import { Product } from './models/product.model';
import { UserProfile } from './models/user-profile.model';
import { AccountService } from './services/account.service';
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
  let productResponses: Observable<Product[]>[];
  let orderResponse: Observable<OrderReceipt>;
  let signedInProfile: UserProfile | null;
  let signedInUser: { sub: string; email: string } | null;
  let registrationRequests: Array<{
    name: string;
    email: string;
    phone: string;
    password: string;
    privacyPolicyVersion: string;
  }>;

  async function createLoadedApp() {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(async () => {
    localStorage.removeItem('foodsave-cart');
    sessionStorage.clear();
    submittedOrders = [];
    registrationRequests = [];
    signedInProfile = null;
    signedInUser = null;
    productResponses = [of(demoProducts)];
    orderResponse = of({
      orderId: 'order-123',
      status: 'reserved',
      total: 4800,
      createdAt: '2026-11-17T12:00:00.000Z',
      reservationExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      statusSubscriptionToken: 'private-token',
      items: [{ productId: '1', title: 'Manzanas rojas frescas', quantity: 1, unitPrice: 4800, lineTotal: 4800 }]
    });
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        {
          provide: FoodsaveService,
          useValue: {
            getProducts: () => productResponses.shift() ?? of(demoProducts),
            createOrder: (request: CreateOrderRequest) => {
              submittedOrders.push(request);
              return orderResponse;
            },
            navigateToPayment: () => undefined
          }
        },
        {
          provide: AccountService,
          useValue: {
            user: () => signedInUser,
            profile: () => signedInProfile,
            merchant: () => null,
            isConfigured: true,
            restoreSession: async () => null,
            register: async (details: {
              name: string;
              email: string;
              phone: string;
              password: string;
              privacyPolicyVersion: string;
            }) => {
              registrationRequests.push(details);
            },
            signInWithEmail: async (credentials: { email: string }) => {
              signedInProfile = {
                sub: 'user-123',
                name: 'Ana Pérez',
                email: credentials.email,
                phone: '+573001234567',
                updatedAt: '2026-11-18T12:00:00.000Z'
              };
              signedInUser = { sub: 'user-123', email: credentials.email };
              return signedInProfile;
            },
            saveProfile: async (profile: { name: string; phone: string }) => {
              signedInProfile = {
                sub: 'user-123',
                name: profile.name,
                email: signedInUser?.email ?? 'ana@example.com',
                phone: profile.phone,
                updatedAt: '2026-11-18T12:00:00.000Z'
              };
              return signedInProfile;
            },
            loadMerchantApplication: async () => null
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

  it('offers seller registration and opens the store form after sign in', async () => {
    const fixture = await createLoadedApp();
    const app = fixture.componentInstance;
    (fixture.nativeElement.querySelector('[aria-label="Crear una cuenta"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('select[name="accountType"]')?.textContent).toContain('Vender productos');
    app.accountType = 'seller';
    app.accountName = 'Ana Pérez';
    app.accountEmail = 'ana@example.com';
    app.accountPassword = 'Password1';
    app.accountPrivacyAccepted = true;
    await app.submitRegistration();
    await app.submitSignIn();
    expect(app.accountMode).toBe('merchant');
    expect(app.accountMessage).toContain('tienda');
  });

  it('rejects vegetables outside the two-day window before uploading an image', async () => {
    const fixture = await createLoadedApp();
    const app = fixture.componentInstance;
    app.merchantProductCategory = 'verduras';
    app.merchantExpirationDate = new Date(Date.now() + 3 * 86_400_000).toISOString();
    app.merchantImageFile = new File(['image'], 'food.png', { type: 'image/png' });
    await app.submitMerchantProduct();
    expect(app.accountError).toContain('2 días');
  });

  it('adds products to the cart and updates the total', async () => {
    const fixture = await createLoadedApp();
    const app = fixture.componentInstance;

    app.addToCart(app.products[0]);
    app.addToCart(app.products[0]);

    expect(app.totalItems).toBe(2);
    expect(app.cartTotal).toBe(demoProducts[0].discountPrice * 2);
  });

  it('does not add more than the available stock', async () => {
    const fixture = await createLoadedApp();
    const app = fixture.componentInstance;
    const limitedProduct = { ...app.products[0], stock: 1 };

    app.addToCart(limitedProduct);
    app.addToCart(limitedProduct);

    expect(app.totalItems).toBe(1);
    expect(app.notice).toContain('todas las unidades disponibles');
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
    app.orderPrivacyAccepted = true;
    app.finishOrder();
    fixture.detectChanges();

    expect(submittedOrders).toEqual([
      {
        buyerName: 'Ana Pérez',
        buyerPhone: '+573001234567',
        privacyPolicyVersion: PRIVACY_POLICY_VERSION,
        delivery: { method: 'pickup' },
        items: [{ productId: '1', quantity: 1 }]
      }
    ]);
    expect(app.cartItems).toHaveLength(0);
    expect(app.cartOpen).toBe(false);
    expect(app.orderConfirmationOpen).toBe(true);
    expect(app.orderConfirmation?.receipt.orderId).toBe('order-123');
    expect(app.orderConfirmation?.items).toEqual([
      {
        productId: '1',
        title: 'Manzanas rojas frescas',
        quantity: 1,
        unitPrice: 4800,
        lineTotal: 4800
      }
    ]);
    expect(fixture.nativeElement.textContent).toContain('¡Tu pedido fue creado con éxito!');
    expect(fixture.nativeElement.textContent).toContain('order-123');
    expect(fixture.nativeElement.textContent).toContain('Reserva activa durante 15 minutos');
    expect(fixture.nativeElement.textContent).not.toContain('Continuar al pago');
    expect(sessionStorage.getItem('foodsave-order-order-123')).toBe('private-token');
  });

  it('does not submit a reservation when buyer contact fields are empty', async () => {
    const fixture = await createLoadedApp();
    const app = fixture.componentInstance;
    app.addToCart(app.products[0]);

    app.finishOrder();

    expect(submittedOrders).toHaveLength(0);
    expect(app.cartItems).toHaveLength(1);
    expect(app.notice).toContain('Completa tu nombre y teléfono');
  });

  it('prevents cart changes while an order is being created', async () => {
    const response = new Subject<OrderReceipt>();
    orderResponse = response;
    const fixture = await createLoadedApp();
    const app = fixture.componentInstance;
    app.addToCart(demoProducts[0]);
    app.buyerName = 'Ana Pérez';
    app.buyerPhone = '+573001234567';
    app.orderPrivacyAccepted = true;

    app.finishOrder();
    app.addToCart(demoProducts[1]);
    app.changeQuantity('1', 1);
    app.removeFromCart('1');

    expect(app.cartItems.map(({ product, quantity }) => [product.id, quantity])).toEqual([['1', 1]]);
    response.next({
      orderId: 'order-123',
      status: 'reserved',
      total: 4800,
      createdAt: new Date().toISOString(),
      reservationExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      statusSubscriptionToken: 'private-token',
      items: [{ productId: '1', title: 'Manzanas rojas frescas', quantity: 1, unitPrice: 4800, lineTotal: 4800 }]
    });
    expect(app.orderConfirmation?.items[0].quantity).toBe(1);
  });

  it('shows when a reservation has expired', async () => {
    orderResponse = of({
      orderId: 'expired-order',
      status: 'reserved',
      total: 4800,
      createdAt: new Date(Date.now() - 120_000).toISOString(),
      reservationExpiresAt: new Date(Date.now() - 60_000).toISOString(),
      statusSubscriptionToken: 'private-token',
      items: [{ productId: '1', title: 'Manzanas rojas frescas', quantity: 1, unitPrice: 4800, lineTotal: 4800 }]
    });
    const fixture = await createLoadedApp();
    const app = fixture.componentInstance;
    app.addToCart(demoProducts[0]);
    app.buyerName = 'Ana Pérez';
    app.buyerPhone = '+573001234567';
    app.orderPrivacyAccepted = true;
    app.finishOrder();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Reserva vencida');
  });

  it('requires privacy acceptance before creating a reservation', async () => {
    const fixture = await createLoadedApp();
    const app = fixture.componentInstance;
    app.addToCart(demoProducts[0]);
    app.buyerName = 'Ana Pérez';
    app.buyerPhone = '+573001234567';

    app.finishOrder();

    expect(submittedOrders).toHaveLength(0);
    expect(app.cartItems).toHaveLength(1);
    expect(app.notice).toContain('Acepta la política de privacidad');
  });

  it('requires an address when the customer selects home delivery', async () => {
    const fixture = await createLoadedApp();
    const app = fixture.componentInstance;
    app.addToCart(app.products[0]);
    app.buyerName = 'Ana Pérez';
    app.buyerPhone = '+573001234567';
    app.orderPrivacyAccepted = true;
    app.deliveryMethod = 'delivery';

    app.finishOrder();

    expect(submittedOrders).toHaveLength(0);
    expect(app.notice).toContain('ciudad, zona, barrio y dirección');
  });

  it('sends the delivery location with the order', async () => {
    const fixture = await createLoadedApp();
    const app = fixture.componentInstance;
    app.addToCart(app.products[0]);
    app.buyerName = 'Ana Pérez';
    app.buyerPhone = '+573001234567';
    app.orderPrivacyAccepted = true;
    app.deliveryMethod = 'delivery';
    app.deliveryCity = 'Bogotá';
    app.deliveryZone = 'Norte';
    app.deliveryNeighborhood = 'Chapinero';
    app.deliveryAddress = 'Carrera 7 # 45-10';
    app.deliveryReference = 'Torre 2';

    app.finishOrder();

    expect(submittedOrders[0]?.delivery).toEqual({
      method: 'delivery',
      city: 'Bogotá',
      zone: 'Norte',
      neighborhood: 'Chapinero',
      address: 'Carrera 7 # 45-10',
      reference: 'Torre 2'
    });
  });

  it('refreshes products and preserves the cart after an inventory conflict', async () => {
    const refreshedProduct = { ...demoProducts[0], stock: 1 };
    productResponses = [of(demoProducts), of([refreshedProduct])];
    orderResponse = throwError(
      () => new HttpErrorResponse({ status: 409, error: { message: 'Inventario cambió.' } })
    );
    const fixture = await createLoadedApp();
    const app = fixture.componentInstance;
    app.addToCart(app.products[0]);
    app.buyerName = 'Ana Pérez';
    app.buyerPhone = '+573001234567';
    app.orderPrivacyAccepted = true;

    app.finishOrder();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(app.products).toEqual([refreshedProduct]);
    expect(app.cartItems).toHaveLength(1);
    expect(app.isSubmittingOrder).toBe(false);
    expect(app.orderError).toBe('Inventario cambió.');
  });

  it('shows a recoverable message when the catalog API is unavailable', async () => {
    productResponses = [
      throwError(() => new HttpErrorResponse({ status: 0 }))
    ];
    const fixture = await createLoadedApp();
    const app = fixture.componentInstance;

    expect(app.isLoadingProducts).toBe(false);
    expect(app.catalogError).toContain('Revisa que la API esté ejecutándose');
  });

  it('starts email verification after submitting account registration details', async () => {
    const fixture = await createLoadedApp();
    const app = fixture.componentInstance;
    app.openAccount();
    app.accountName = 'Ana Pérez';
    app.accountEmail = 'ana@example.com';
    app.accountPhone = '+573001234567';
    app.accountPassword = 'Comida2026';
    app.accountPrivacyAccepted = true;

    await app.submitRegistration();

    expect(registrationRequests).toEqual([
      {
        name: 'Ana Pérez',
        email: 'ana@example.com',
        phone: '+573001234567',
        password: 'Comida2026',
        privacyPolicyVersion: PRIVACY_POLICY_VERSION
      }
    ]);
    expect(app.accountMode).toBe('confirm');
    expect(app.accountMessage).toContain('código de verificación');
  });

  it('requires privacy acceptance before account registration', async () => {
    const fixture = await createLoadedApp();
    const app = fixture.componentInstance;
    app.openAccount();

    await app.submitRegistration();

    expect(registrationRequests).toHaveLength(0);
    expect(app.accountError).toContain('aceptar la política de privacidad');
  });

  it('shows the signed-in customer profile after login', async () => {
    const fixture = await createLoadedApp();
    const app = fixture.componentInstance;
    app.openAccount();
    app.setAccountMode('signin');
    app.accountEmail = 'ana@example.com';
    app.accountPassword = 'Comida2026';
    app.accountPrivacyAccepted = true;

    const accountButton = fixture.nativeElement.querySelector('.account-button') as HTMLButtonElement;
    expect(accountButton.textContent).toContain('Crear cuenta');
    await app.submitSignIn();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(app.accountOpen).toBe(true);
    expect(app.accountMode).toBe('profile');
    expect(app.account.profile()?.name).toBe('Ana Pérez');
    expect(fixture.nativeElement.textContent).toContain('Ana Pérez');
    expect(fixture.nativeElement.textContent).toContain('ana@example.com');
    expect(fixture.nativeElement.textContent).toContain('+573001234567');
    expect(fixture.nativeElement.textContent).toContain('Cuenta activa');
    expect(accountButton.textContent).toContain('Mi cuenta');
    expect(accountButton.textContent).toContain('AP');
    expect(accountButton.classList.contains('account-signed')).toBe(true);

    (fixture.nativeElement.querySelector('[aria-label="Cerrar cuenta"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    accountButton.click();
    fixture.detectChanges();
    expect(app.accountMode).toBe('profile');
    expect(fixture.nativeElement.querySelector('[aria-label="Resumen de tu cuenta"]')).not.toBeNull();
  });
});
