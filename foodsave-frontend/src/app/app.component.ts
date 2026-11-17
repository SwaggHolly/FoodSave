import { HttpErrorResponse } from '@angular/common/http';
import { CommonModule, isPlatformBrowser, registerLocaleData } from '@angular/common';
import { Component, Inject, PLATFORM_ID } from '@angular/core';
import { FormsModule } from '@angular/forms';
import localeEsCo from '@angular/common/locales/es-CO';
import { CreateOrderRequest, OrderReceipt } from './models/order.model';
import { Product } from './models/product.model';
import { FoodsaveService } from './services/foodsave.service';

registerLocaleData(localeEsCo, 'es-CO');

interface CartItem {
  product: Product;
  quantity: number;
}

interface SavedCartItem {
  productId: string;
  quantity: number;
}

type CategoryFilter = 'todos' | Product['category'];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  products: Product[] = [];
  cartItems: CartItem[] = [];
  searchTerm = '';
  selectedCategory: CategoryFilter = 'todos';
  cartOpen = false;
  notice = '';
  isLoadingProducts = true;
  catalogError = '';
  buyerName = '';
  buyerPhone = '';
  isSubmittingOrder = false;
  private readonly storageKey = 'foodsave-cart';
  private noticeTimeout?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly foodSave: FoodsaveService,
    @Inject(PLATFORM_ID) private readonly platformId: object
  ) {
    if (!isPlatformBrowser(this.platformId)) return;
    this.loadProducts();
  }

  reloadProducts(): void {
    this.loadProducts();
  }

  private loadProducts(): void {
    this.isLoadingProducts = true;
    this.catalogError = '';
    this.foodSave.getProducts().subscribe({
      next: (products) => {
        this.products = products;
        this.cartItems = this.loadCart();
        this.isLoadingProducts = false;
      },
      error: (error: unknown) => {
        this.catalogError = this.apiErrorMessage(error);
        this.isLoadingProducts = false;
      }
    });
  }

  get filteredProducts(): Product[] {
    const search = this.searchTerm.trim().toLocaleLowerCase('es');
    return this.products.filter((product) => {
      const matchesCategory =
        this.selectedCategory === 'todos' || product.category === this.selectedCategory;
      const matchesSearch =
        !search ||
        `${product.title} ${product.storeName} ${product.category}`
          .toLocaleLowerCase('es')
          .includes(search);
      return matchesCategory && matchesSearch;
    });
  }

  get totalItems(): number {
    return this.cartItems.reduce((total, item) => total + item.quantity, 0);
  }

  get cartTotal(): number {
    return this.cartItems.reduce(
      (total, item) => total + item.product.discountPrice * item.quantity,
      0
    );
  }

  addToCart(product: Product): void {
    const item = this.cartItems.find((cartItem) => cartItem.product.id === product.id);
    if (item) {
      if (item.quantity >= product.stock) {
        this.showNotice('Ya agregaste todas las unidades disponibles.');
        return;
      }
      item.quantity += 1;
    } else {
      this.cartItems = [...this.cartItems, { product, quantity: 1 }];
    }

    this.persistCart();
    this.showNotice(`${product.title} se agregó al carrito.`);
  }

  changeQuantity(productId: string, change: number): void {
    const item = this.cartItems.find((cartItem) => cartItem.product.id === productId);
    if (!item) return;

    const nextQuantity = item.quantity + change;
    if (nextQuantity <= 0) {
      this.removeFromCart(productId);
      return;
    }
    if (nextQuantity > item.product.stock) {
      this.showNotice('No hay más unidades disponibles de este producto.');
      return;
    }

    item.quantity = nextQuantity;
    this.persistCart();
  }

  removeFromCart(productId: string): void {
    this.cartItems = this.cartItems.filter((item) => item.product.id !== productId);
    this.persistCart();
  }

  finishOrder(): void {
    if (this.cartItems.length === 0 || this.isSubmittingOrder) return;
    if (!this.buyerName.trim() || !this.buyerPhone.trim()) {
      this.showNotice('Completa tu nombre y teléfono para reservar el pedido.');
      return;
    }

    const request: CreateOrderRequest = {
      buyerName: this.buyerName.trim(),
      buyerPhone: this.buyerPhone.trim(),
      items: this.cartItems.map(({ product, quantity }) => ({
        productId: product.id,
        quantity
      }))
    };

    this.isSubmittingOrder = true;
    this.foodSave.createOrder(request).subscribe({
      next: (receipt: OrderReceipt) => {
        this.cartItems = [];
        this.persistCart();
        this.cartOpen = false;
        this.buyerName = '';
        this.buyerPhone = '';
        this.isSubmittingOrder = false;
        this.loadProducts();
        this.showNotice(
          `Reserva ${receipt.orderId} creada. La tienda coordinará contigo la recogida; esta versión no procesa pagos.`
        );
      },
      error: (error: unknown) => {
        this.isSubmittingOrder = false;
        if (error instanceof HttpErrorResponse && error.status === 409) {
          this.loadProducts();
        }
        this.showNotice(this.apiErrorMessage(error));
      }
    });
  }

  expirationLabel(expirationDate: string | Date): string {
    const hoursLeft = Math.max(
      0,
      Math.ceil((new Date(expirationDate).getTime() - Date.now()) / 3_600_000)
    );
    if (hoursLeft < 24) return `Vence en ${hoursLeft} h`;
    const daysLeft = Math.ceil(hoursLeft / 24);
    return daysLeft === 1 ? 'Vence mañana' : `Vence en ${daysLeft} días`;
  }

  onImageError(event: Event): void {
    if (event.target instanceof HTMLImageElement) {
      event.target.src =
        'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 640 420%22%3E%3Crect width=%22640%22 height=%22420%22 fill=%22%23edf3e8%22/%3E%3Ctext x=%2250%25%22 y=%2253%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 font-size=%2280%22%3E%F0%9F%A5%AC%3C/text%3E%3C/svg%3E';
    }
  }

  private loadCart(): CartItem[] {
    if (!isPlatformBrowser(this.platformId)) return [];

    try {
      const saved = localStorage.getItem(this.storageKey);
      if (!saved) return [];
      const parsed: unknown = JSON.parse(saved);
      if (!Array.isArray(parsed)) return [];

      return parsed.flatMap((entry: unknown) => {
        if (!this.isSavedCartItem(entry)) return [];
        const product = this.products.find((item) => item.id === entry.productId);
        if (!product || product.stock < 1 || entry.quantity < 1) return [];
        return [{ product, quantity: Math.min(entry.quantity, product.stock) }];
      });
    } catch (error: unknown) {
      console.error('No se pudo recuperar el carrito guardado.', error);
      return [];
    }
  }

  private persistCart(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const saved: SavedCartItem[] = this.cartItems.map(({ product, quantity }) => ({
      productId: product.id,
      quantity
    }));
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(saved));
    } catch (error: unknown) {
      console.error('No se pudo guardar el carrito.', error);
      this.showNotice('No se pudo guardar el carrito en este dispositivo.');
    }
  }

  private isSavedCartItem(value: unknown): value is SavedCartItem {
    if (typeof value !== 'object' || value === null) return false;
    const item = value as Record<string, unknown>;
    return (
      typeof item['productId'] === 'string' &&
      typeof item['quantity'] === 'number' &&
      Number.isInteger(item['quantity'])
    );
  }

  private showNotice(message: string): void {
    this.notice = message;
    if (isPlatformBrowser(this.platformId)) {
      if (this.noticeTimeout) clearTimeout(this.noticeTimeout);
      this.noticeTimeout = setTimeout(() => (this.notice = ''), 3500);
    }
  }

  private apiErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) {
        return 'No se pudo conectar con FoodSave. Revisa que la API esté ejecutándose.';
      }
      const body: unknown = error.error;
      if (
        typeof body === 'object' &&
        body !== null &&
        'message' in body &&
        typeof body.message === 'string'
      ) {
        return body.message;
      }
    }

    console.error('Ocurrió un error inesperado al comunicarse con FoodSave.', error);
    return 'Ocurrió un error inesperado. Intenta de nuevo.';
  }
}