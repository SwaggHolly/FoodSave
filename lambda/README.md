# FoodSave API

API serverless basada en AWS Lambda, API Gateway, DynamoDB, Cognito y S3. Incluye pagos Mercado Pago, aprobación de comercios y notificaciones asíncronas por DynamoDB Streams, Amazon SES y WebSocket.

El contrato HTTP está en [openapi.yaml](./openapi.yaml).

## Requisitos

- Node.js 22 o superior y npm.
- Docker Desktop.
- AWS SAM CLI para ejecutar la API localmente.
- Para desplegar: AWS CLI configurado con una cuenta y permisos de CloudFormation, Lambda, API Gateway, DynamoDB y Cognito User Pools.

En macOS puedes instalar SAM CLI con Homebrew:

```bash
brew tap aws/tap
brew install aws-sam-cli
```

Para desplegar, instala también AWS CLI (`brew install awscli`) y configura las credenciales de tu propia cuenta con `aws configure`. No compartas ni subas esas credenciales.

## Ejecutar localmente

En una terminal, desde `lambda/`:

```bash
npm install
npm run build
docker compose up -d
cp env.local.example.json env.local.json
npm run seed:local
sam build
sam local start-api --port 3000 --env-vars env.local.json
```

En otra terminal, inicia el frontend desde `foodsave-frontend/`:

```bash
npm start
```

La aplicación queda en `http://localhost:4200`. La API queda en `http://localhost:3000`; se puede comprobar con `curl http://localhost:3000/health`.

Con `env.local.example.json`, el entorno local permite probar el catálogo y el carrito. Las reservas permanecen deshabilitadas hasta configurar Mercado Pago; no se simula un pago ni se retiene inventario si faltan credenciales. Cognito, S3, SES y WebSocket requieren recursos desplegados en AWS.

Para apagar DynamoDB local: `docker compose down`. El volumen `dynamodb-data` conserva los datos entre reinicios.

## Pruebas

Desde la raíz del repositorio, ejecuta las pruebas y compilaciones de ambos módulos:

```bash
cd lambda
npm test
npm run build
sam validate --lint

cd ../foodsave-frontend
npm test -- --watch=false
npm run build -- --configuration production
```

## Endpoints

- `GET /health`
- `GET /products` con filtros opcionales `category` y `search`
- `POST /orders` con `buyerName`, `buyerPhone`, `items: [{ productId, quantity }]` y un `delivery` opcional. Inicia checkout de Mercado Pago y devuelve un token privado de seguimiento.
- `GET /orders/{orderId}/status` requiere el token de seguimiento en el encabezado `x-order-token`.
- `POST /webhooks/mercadopago` verifica la firma y consulta el pago directamente antes de confirmar la reserva.
- `GET /profile` (JWT Cognito obligatorio)
- `PUT /profile` (JWT Cognito obligatorio, cuerpo `name` y `phone`)
- `GET|POST /merchant/application`, `POST /merchant/images/upload-url` y `POST /merchant/products` (JWT y aprobación de comercio obligatorios)
- `PUT /admin/merchant-applications/{sub}/decision` (grupo Cognito `FoodSaveAdmins`)

El servidor calcula el total desde el catálogo y retiene inventario por 15 minutos. Solo el webhook firmado confirma pagos; la expiración libera el inventario. El costo y la cobertura del domicilio aún los confirma la tienda. Las imágenes quedan privadas en S3 y se muestran mediante URLs temporales.

## Desplegar en AWS

Desde `lambda/`, compila y despliega la plantilla SAM:

```bash
npm run build
sam build
sam deploy --guided
```

Configura `FrontendOrigin` con el dominio real del frontend. Después de desplegar, carga los productos de ejemplo una vez:

```bash
npm run seed:aws
```

SAM muestra los outputs `FoodSaveApiUrl`, `FoodSaveUserPoolId`, `FoodSaveUserPoolClientId` y `FoodSaveWebSocketUrl`. Configura esos valores en `foodsave-frontend/src/environments/environment.production.ts` antes de compilar el frontend para producción:

```ts
export const environment = {
  apiBaseUrl: 'URL FoodSaveApiUrl',
  websocketUrl: 'URL FoodSaveWebSocketUrl',
  cognito: {
    userPoolId: 'VALOR FoodSaveUserPoolId',
    userPoolClientId: 'VALOR FoodSaveUserPoolClientId'
  }
};
```

Completa los parámetros de despliegue `MercadoPagoAccessToken`, `MercadoPagoWebhookSecret`, `NotificationFromEmail`, `FrontendOrigin` y `PublicApiUrl`. El correo remitente debe estar verificado en SES; las cuentas SES en sandbox también requieren verificar a los destinatarios. `PublicApiUrl` se conoce después del primer despliegue: actualiza el stack con la URL de `FoodSaveApiUrl` para habilitar notificaciones de Mercado Pago. No pongas secretos en los archivos del frontend ni los subas al repositorio.

Asigna administradores de forma manual, por ejemplo con `aws cognito-idp admin-add-user-to-group --user-pool-id <FoodSaveUserPoolId> --username <correo> --group-name FoodSaveAdmins`. No habilites autoservicio de aprobación.

La política de privacidad del frontend es un borrador con campos pendientes de completar y revisión legal en Colombia; no es una política lista para producción. Configura también la URL WebSocket en el entorno del frontend para recibir cambios de estado en tiempo real. Los errores persistentes de notificación terminan en `FoodSaveNotificationDlq`; configura alarmas y un procedimiento de reintento/inspección antes de producción.

Los perfiles guardan nombre, correo y teléfono; las reservas a domicilio guardan la dirección indicada. No guardes credenciales de AWS ni archivos `env.local.json` en el repositorio. Los recursos AWS pueden generar cargos.
