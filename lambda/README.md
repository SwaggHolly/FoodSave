# FoodSave API

REST API basada en AWS Lambda, API Gateway HTTP API, Amazon Cognito y DynamoDB. El catálogo y las reservas como invitado siguen siendo públicos; el perfil de la cuenta requiere un JWT válido de Cognito. No procesa pagos.

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

El entorno local permite probar catálogo, carrito y reservas como invitado. El registro requiere un User Pool Cognito desplegado: SAM local no emula Cognito ni sus tokens.

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
- `POST /orders` con `buyerName`, `buyerPhone`, `items: [{ productId, quantity }]` y un `delivery` opcional. Para domicilio incluye ciudad, zona, barrio y dirección; si se omite, se considera recogida.
- `GET /profile` (JWT Cognito obligatorio)
- `PUT /profile` (JWT Cognito obligatorio, cuerpo `name` y `phone`)

El servidor calcula el total desde los precios del catálogo. No acepta precios enviados por el cliente y responde `409` si el stock cambió o el producto venció. El costo y la cobertura del domicilio aún los confirma la tienda; el MVP no calcula tarifas ni rastrea envíos. No hay cuentas de comercio ni pagos en esta primera fase.

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

SAM muestra los outputs `FoodSaveApiUrl`, `FoodSaveUserPoolId` y `FoodSaveUserPoolClientId`. Configura esos valores en `foodsave-frontend/src/environments/environment.production.ts` antes de compilar el frontend para producción:

```ts
export const environment = {
  apiBaseUrl: 'URL FoodSaveApiUrl',
  cognito: {
    userPoolId: 'VALOR FoodSaveUserPoolId',
    userPoolClientId: 'VALOR FoodSaveUserPoolClientId'
  }
};
```

Para probar el frontend local contra la API y Cognito desplegados, configura las mismas salidas en `foodsave-frontend/src/environments/environment.ts`. Los IDs del User Pool y del cliente son identificadores públicos; no pongas claves secretas en el frontend. Revisa que `FrontendOrigin` coincida con el dominio que abre la aplicación. Los recursos de AWS pueden generar cargos según el uso y la región.

No guardes credenciales de AWS ni archivos `.env.local` en el repositorio. Los perfiles guardan nombre, correo y teléfono; las reservas a domicilio también guardan la dirección indicada. Publica la aplicación solo después de definir y mostrar una política de privacidad adecuada. La creación de reservas como invitado sigue necesitando límites contra abuso antes de abrirla al público.
