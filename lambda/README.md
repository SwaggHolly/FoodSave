# FoodSave API

API serverless basada en AWS Lambda, API Gateway, DynamoDB, Cognito y S3. Incluye reservas de 15 minutos, registro de comercios y notificaciones asíncronas por DynamoDB Streams, Amazon SES y WebSocket.

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

Con `env.local.example.json`, el entorno local permite probar el catálogo, el carrito y las reservas sin configurar pagos. Cognito, S3, SES y WebSocket requieren recursos desplegados en AWS. La liberación automática requiere ejecutar el manejador de expiración programado.

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
- `POST /orders` con `buyerName`, `buyerPhone`, `items: [{ productId, quantity }]` y un `delivery` opcional. Devuelve el número, artículos, total, vencimiento y token privado de seguimiento.
- `GET /orders/{orderId}/status` requiere el token de seguimiento en el encabezado `x-order-token`.
- `POST /webhooks/mercadopago` permanece disponible para pedidos anteriores que usaban pagos.
- `GET /profile` (JWT Cognito obligatorio)
- `PUT /profile` (JWT Cognito obligatorio, cuerpo `name` y `phone`)
- `GET|POST /merchant/application`, `POST /merchant/images/upload-url` y `POST /merchant/products` (JWT obligatorio; el registro del comercio se activa automáticamente)
- `PUT /admin/merchant-applications/{sub}/decision` (grupo Cognito `FoodSaveAdmins`)

El servidor calcula el total desde el catálogo y retiene inventario por 15 minutos; después la expiración libera el inventario. Los pedidos nuevos no procesan pagos. El costo y la cobertura del domicilio aún los confirma la tienda. Las imágenes quedan privadas en S3 y se muestran mediante URLs temporales.

Para publicar, la fecha y hora de vencimiento deben ser futuras y estar dentro de las próximas 120 horas; para la categoría `verduras`, el límite es de 48 horas. Las verduras se ocultan a las 48 horas de publicarse y la función programada las borra de DynamoDB en su siguiente ejecución; sus imágenes en S3 no se eliminan automáticamente. Los pedidos conservan su propio resumen. Estas reglas aplican a publicaciones nuevas, no reclasifican registros anteriores.

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

Configura `NotificationFromEmail` y `FrontendOrigin`. El correo remitente debe estar verificado en SES; las cuentas SES en sandbox también requieren verificar a los destinatarios. Los parámetros de Mercado Pago y `PublicApiUrl` solo se requieren para procesar notificaciones de pedidos antiguos. No pongas secretos en los archivos del frontend ni los subas al repositorio.

Los comercios nuevos se activan automáticamente, sin revisión manual. Las solicitudes antiguas pendientes se activan al consultarse; las rechazadas conservan su estado. El endpoint de revisión administrativa permanece para compatibilidad con solicitudes existentes.

La política de privacidad del frontend es un borrador con campos pendientes de completar y revisión legal en Colombia; no es una política lista para producción. Configura también la URL WebSocket en el entorno del frontend para recibir cambios de estado en tiempo real. Los errores persistentes de notificación terminan en `FoodSaveNotificationDlq`; configura alarmas y un procedimiento de reintento/inspección antes de producción.

Los perfiles guardan nombre, correo y teléfono; las reservas a domicilio guardan la dirección indicada. No guardes credenciales de AWS ni archivos `env.local.json` en el repositorio. Los recursos AWS pueden generar cargos.
