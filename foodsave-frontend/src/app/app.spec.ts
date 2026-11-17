import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  beforeEach(async () => {
    localStorage.removeItem('foodsave-cart');
    await TestBed.configureTestingModule({
      imports: [AppComponent],
    }).compileComponents();
  });

  it('renders the food rescue storefront', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Rescata comida.');
    expect(compiled.querySelectorAll('.product-card').length).toBe(6);
  });

  it('adds products to the cart and updates the total', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    fixture.detectChanges();

    app.addToCart(app.products[0]);
    app.addToCart(app.products[0]);

    expect(app.totalItems).toBe(2);
    expect(app.cartTotal).toBe(app.products[0].discountPrice * 2);
  });

  it('persists cart contents in local storage', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    fixture.detectChanges();
    app.addToCart(app.products[0]);

    expect(JSON.parse(localStorage.getItem('foodsave-cart') ?? '[]')).toEqual([
      { productId: app.products[0].id, quantity: 1 }
    ]);
  });

  it('filters the catalog by category and search text', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    fixture.detectChanges();

    app.selectedCategory = 'frutas';
    app.searchTerm = 'banano';

    expect(app.filteredProducts).toHaveLength(1);
    expect(app.filteredProducts[0].title).toContain('Banano');
  });

  it('removes an item when its cart quantity reaches zero', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    fixture.detectChanges();
    app.addToCart(app.products[0]);

    app.changeQuantity(app.products[0].id, -1);

    expect(app.cartItems).toHaveLength(0);
  });
});
