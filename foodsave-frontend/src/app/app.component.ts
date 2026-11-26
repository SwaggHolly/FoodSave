import { HttpErrorResponse } from '@angular/common/http';
import { CommonModule, isPlatformBrowser, registerLocaleData } from '@angular/common';
import {
  ApplicationRef,
  ChangeDetectorRef,
  Component,
  Inject,
  OnDestroy,
  PLATFORM_ID
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import localeEsCo from '@angular/common/locales/es-CO';
import { filter, take } from 'rxjs';
import { CreateOrderRequest, OrderDelivery, OrderReceipt } from './models/order.model';
import { PRIVACY_POLICY_VERSION } from './models/privacy-policy';
import { Product } from './models/product.model';
import type {
  MerchantApplicationRequest,
  MerchantProductRequest
} from './models/merchant.model';
import { UpdateUserProfile } from './models/user-profile.model';
import { PrivacyPolicyComponent } from './components/privacy-policy/privacy-policy.component';
import { AccountService } from './services/account.service';
import {
  FoodsaveService,
  OrderStatusUpdate
} from './services/foodsave.service';
import { Subscription } from 'rxjs';

registerLocaleData(localeEsCo, 'es-CO');

interface CartItem {
  product: Product;
  quantity: number;
}

interface SavedCartItem {
  productId: string;
  quantity: number;
}

interface OrderConfirmation {
  receipt: OrderReceipt;
  buyerName: string;
  delivery: OrderDelivery;
  items: Array<{
    productId: string;
    title: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
}

type CategoryFilter = 'todos' | Product['category'];
type AccountMode = 'signup' | 'confirm' | 'signin' | 'profile' | 'merchant';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, PrivacyPolicyComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnDestroy {
  products: Product[] = [];
  cartItems: CartItem[] = [];
  searchTerm = '';
  selectedCategory: CategoryFilter = 'todos';
  cartOpen = false;
  accountOpen = false;
  accountMode: AccountMode = 'signup';
  accountType: 'buyer' | 'seller' = 'buyer';
  private sellerRegistrationEmail = '';
  accountName = '';
  accountEmail = '';
  accountPhone = '';
  accountPassword = '';
  accountPrivacyAccepted = false;
  privacyPolicyOpen = false;
  confirmationCode = '';
  accountError = '';
  accountMessage = '';
  merchantStoreName = '';
  merchantOwnerName = '';
  merchantEmail = '';
  merchantPhone = '';
  merchantCity = '';
  merchantAddress = '';
  merchantDescription = '';
  merchantProductTitle = '';
  merchantProductCategory: Product['category'] = 'frutas';
  merchantOriginalPrice = 10000;
  merchantDiscountPrice = 4000;
  merchantExpirationDate = '';
  merchantProductStock = 1;
  merchantImageFile: File | null = null;
  merchantLoading = false;
  isSubmittingAccount = false;
  notice = '';
  paymentStatusMessage = '';
  orderConfirmation: OrderConfirmation | null = null;
  orderConfirmationOpen = false;
  orderReservationExpired = false;
  orderError = '';
  isLoadingProducts = true;
  catalogError = '';
  buyerName = '';
  buyerPhone = '';
  buyerEmail = '';
  orderPrivacyAccepted = false;
  deliveryMethod: OrderDelivery['method'] = 'pickup';
  deliveryCity = '';
  deliveryZone = '';
  deliveryNeighborhood = '';
  deliveryAddress = '';
  deliveryReference = '';
  isSubmittingOrder = false;
  private readonly storageKey = 'foodsave-cart';
  private noticeTimeout?: ReturnType<typeof setTimeout>;
  private orderExpirationTimeout?: ReturnType<typeof setTimeout>;
  private paymentStatusSubscription?: Subscription;
  private paymentStatus?: OrderStatusUpdate['status'];
  private paymentOrderId?: string;

  constructor(
    private readonly foodSave: FoodsaveService,
    readonly account: AccountService,
    private readonly applicationRef: ApplicationRef,
    private readonly changeDetector: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private readonly platformId: object
  ) {
    if (isPlatformBrowser(this.platformId)) {
      this.initializePaymentStatus();
      void this.restoreAccount();
      this.applicationRef.isStable
        .pipe(
          filter((isStable) => isStable),
          take(1)
        )
        .subscribe(() => this.loadProducts());
    }
  }

  ngOnDestroy(): void {
    this.paymentStatusSubscription?.unsubscribe();
    if (this.noticeTimeout) clearTimeout(this.noticeTimeout);
    if (this.orderExpirationTimeout) clearTimeout(this.orderExpirationTimeout);
  }

  reloadProducts(): void {
    this.loadProducts();
  }

  openAccount(): void {
    this.accountError = '';
    this.accountMessage = '';
    this.accountOpen = true;
    if (this.account.user()) {
      this.accountMode = 'profile';
      const profile = this.account.profile();
      this.accountName = profile?.name ?? '';
      this.accountEmail = profile?.email ?? this.account.user()?.email ?? '';
      this.accountPhone = profile?.phone ?? '';
      this.merchantOwnerName = this.accountName;
      this.merchantEmail = this.accountEmail;
      this.merchantPhone = this.accountPhone;
      void this.refreshMerchantApplication();
    } else {
      this.accountMode = 'signup';
    }
  }

  setAccountMode(mode: AccountMode): void {
    this.accountMode = mode;
    this.accountError = '';
    this.accountMessage = '';
  }

  async submitRegistration(): Promise<void> {
    this.accountError = '';
    this.accountMessage = '';
    if (!this.accountPrivacyAccepted) {
      this.accountError = 'Debes aceptar la política de privacidad para crear tu cuenta.';
      return;
    }
    this.isSubmittingAccount = true;
    try {
      await this.account.register({
        name: this.accountName,
        email: this.accountEmail,
        phone: this.accountPhone,
        password: this.accountPassword,
        privacyPolicyVersion: PRIVACY_POLICY_VERSION
      });
      this.sellerRegistrationEmail = this.accountType === 'seller'
        ? this.accountEmail.trim().toLowerCase()
        : '';
      this.accountMode = 'confirm';
      this.accountMessage = 'Te enviamos un código de verificación a tu correo.';
    } catch (error: unknown) {
      this.accountError = this.accountErrorMessage(error);
    } finally {
      this.isSubmittingAccount = false;
      this.changeDetector.markForCheck();
    }
  }

  async confirmRegistration(): Promise<void> {
    this.accountError = '';
    this.accountMessage = '';
    this.isSubmittingAccount = true;
    try {
      await this.account.confirmRegistration(this.accountEmail, this.confirmationCode);
      this.accountMode = 'signin';
      this.accountPassword = '';
      this.accountMessage = 'Correo verificado. Ahora puedes iniciar sesión.';
    } catch (error: unknown) {
      this.accountError = this.accountErrorMessage(error);
    } finally {
      this.isSubmittingAccount = false;
      this.changeDetector.markForCheck();
    }
  }

  async resendConfirmationCode(): Promise<void> {
    this.accountError = '';
    this.accountMessage = '';
    this.isSubmittingAccount = true;
    try {
      await this.account.resendConfirmationCode(this.accountEmail);
      this.accountMessage = 'Te enviamos un nuevo código de verificación.';
    } catch (error: unknown) {
      this.accountError = this.accountErrorMessage(error);
    } finally {
      this.isSubmittingAccount = false;
      this.changeDetector.markForCheck();
    }
  }

  async submitSignIn(): Promise<void> {
    this.accountError = '';
    this.accountMessage = '';
    if (!this.accountPrivacyAccepted) {
      this.accountError = 'Debes aceptar la política de privacidad para continuar.';
      return;
    }
    this.isSubmittingAccount = true;
    try {
      const profile = await this.account.signInWithEmail({
        email: this.accountEmail,
        password: this.accountPassword
      }, PRIVACY_POLICY_VERSION);
      this.buyerName = profile.name;
      this.buyerPhone = profile.phone;
      this.buyerEmail = profile.email;
      this.accountMode = 'profile';
      this.accountName = profile.name;
      this.accountEmail = profile.email;
      this.accountPhone = profile.phone;
      this.merchantOwnerName = profile.name;
      this.merchantEmail = profile.email;
      this.merchantPhone = profile.phone;
      this.accountPassword = '';
      this.accountMessage = `Sesión iniciada. Bienvenido${profile.name.trim() ? `, ${profile.name.trim()}` : ''}.`;
      await this.refreshMerchantApplication();
      if (this.sellerRegistrationEmail === profile.email.trim().toLowerCase()) {
        this.accountMode = 'merchant';
        this.accountMessage = 'Completa los datos de tu tienda para comenzar a vender.';
        this.sellerRegistrationEmail = '';
      }
    } catch (error: unknown) {
      this.accountError = this.accountErrorMessage(error);
      if (this.account.user()) {
        this.accountMode = 'profile';
        this.accountName = this.account.profile()?.name ?? '';
        this.accountEmail = this.account.user()?.email ?? '';
        this.accountPhone = this.account.profile()?.phone ?? '';
      }
    } finally {
      this.isSubmittingAccount = false;
      this.changeDetector.markForCheck();
    }
  }

  async saveAccountProfile(): Promise<void> {
    this.accountError = '';
    this.accountMessage = '';
    this.isSubmittingAccount = true;
    try {
      const profile: UpdateUserProfile = {
        name: this.accountName.trim(),
        phone: this.accountPhone.trim(),
        privacyPolicyVersion: PRIVACY_POLICY_VERSION
      };
      const saved = await this.account.saveProfile(profile);
      this.buyerName = saved.name;
      this.buyerPhone = saved.phone;
      this.accountName = saved.name;
      this.accountEmail = saved.email;
      this.accountPhone = saved.phone;
      this.accountMessage = 'Tus datos se guardaron correctamente.';
    } catch (error: unknown) {
      this.accountError = this.accountErrorMessage(error);
    } finally {
      this.isSubmittingAccount = false;
      this.changeDetector.markForCheck();
    }
  }

  async submitMerchantApplication(): Promise<void> {
    this.accountError = '';
    this.accountMessage = '';
    this.isSubmittingAccount = true;
    try {
      const request: MerchantApplicationRequest = {
        storeName: this.merchantStoreName.trim(),
        ownerName: this.merchantOwnerName.trim(),
        contactEmail: this.merchantEmail.trim(),
        phone: this.merchantPhone.trim(),
        city: this.merchantCity.trim(),
        address: this.merchantAddress.trim(),
        description: this.merchantDescription.trim()
      };
      await this.account.submitMerchantApplication(request);
      this.accountMessage = 'Tu tienda está lista. Ya puedes publicar productos.';
    } catch (error: unknown) {
      this.accountError = this.accountErrorMessage(error);
    } finally {
      this.isSubmittingAccount = false;
      this.changeDetector.markForCheck();
    }
  }

  onMerchantImageSelected(event: Event): void {
    const input = event.target;
    this.merchantImageFile =
      input instanceof HTMLInputElement ? input.files?.[0] ?? null : null;
  }

  async submitMerchantProduct(): Promise<void> {
    this.accountError = '';
    this.accountMessage = '';
    if (!this.merchantImageFile) {
      this.accountError = 'Selecciona una imagen del producto.';
      return;
    }
    if (this.merchantImageFile.size > 5 * 1024 * 1024) {
      this.accountError = 'La imagen no puede superar 5 MB.';
      return;
    }
    const expires = new Date(this.merchantExpirationDate);
    const remaining = expires.getTime() - Date.now();
    const days = this.merchantProductCategory === 'verduras' ? 2 : 5;
    if (!Number.isFinite(remaining) || remaining <= 0 || remaining > days * 86_400_000) {
      this.accountError = `El vencimiento debe ser futuro y ocurrir dentro de ${days} días.`;
      return;
    }
    this.isSubmittingAccount = true;
    try {
      const imageKey = await this.account.uploadMerchantImage(this.merchantImageFile);
      const product: MerchantProductRequest = {
        title: this.merchantProductTitle.trim(),
        category: this.merchantProductCategory,
        originalPrice: this.merchantOriginalPrice,
        discountPrice: this.merchantDiscountPrice,
        expirationDate: expires.toISOString(),
        stock: this.merchantProductStock,
        imageKey
      };
      await this.account.createMerchantProduct(product);
      this.accountMessage = 'Producto publicado correctamente.';
      this.merchantProductTitle = '';
      this.merchantImageFile = null;
      this.loadProducts();
      this.showNotice('Tu producto ya aparece en el catálogo.');
    } catch (error: unknown) {
      this.accountError = this.accountErrorMessage(error);
    } finally {
      this.isSubmittingAccount = false;
      this.changeDetector.markForCheck();
    }
  }

  async signOut(): Promise<void> {
    this.accountError = '';
    this.isSubmittingAccount = true;
    try {
      await this.account.signOutCurrentUser();
      this.buyerName = '';
      this.buyerPhone = '';
      this.buyerEmail = '';
      this.accountOpen = false;
      this.showNotice('Cerraste sesión.');
    } catch (error: unknown) {
      this.accountError = this.accountErrorMessage(error);
    } finally {
      this.isSubmittingAccount = false;
      this.changeDetector.markForCheck();
    }
  }

  private initializePaymentStatus(): void {
    const url = new URL(window.location.href);
    const paymentReturn = url.searchParams.get('payment');
    const orderId = url.searchParams.get('order_id');
    if (!paymentReturn || !orderId) return;

    url.searchParams.delete('payment');
    url.searchParams.delete('order_id');
    window.history.replaceState({}, '', url);

    let token: string | null;
    try {
      token = sessionStorage.getItem(`foodsave-order-${orderId}`);
    } catch (error: unknown) {
      console.error('No se pudo recuperar el token temporal del pedido.', error);
      this.paymentStatusMessage += ' El navegador no permite recuperar el token temporal.';
      return;
    }
    this.paymentOrderId = orderId;
    this.paymentStatusMessage =
      paymentReturn === 'success'
        ? 'Mercado Pago indicó que el pago se completó. Estamos verificando la confirmación.'
        : paymentReturn === 'failure'
          ? 'El pago no se completó. Consulta el estado de tu pedido antes de volver a intentarlo.'
          : 'El pago está pendiente. Te mostraremos el cambio cuando Mercado Pago lo confirme.';
    if (!token) {
      this.paymentStatusMessage += ' No encontramos el token temporal para consultar esta reserva.';
      return;
    }

    this.paymentStatusSubscription = this.foodSave
      .watchOrderStatus(orderId, token, () => {
        this.foodSave.getOrderStatus(orderId, token).subscribe({
          next: (status) => this.updatePaymentStatus(status),
          error: (error: unknown) => {
            console.error('No se pudo consultar el estado inicial del pedido.', error);
          }
        });
      })
      .subscribe({
        next: (status) => this.updatePaymentStatus(status),
        error: (error: unknown) => {
          console.error('No se pudo conectar al seguimiento del pedido.', error);
          this.paymentStatusMessage =
            'No pudimos conectarnos para actualizar el pedido. La confirmación del pago no depende de esta pantalla.';
          this.changeDetector.markForCheck();
        }
      });
  }

  private updatePaymentStatus(update: OrderStatusUpdate): void {
    const statusRank: Record<OrderStatusUpdate['status'], number> = {
      reserved: 0,
      pending_payment: 0,
      expired: 1,
      paid: 2,
      payment_late: 3
    };
    if (
      this.paymentStatus &&
      statusRank[update.status] < statusRank[this.paymentStatus]
    ) {
      return;
    }
    this.paymentStatus = update.status;
    switch (update.status) {
      case 'reserved':
        this.paymentStatusMessage = 'Tu reserva está activa por 15 minutos.';
        return;
      case 'paid':
        this.paymentStatusMessage = '¡Pago confirmado! Tu pedido quedó reservado.';
        break;
      case 'expired':
        this.paymentStatusMessage =
          'Venció el tiempo de pago y las unidades volvieron al inventario.';
        break;
      case 'payment_late':
        this.paymentStatusMessage =
          'El pago llegó después de vencer la reserva. Contacta a FoodSave para revisar el caso.';
        break;
      case 'pending_payment':
        this.paymentStatusMessage =
          'Tu reserva sigue pendiente de confirmación. Mantendremos las unidades por 15 minutos.';
        return;
    }
    this.paymentStatusSubscription?.unsubscribe();
    if (this.paymentOrderId) {
      try {
        sessionStorage.removeItem(`foodsave-order-${this.paymentOrderId}`);
      } catch (error: unknown) {
        console.error('No se pudo eliminar el token temporal del pedido.', error);
      }
    }
    this.changeDetector.markForCheck();
  }

  private loadProducts(): void {
    this.isLoadingProducts = true;
    this.catalogError = '';
    this.foodSave.getProducts().subscribe({
      next: (products) => {
        this.products = products;
        this.cartItems = this.loadCart();
        this.isLoadingProducts = false;
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => {
        this.catalogError = this.apiErrorMessage(error);
        this.isLoadingProducts = false;
        this.changeDetector.markForCheck();
      }
    });
  }

  private async restoreAccount(): Promise<void> {
    try {
      const profile = await this.account.restoreSession();
      if (profile) {
        this.buyerName = profile.name;
        this.buyerPhone = profile.phone;
        this.buyerEmail = profile.email;
        await this.refreshMerchantApplication();
      }
    } catch (error: unknown) {
      console.error('No se pudo recuperar la cuenta de FoodSave.', error);
      if (error instanceof Error && error.message.includes('política de privacidad vigente')) {
        this.accountMode = 'signin';
        this.accountOpen = true;
        this.accountError = error.message;
        this.changeDetector.markForCheck();
        return;
      }
      this.showNotice('No se pudo recuperar tu cuenta. Intenta iniciar sesión de nuevo.');
    } finally {
      this.changeDetector.markForCheck();
    }
  }

  private async refreshMerchantApplication(): Promise<void> {
    this.merchantLoading = true;
    try {
      await this.account.loadMerchantApplication();
    } catch (error: unknown) {
      console.error('No se pudo consultar la solicitud de comercio.', error);
      this.accountError = this.accountErrorMessage(error);
    } finally {
      this.merchantLoading = false;
      this.changeDetector.markForCheck();
    }
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
    if (this.isSubmittingOrder) return;
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
    if (this.isSubmittingOrder) return;
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
    if (this.isSubmittingOrder) return;
    this.cartItems = this.cartItems.filter((item) => item.product.id !== productId);
    this.persistCart();
  }

  get accountInitials(): string {
    const name = this.account.profile()?.name?.trim();
    return name
      ? name
          .split(/\s+/)
          .slice(0, 2)
          .map((part) => part.charAt(0).toLocaleUpperCase('es'))
          .join('')
      : 'FS';
  }

  finishOrder(): void {
    if (this.cartItems.length === 0 || this.isSubmittingOrder) return;
    this.orderError = '';
    if (!this.buyerName.trim() || !this.buyerPhone.trim()) {
      this.showNotice('Completa tu nombre y teléfono para reservar el pedido.');
      return;
    }
    if (!this.orderPrivacyAccepted) {
      this.showNotice('Acepta la política de privacidad para continuar con la reserva.');
      return;
    }
    const buyerEmail = this.buyerEmail.trim();
    if (buyerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)) {
      this.showNotice('Ingresa un correo electrónico válido o deja el campo vacío.');
      return;
    }
    if (
      this.deliveryMethod === 'delivery' &&
      (!this.deliveryCity.trim() ||
        !this.deliveryZone.trim() ||
        !this.deliveryNeighborhood.trim() ||
        !this.deliveryAddress.trim())
    ) {
      this.showNotice('Completa ciudad, zona, barrio y dirección para el domicilio.');
      return;
    }

    const items = this.cartItems.map(({ product, quantity }) => ({
      productId: product.id,
      title: product.title,
      quantity,
      unitPrice: product.discountPrice,
      lineTotal: product.discountPrice * quantity
    }));
    const request: CreateOrderRequest = {
      buyerName: this.buyerName.trim(),
      buyerPhone: this.buyerPhone.trim(),
      ...(buyerEmail ? { buyerEmail } : {}),
      privacyPolicyVersion: PRIVACY_POLICY_VERSION,
      delivery:
        this.deliveryMethod === 'pickup'
          ? { method: 'pickup' }
          : {
              method: 'delivery',
              city: this.deliveryCity.trim(),
              zone: this.deliveryZone.trim(),
              neighborhood: this.deliveryNeighborhood.trim(),
              address: this.deliveryAddress.trim(),
              reference: this.deliveryReference.trim()
            },
      items: items.map(({ productId, quantity }) => ({
        productId,
        quantity
      }))
    };

    this.isSubmittingOrder = true;
    this.foodSave.createOrder(request).subscribe({
      next: (receipt: OrderReceipt) => {
        this.orderConfirmation = {
          receipt,
          buyerName: request.buyerName,
          delivery: request.delivery ?? { method: 'pickup' },
          items: receipt.items
        };
        this.orderConfirmationOpen = true;
        if (this.orderExpirationTimeout) clearTimeout(this.orderExpirationTimeout);
        const remaining = Date.parse(receipt.reservationExpiresAt) - Date.now();
        this.orderReservationExpired = remaining <= 0;
        if (!this.orderReservationExpired) {
          this.orderExpirationTimeout = setTimeout(() => {
            this.orderReservationExpired = true;
            this.changeDetector.markForCheck();
          }, remaining);
        }
        this.cartItems = [];
        this.persistCart();
        this.cartOpen = false;
        this.buyerName = this.account.profile()?.name ?? '';
        this.buyerPhone = this.account.profile()?.phone ?? '';
        this.isSubmittingOrder = false;
        this.loadProducts();
        try {
          sessionStorage.setItem(
            `foodsave-order-${receipt.orderId}`,
            receipt.statusSubscriptionToken
          );
        } catch (error: unknown) {
          console.error('No se pudo guardar el token temporal del pedido.', error);
        }
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => {
        this.isSubmittingOrder = false;
        if (error instanceof HttpErrorResponse && error.status === 409) {
          this.loadProducts();
        }
        this.orderError = this.apiErrorMessage(error);
        this.changeDetector.markForCheck();
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
      this.noticeTimeout = setTimeout(() => {
        this.notice = '';
        this.changeDetector.markForCheck();
      }, 3500);
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

  private accountErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) return this.apiErrorMessage(error);
    if (error instanceof Error) {
      switch (error.name) {
        case 'UsernameExistsException':
          return 'Ya existe una cuenta con ese correo electrónico.';
        case 'CodeMismatchException':
          return 'El código de verificación no es correcto.';
        case 'ExpiredCodeException':
          return 'El código venció. Solicita uno nuevo.';
        case 'InvalidPasswordException':
          return 'La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número.';
        case 'UserNotConfirmedException':
          return 'Primero verifica tu correo con el código que te enviamos.';
        case 'NotAuthorizedException':
          return 'El correo o la contraseña no son correctos.';
        case 'LimitExceededException':
        case 'TooManyRequestsException':
          return 'Se hicieron demasiados intentos. Espera un momento y vuelve a intentar.';
        default:
          return error.message;
      }
    }
    console.error('Ocurrió un error inesperado en la cuenta de FoodSave.', error);
    return 'No se pudo completar la operación de cuenta. Intenta de nuevo.';
  }
}