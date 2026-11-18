# FoodSave

FoodSave es una plataforma web que busca reducir el desperdicio de alimentos,
conectando comercios que tienen excedentes con consumidores que pueden
comprarlos a precios reducidos.

## Estrategia de Branching

### GitHub Flow

Nuestro equipo utilizará GitHub Flow debido a que el proyecto será desarrollado
por un equipo pequeño y requiere un flujo de trabajo sencillo basado en ramas
de funcionalidades y Pull Requests.

La estrategia utiliza una rama principal `main` y ramas temporales
`feature/*`. Cada nueva funcionalidad se desarrolla en una rama independiente
y posteriormente se crea un Pull Request hacia `main`.

Esta estrategia facilita la revisión del código y permite integrar los cambios
de manera controlada antes de incorporarlos a la rama principal.

## Aplicaciones

- `foodsave-frontend/`: interfaz web en Angular.
- `lambda/`: API REST serverless con AWS Lambda, API Gateway HTTP API y DynamoDB.

La API valida las reservas y descuenta existencias en una transacción de DynamoDB. En el carrito se puede solicitar recogida o domicilio; para el domicilio se captura la dirección y la tienda confirma la cobertura y el costo. Las cuentas usan Amazon Cognito; los perfiles se guardan por usuario en DynamoDB y las reservas como invitado siguen disponibles. La decisión serverless está documentada en [ADR004](./ADR004_Arquitectura_Serverless_FoodSave.md). Consulta [lambda/README.md](./lambda/README.md) para ejecutar el MVP localmente y desplegarlo.
