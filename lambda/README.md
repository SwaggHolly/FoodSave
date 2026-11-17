# FoodSave API

REST API basada en AWS Lambda, API Gateway HTTP API y DynamoDB. El catálogo es público; la creación de pedidos valida los precios y las existencias en el servidor y descuenta el inventario junto con la reserva usando una transacción de DynamoDB. No procesa pagos.

El contrato HTTP está en [openapi.yaml](./openapi.yaml).

## Requisitos

- Node.js 22 o superior y npm.
- Docker Desktop.
- AWS SAM CLI para ejecutar la API localmente.
- Para desplegar: AWS CLI configurado con una cuenta y permisos de CloudFormation, Lambda, API Gateway y DynamoDB.

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

Para apagar DynamoDB local: `docker compose down`. El volumen `dynamodb-data` conserva los datos entre reinicios.

## Endpoints

- `GET /health`
- `GET /products` con filtros opcionales `category` y `search`
- `POST /orders` con `buyerName`, `buyerPhone` e `items: [{ productId, quantity }]`

El servidor calcula el total desde los precios del catálogo. No acepta precios enviados por el cliente y responde `409` si el stock cambió o el producto venció. No hay cuentas de comercio ni pagos en esta primera fase.

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

SAM muestra `FoodSaveApiUrl`; copia esa URL en `foodsave-frontend/src/environments/environment.production.ts` antes de compilar el frontend para producción. Los recursos de AWS pueden generar cargos según el uso y la región.

No guardes credenciales de AWS ni archivos `.env.local` en el repositorio. Antes de abrir el endpoint de pedidos al público, agrega autenticación, límites contra abuso y políticas de privacidad para los datos de contacto.
