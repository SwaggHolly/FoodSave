import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyStructuredResultV2
} from 'aws-lambda';
import { z } from 'zod';
import { DynamoDBFoodSaveRepository } from './src/adapters/output/database/dynamodb-foodsave-repository.js';
import { createOrderRequestSchema } from './src/domain/models/order.js';
import {
  InventoryConflictError,
  ProductNotFoundError,
  ReserveOrderService
} from './src/domain/services/reserve-order.js';
import {
  PRODUCT_CATEGORIES,
  type ProductCategory
} from './src/domain/models/product.js';
import type { FoodSaveRepository } from './src/ports/output/foodsave-repository.js';

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

export function createApiHandler(
  repository: FoodSaveRepository
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
        const products = await repository.listProducts({
          ...(selectedCategory ? { category: selectedCategory } : {}),
          ...(search ? { search } : {})
        });
        return jsonResponse(200, { products });
      } catch (error: unknown) {
        console.error('No se pudo consultar el catálogo.', error);
        return jsonResponse(500, { message: 'No se pudo consultar el catálogo.' });
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

      try {
        const receipt = await reserveOrder.execute(request.data);
        return jsonResponse(201, receipt);
      } catch (error: unknown) {
        if (error instanceof ProductNotFoundError) {
          return jsonResponse(404, { message: error.message });
        }
        if (error instanceof InventoryConflictError) {
          return jsonResponse(409, { message: error.message });
        }
        console.error('No se pudo reservar el pedido.', error);
        return jsonResponse(500, { message: 'No se pudo reservar el pedido.' });
      }
    }

    return jsonResponse(404, { message: 'La ruta solicitada no existe.' });
  };
}

export const handler = createApiHandler(new DynamoDBFoodSaveRepository());
