# ADR 004: Backend serverless para el MVP de FoodSave

- **Estado:** Aprobado
- **Fecha:** 17 de noviembre de 2026

## Contexto

El frontend Angular necesita consultar un catálogo compartido y reservar productos
sin confiar en precios ni existencias enviados por el navegador. El repositorio ya
contiene el esqueleto `lambda/` y una decisión previa sobre arquitectura hexagonal.
La propuesta inicial de Express y MongoDB del ADR 001 no coincide con esa estructura.

## Decisión

- Mantener Angular como cliente web.
- Exponer una API REST mediante AWS API Gateway HTTP API y AWS Lambda con Node.js
  22 y TypeScript.
- Persistir productos y pedidos en DynamoDB bajo demanda.
- Mantener las reglas de reserva en el dominio y el acceso a DynamoDB detrás de un
  puerto de repositorio.
- Reservar productos sin integrar pagos en esta fase.

Esta decisión reemplaza la selección de Express y MongoDB del ADR 001 para el backend
del MVP. El ADR 002 continúa guiando la estructura del monorepo y la separación por
puertos y adaptadores.

## Consecuencias

- La operación de reserva descuenta stock y guarda el pedido en una transacción de
  DynamoDB; si el inventario cambió o el producto venció, no se crea la reserva.
- DynamoDB Local y AWS SAM permiten desarrollar y probar sin desplegar recursos a
  AWS.
- Amazon Cognito gestiona las cuentas de consumidores y la verificación por correo;
  DynamoDB conserva el perfil asociado al identificador autenticado. Las rutas de
  perfil validan JWT y las reservas como invitado siguen disponibles.
- La API no incluye cuentas de comercios ni pagos. Antes de abrir la creación de
  pedidos al público se deben definir controles contra abuso y políticas de
  privacidad para los datos de contacto.
- Los índices y consultas se deben revisar si el catálogo crece significativamente.
