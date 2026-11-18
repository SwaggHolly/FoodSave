# ADR 002: Monorepo y arquitectura hexagonal

## Decisión

FoodSave mantiene frontend, API, documentación y configuración de despliegue en un
único repositorio GitHub. El backend separa dominio, puertos y adaptadores para
probar las reglas de negocio sin depender de AWS.

El frontend vigente es Angular; las referencias originales a React/Next.js en este
ADR eran propuestas, no describen la implementación actual. El backend de AWS
Lambda y DynamoDB queda actualizado por el ADR004.

## GitHub Flow

Los cambios se desarrollan en ramas de funcionalidad y se integran a `main`
mediante pull requests. Los workflows de CI validan las pruebas y compilaciones
antes de permitir la integración.

## Estructura vigente

```text
FoodSave/
├── .github/
│   ├── workflows/
│   └── PULL_REQUEST_TEMPLATE.md
├── foodsave-frontend/
│   └── src/app/
│       ├── components/
│       ├── models/
│       └── services/
├── lambda/
│   ├── src/
│   │   ├── domain/
│   │   ├── ports/
│   │   └── adapters/
│   ├── handler.ts
│   ├── openapi.yaml
│   └── template.yaml
├── ADR*.md
└── README.md
```

Los modelos TypeScript del frontend y backend se mantienen separados por ahora.
Solo se extraerán a un paquete compartido cuando exista una necesidad concreta de
compartir contratos sin acoplar la interfaz al modelo de persistencia.

## Consecuencias

- Los cambios de frontend y API pueden revisarse e integrarse en un mismo pull
  request.
- El dominio y sus servicios se prueban mediante puertos, sin conectarse a AWS.
- La estructura real del repositorio prevalece sobre los ejemplos originales de
  carpetas de este ADR.
