import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyStructuredResultV2
} from 'aws-lambda';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { DynamoDBFoodSaveRepository } from './src/adapters/output/database/dynamodb-foodsave-repository.js';
import { createOrderRequestSchema } from './src/domain/models/order.js';
import { updateUserProfileSchema } from './src/domain/models/user-profile.js';
import { PRIVACY_POLICY_VERSION } from './src/domain/models/privacy.js';
import {
  InventoryConflictError,
  ProductNotFoundError,
  ReserveOrderService
} from './src/domain/services/reserve-order.js';
import {
  MercadoPagoPaymentGateway,
  PaymentConfigurationError,
  PaymentProviderError
} from './src/adapters/output/payment/mercado-pago-payment-gateway.js';
import type { PaymentGateway } from './src/adapters/output/payment/mercado-pago-payment-gateway.js';
import {
  PRODUCT_CATEGORIES,
  type ProductCategory
} from './src/domain/models/product.js';
import type { FoodSaveRepository } from './src/ports/output/foodsave-repository.js';
import {
  merchantApplicationRequestSchema,
  merchantProductRequestSchema,
  MerchantApplicationAlreadyExistsError,
  MerchantNotApprovedError
} from './src/domain/models/merchant.js';
import {
  ImageStorageConfigurationError,
  S3ImageStorage,
  UnsupportedImageTypeError
} from './src/adapters/output/storage/s3-image-storage.js';
import type { ImageStorage } from './src/adapters/output/storage/s3-image-storage.js';

function jsonResponse(
  statusCode: number,
  body: unknown
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body)
  };
}

function isProductCategory(value: string): value is ProductCategory {
  return PRODUCT_CATEGORIES.some((category) => category === value);
}

function getJwtClaims(
  event: APIGatewayProxyEventV2
): Record<string, string | number | boolean | string[]> | undefined {
  if (!('authorizer' in event.requestContext)) return undefined;
  const context =
    event.requestContext as APIGatewayProxyEventV2WithJWTAuthorizer['requestContext'];
  return context.authorizer.jwt.claims;
}

export function createApiHandler(
  repository: FoodSaveRepository,
  paymentGateway: PaymentGateway = new MercadoPagoPaymentGateway(),
  imageStorage: ImageStorage = new S3ImageStorage()
): APIGatewayProxyHandlerV2 {
  const reserveOrder = new ReserveOrderService(repository);

  return async (event: APIGatewayProxyEventV2) => {
    const method = event.requestContext.http.method;
    const path = event.rawPath;

    if (method === 'GET' && path === '/health') {
      return jsonResponse(200, { status: 'ok', service: 'foodsave-api' });
    }

    if (method === 'GET' && path === '/products') {
      const category = event.queryStringParameters?.['category']?.trim();
      const search = event.queryStringParameters?.['search']?.trim();
      let selectedCategory: ProductCategory | undefined;
      if (category) {
        if (!isProductCategory(category)) {
          return jsonResponse(400, { message: 'La categoría no es válida.' });
        }
        selectedCategory = category;
      }
      if (search && search.length > 100) {
        return jsonResponse(400, { message: 'La búsqueda no puede superar 100 caracteres.' });
      }

      try {
        const catalogProducts = await repository.listProducts({
          ...(selectedCategory ? { category: selectedCategory } : {}),
          ...(search ? { search } : {})
        });
        const products = await Promise.all(
          catalogProducts.map(async (product) =>
            product.imageKey
              ? {
                  ...product,
                  imageUrl: await imageStorage.createReadUrl(product.imageKey)
                }
              : product
          )
        );
        return jsonResponse(200, { products });
      } catch (error: unknown) {
        if (error instanceof ImageStorageConfigurationError) {
          return jsonResponse(503, { message: error.message });
        }
        console.error('No se pudo consultar el catálogo.', error);
        return jsonResponse(500, { message: 'No se pudo consultar el catálogo.' });
      }
    }

    if (method === 'POST' && path === '/webhooks/mercadopago') {
      if (!paymentGateway.isConfigured()) {
        return jsonResponse(503, { message: 'El servicio de pagos aún no está configurado.' });
      }

      let payload: unknown;
      try {
        const rawBody = event.body ?? '';
        payload = JSON.parse(
          event.isBase64Encoded
            ? Buffer.from(rawBody, 'base64').toString('utf8')
            : rawBody
        );
      } catch {
        return jsonResponse(400, { message: 'El cuerpo de la notificación no es JSON válido.' });
      }

      const bodyDataId =
        typeof payload === 'object' &&
        payload !== null &&
        'data' in payload &&
        typeof payload.data === 'object' &&
        payload.data !== null &&
        'id' in payload.data
          ? String(payload.data.id)
          : undefined;
      const dataId = event.queryStringParameters?.['data.id'] ?? bodyDataId;
      const headers = event.headers ?? {};
      const signature = Object.entries(headers).find(
        ([name]) => name.toLowerCase() === 'x-signature'
      )?.[1];
      const requestId = Object.entries(headers).find(
        ([name]) => name.toLowerCase() === 'x-request-id'
      )?.[1];
      if (!dataId || !signature || !requestId) {
        return jsonResponse(401, { message: 'La firma de la notificación no es válida.' });
      }

      try {
        if (!paymentGateway.verifyWebhookSignature(dataId, requestId, signature)) {
          return jsonResponse(401, { message: 'La firma de la notificación no es válida.' });
        }
        const payment = await paymentGateway.getPayment(dataId);
        const order = await repository.getOrder(payment.orderId);
        if (!order) {
          return jsonResponse(404, { message: 'No se encontró la reserva asociada al pago.' });
        }
        if (payment.amount !== order.total || payment.currency !== 'COP') {
          return jsonResponse(400, { message: 'El valor o la moneda del pago no coinciden.' });
        }
        if (payment.status !== 'approved') {
          return jsonResponse(200, { received: true, status: payment.status });
        }

        const paidAt = new Date();
        if (
          order.status === 'pending_payment' &&
          order.paymentExpiresAt > paidAt.toISOString()
        ) {
          const confirmed = await repository.markOrderPaid(
            order.id,
            payment.id,
            paidAt
          );
          if (confirmed) {
            return jsonResponse(200, { received: true, status: 'paid' });
          }
        }

        const latestOrder = await repository.getOrder(order.id);
        if (
          latestOrder &&
          (latestOrder.status === 'expired' ||
            (latestOrder.status === 'pending_payment' &&
              latestOrder.paymentExpiresAt <= paidAt.toISOString()))
        ) {
          await repository.markOrderPaymentLate(order.id, payment.id, paidAt);
          console.error('Pago aprobado después del vencimiento de la reserva.', {
            orderId: order.id,
            paymentId: payment.id
          });
          return jsonResponse(200, { received: true, status: 'payment_late' });
        }
        if (latestOrder?.status === 'paid' && latestOrder.paymentId === payment.id) {
          return jsonResponse(200, { received: true, status: 'paid' });
        }
        return jsonResponse(200, { received: true, status: 'not_confirmed' });
      } catch (error: unknown) {
        if (error instanceof PaymentConfigurationError) {
          return jsonResponse(503, { message: error.message });
        }
        if (error instanceof PaymentProviderError) {
          console.error('Mercado Pago no respondió correctamente a la notificación.', error);
          return jsonResponse(502, { message: 'No se pudo verificar el pago en este momento.' });
        }
        console.error('No se pudo procesar la notificación de pago.', error);
        return jsonResponse(500, { message: 'No se pudo procesar la notificación de pago.' });
      }
    }

    const orderStatusRoute = path.match(/^\/orders\/([^/]+)\/status$/);
    if (method === 'GET' && orderStatusRoute?.[1]) {
      const token = Object.entries(event.headers ?? {}).find(
        ([name]) => name.toLowerCase() === 'x-order-token'
      )?.[1];
      if (!token) {
        return jsonResponse(401, { message: 'El token de consulta del pedido es obligatorio.' });
      }

      try {
        let orderId: string;
        try {
          orderId = decodeURIComponent(orderStatusRoute[1]);
        } catch {
          return jsonResponse(400, { message: 'El identificador del pedido no es válido.' });
        }
        const order = await repository.getOrder(orderId);
        if (!order) return jsonResponse(404, { message: 'No se encontró el pedido.' });
        const expectedHash = Buffer.from(order.statusSubscriptionTokenHash ?? '', 'hex');
        const providedHash = createHash('sha256').update(token).digest();
        if (
          expectedHash.length !== providedHash.length ||
          !timingSafeEqual(expectedHash, providedHash)
        ) {
          return jsonResponse(403, { message: 'El token de consulta del pedido no es válido.' });
        }
        return jsonResponse(200, {
          orderId: order.id,
          status: order.status,
          paymentExpiresAt: order.paymentExpiresAt
        });
      } catch (error: unknown) {
        console.error('No se pudo consultar el estado del pedido.', error);
        return jsonResponse(500, { message: 'No se pudo consultar el estado del pedido.' });
      }
    }

    if (method === 'POST' && path === '/orders') {
      let body: unknown;
      try {
        const rawBody = event.body ?? '';
        body = JSON.parse(
          event.isBase64Encoded ? Buffer.from(rawBody, 'base64').toString('utf8') : rawBody
        );
      } catch {
        return jsonResponse(400, { message: 'El cuerpo de la solicitud no es JSON válido.' });
      }

      const request = createOrderRequestSchema.safeParse(body);
      if (!request.success) {
        return jsonResponse(400, {
          message: 'Revisa los datos del pedido.',
          details: z.treeifyError(request.error)
        });
      }

      if (!paymentGateway.isConfigured()) {
        return jsonResponse(503, {
          message: 'El pago en línea aún no está configurado. No se reservó inventario.'
        });
      }

      try {
        const withinRateLimit = await repository.consumeReservationRateLimit(
          event.requestContext.http.sourceIp,
          new Date()
        );
        if (!withinRateLimit) {
          return jsonResponse(429, {
            message: 'Hiciste varias reservas en poco tiempo. Espera unos minutos e intenta de nuevo.'
          });
        }
        const order = await reserveOrder.createOrder(request.data);
        const checkout = await paymentGateway.createCheckout(order);
        await repository.attachPaymentPreference(
          order.id,
          checkout.preferenceId,
          checkout.checkoutUrl
        );
        return jsonResponse(201, {
          orderId: order.id,
          status: order.status,
          total: order.total,
          createdAt: order.createdAt,
          paymentExpiresAt: order.paymentExpiresAt,
          statusSubscriptionToken: order.statusSubscriptionToken,
          checkoutUrl: checkout.checkoutUrl
        });
      } catch (error: unknown) {
        if (error instanceof ProductNotFoundError) {
          return jsonResponse(404, { message: error.message });
        }
        if (error instanceof InventoryConflictError) {
          return jsonResponse(409, { message: error.message });
        }
        if (error instanceof PaymentConfigurationError) {
          return jsonResponse(503, { message: error.message });
        }
        if (error instanceof PaymentProviderError) {
          console.error('No se pudo iniciar el checkout de Mercado Pago.', error);
          return jsonResponse(502, {
            message: 'No se pudo iniciar el pago. La reserva se liberará automáticamente al vencer.'
          });
        }
        console.error('No se pudo reservar el pedido.', error);
        return jsonResponse(500, { message: 'No se pudo reservar el pedido.' });
      }
    }

    if (
      (method === 'GET' || method === 'POST') &&
      path === '/merchant/application'
    ) {
      const claims = getJwtClaims(event);
      const sub = claims?.['sub'];
      if (typeof sub !== 'string') {
        return jsonResponse(401, { message: 'Inicia sesión para gestionar tu comercio.' });
      }
      if (claims?.['custom:privacy_version'] !== PRIVACY_POLICY_VERSION) {
        return jsonResponse(403, { message: 'Acepta la política de privacidad vigente para continuar.' });
      }

      if (method === 'GET') {
        try {
          const application = await repository.getMerchantApplication(sub);
          return application
            ? jsonResponse(200, application)
            : jsonResponse(404, { message: 'Esta cuenta aún no tiene una solicitud de comercio.' });
        } catch (error: unknown) {
          console.error('No se pudo consultar la solicitud de comercio.', error);
          return jsonResponse(500, { message: 'No se pudo consultar la solicitud de comercio.' });
        }
      }

      let body: unknown;
      try {
        const rawBody = event.body ?? '';
        body = JSON.parse(
          event.isBase64Encoded
            ? Buffer.from(rawBody, 'base64').toString('utf8')
            : rawBody
        );
      } catch {
        return jsonResponse(400, { message: 'El cuerpo de la solicitud no es JSON válido.' });
      }
      const request = merchantApplicationRequestSchema.safeParse(body);
      if (!request.success) {
        return jsonResponse(400, {
          message: 'Revisa los datos del comercio.',
          details: z.treeifyError(request.error)
        });
      }
      try {
        const application = await repository.createMerchantApplication(
          sub,
          request.data,
          new Date()
        );
        return jsonResponse(201, application);
      } catch (error: unknown) {
        if (error instanceof MerchantApplicationAlreadyExistsError) {
          return jsonResponse(409, { message: error.message });
        }
        console.error('No se pudo enviar la solicitud de comercio.', error);
        return jsonResponse(500, { message: 'No se pudo enviar la solicitud de comercio.' });
      }
    }

    if (method === 'PUT' && path.startsWith('/admin/merchant-applications/')) {
      const claims = getJwtClaims(event);
      const reviewerSub = claims?.['sub'];
      const groups = claims?.['cognito:groups'];
      if (
        typeof reviewerSub !== 'string' ||
        !Array.isArray(groups) ||
        !groups.includes('FoodSaveAdmins')
      ) {
        return jsonResponse(403, { message: 'Solo administradores pueden revisar comercios.' });
      }
      const match = path.match(/^\/admin\/merchant-applications\/([^/]+)\/decision$/);
      if (!match?.[1]) {
        return jsonResponse(404, { message: 'La ruta solicitada no existe.' });
      }
      let body: unknown;
      try {
        const rawBody = event.body ?? '';
        body = JSON.parse(
          event.isBase64Encoded
            ? Buffer.from(rawBody, 'base64').toString('utf8')
            : rawBody
        );
      } catch {
        return jsonResponse(400, { message: 'El cuerpo de la solicitud no es JSON válido.' });
      }
      const decision = z.object({ status: z.enum(['approved', 'rejected']) }).safeParse(body);
      if (!decision.success) {
        return jsonResponse(400, { message: 'La decisión debe ser approved o rejected.' });
      }
      try {
        const application = await repository.reviewMerchantApplication(
          decodeURIComponent(match[1]),
          decision.data.status,
          reviewerSub,
          new Date()
        );
        return application
          ? jsonResponse(200, application)
          : jsonResponse(409, { message: 'La solicitud no existe o ya fue revisada.' });
      } catch (error: unknown) {
        console.error('No se pudo revisar la solicitud de comercio.', error);
        return jsonResponse(500, { message: 'No se pudo revisar la solicitud de comercio.' });
      }
    }

    if (
      method === 'POST' &&
      (path === '/merchant/images/upload-url' || path === '/merchant/products')
    ) {
      const claims = getJwtClaims(event);
      const sub = claims?.['sub'];
      if (typeof sub !== 'string') {
        return jsonResponse(401, { message: 'Inicia sesión para gestionar tu comercio.' });
      }
      if (claims?.['custom:privacy_version'] !== PRIVACY_POLICY_VERSION) {
        return jsonResponse(403, { message: 'Acepta la política de privacidad vigente para continuar.' });
      }
      if (!imageStorage.isConfigured()) {
        return jsonResponse(503, { message: 'El almacenamiento de imágenes aún no está configurado.' });
      }

      let application;
      try {
        application = await repository.getMerchantApplication(sub);
      } catch (error: unknown) {
        console.error('No se pudo consultar el estado del comercio.', error);
        return jsonResponse(500, { message: 'No se pudo consultar el estado del comercio.' });
      }
      if (application?.status !== 'approved') {
        return jsonResponse(403, { message: 'Tu comercio debe estar aprobado para publicar productos.' });
      }

      let body: unknown;
      try {
        const rawBody = event.body ?? '';
        body = JSON.parse(
          event.isBase64Encoded
            ? Buffer.from(rawBody, 'base64').toString('utf8')
            : rawBody
        );
      } catch {
        return jsonResponse(400, { message: 'El cuerpo de la solicitud no es JSON válido.' });
      }

      if (path === '/merchant/images/upload-url') {
        const request = z.object({
          contentType: z.string().min(1).max(100)
        }).safeParse(body);
        if (!request.success) {
          return jsonResponse(400, { message: 'Indica el tipo de imagen que vas a cargar.' });
        }
        try {
          return jsonResponse(
            200,
            await imageStorage.createUpload(sub, request.data.contentType)
          );
        } catch (error: unknown) {
          if (error instanceof UnsupportedImageTypeError) {
            return jsonResponse(400, { message: error.message });
          }
          if (error instanceof ImageStorageConfigurationError) {
            return jsonResponse(503, { message: error.message });
          }
          console.error('No se pudo generar la carga segura de imagen.', error);
          return jsonResponse(500, { message: 'No se pudo preparar la carga de imagen.' });
        }
      }

      const request = merchantProductRequestSchema.safeParse(body);
      if (!request.success) {
        return jsonResponse(400, {
          message: 'Revisa los datos del producto.',
          details: z.treeifyError(request.error)
        });
      }
      if (!request.data.imageKey.startsWith(`merchant-images/${sub}/`)) {
        return jsonResponse(400, { message: 'La imagen no pertenece a este comercio.' });
      }
      try {
        if (!(await imageStorage.imageExists(request.data.imageKey))) {
          return jsonResponse(400, { message: 'Carga la imagen antes de publicar el producto.' });
        }
        const product = {
          id: randomUUID(),
          title: request.data.title,
          storeName: application.storeName,
          category: request.data.category,
          originalPrice: request.data.originalPrice,
          discountPrice: request.data.discountPrice,
          expirationDate: request.data.expirationDate,
          stock: request.data.stock,
          imageUrl: await imageStorage.createReadUrl(request.data.imageKey),
          imageKey: request.data.imageKey,
          merchantId: sub
        };
        await repository.createMerchantProduct(product);
        return jsonResponse(201, product);
      } catch (error: unknown) {
        if (error instanceof MerchantNotApprovedError) {
          return jsonResponse(403, { message: error.message });
        }
        if (error instanceof ImageStorageConfigurationError) {
          return jsonResponse(503, { message: error.message });
        }
        console.error('No se pudo publicar el producto del comercio.', error);
        return jsonResponse(500, { message: 'No se pudo publicar el producto.' });
      }
    }

    if ((method === 'GET' || method === 'PUT') && path === '/profile') {
      const claims = getJwtClaims(event);
      const sub = claims?.['sub'];
      const email = claims?.['email'];
      if (typeof sub !== 'string' || typeof email !== 'string') {
        return jsonResponse(401, { message: 'Inicia sesión para consultar tu perfil.' });
      }

      if (method === 'GET') {
        if (claims?.['custom:privacy_version'] !== PRIVACY_POLICY_VERSION) {
          return jsonResponse(403, { message: 'Acepta la política de privacidad vigente para continuar.' });
        }
        try {
          const profile = await repository.getUserProfile(sub);
          if (!profile) {
            return jsonResponse(404, { message: 'Aún no tienes un perfil guardado.' });
          }
          return jsonResponse(200, profile);
        } catch (error: unknown) {
          console.error('No se pudo consultar el perfil.', error);
          return jsonResponse(500, { message: 'No se pudo consultar el perfil.' });
        }
      }

      if (claims?.['custom:privacy_version'] !== PRIVACY_POLICY_VERSION) {
        return jsonResponse(403, { message: 'Acepta la política de privacidad vigente para continuar.' });
      }

      let body: unknown;
      try {
        const rawBody = event.body ?? '';
        body = JSON.parse(
          event.isBase64Encoded ? Buffer.from(rawBody, 'base64').toString('utf8') : rawBody
        );
      } catch {
        return jsonResponse(400, { message: 'El cuerpo de la solicitud no es JSON válido.' });
      }

      const profile = updateUserProfileSchema.safeParse(body);
      if (!profile.success) {
        return jsonResponse(400, {
          message: 'Revisa los datos del perfil.',
          details: z.treeifyError(profile.error)
        });
      }

      try {
        const savedProfile = await repository.saveUserProfile(sub, email, profile.data);
        return jsonResponse(200, savedProfile);
      } catch (error: unknown) {
        console.error('No se pudo guardar el perfil.', error);
        return jsonResponse(500, { message: 'No se pudo guardar el perfil.' });
      }
    }

    return jsonResponse(404, { message: 'La ruta solicitada no existe.' });
  };
}

export const handler = createApiHandler(new DynamoDBFoodSaveRepository());
