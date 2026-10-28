Monorepo
Simplicidad de gestión: Todo el código (Frontend en React/Next.js, Backend en AWS Lambda, documentación y configuraciones de CI/CD) reside en un único repositorio de GitHub.

Facilidad en GitHub Flow: Permite realizar cambios atómicos donde un solo Pull Request puede actualizar tanto un endpoint en /lambda como la interfaz en /src sin coordinar múltiples PRs cruzados.

Compartición de tipos (TypeScript): Puedes definir las interfaces del producto (como Product, Order, ExpirationBadge) en un módulo común y reutilizarlas tanto en el frontend como en el backend.

Arquitectura Hexagonal:
Desacoplamiento total del negocio: Las reglas del negocio de FoodSave (cálculo de fechas de vencimiento, aplicación de descuentos dinámicos por caducidad próxima, reglas de reserva de lotes) no dependen de AWS Lambda, Express ni de la base de datos.

Facilidad de Pruebas (Testability): Puedes probar la lógica de dominios mediante mocks sin necesidad de conectarte a una base de datos real o simular llamadas a AWS API Gateway.

Evolución Tecnológica: Si en el futuro deciden cambiar el almacenamiento (por ejemplo, de DynamoDB a PostgreSQL) o mover las lambdas a un contenedor Docker, solo cambian el Adaptador de infraestructura, manteniendo intacto el núcleo del negocio.

Estructura de Carpetas en GitHub
Combinando el enfoque de Monorepo, Arquitectura Hexagonal y la integración de AWS Lambda junto con el Frontend, esta es la estructura limpia y profesional recomendada para tu repositorio:

foodsave/
├── .github/
│   ├── workflows/
│   │   ├── ci-cd.yml                # Pipeline de pruebas, linters y despliegue automático
│   │   └── security-scan.yml        # Escaneo de vulnerabilidades (DevSecOps)
│   └── PULL_REQUEST_TEMPLATE.md
│
├── docs/
│   └── adr/                         # Registros de Decisiones de Arquitectura
│       ├── 0001-record-architecture-decisions.md
│       └── 0002-estructura-interna-repositorio.md
│
├── lambda/                          # BACKEND SERVERLESS (Arquitectura Hexagonal)
│   ├── src/
│   │   ├── domain/                  # NÚCLEO DE NEGOCIO (Entidades y Reglas puro TS)
│   │   │   ├── models/              # ej. Product.ts, Order.ts, Store.ts
│   │   │   └── services/            # ej. DiscountCalculatorService.ts
│   │   │
│   │   ├── ports/                   # PUERTOS (Interfaces / Contratos)
│   │   │   ├── input/               # Casos de Uso (ej. CreateOrderUseCase.ts)
│   │   │   └── output/              # Repositorios/APIs (ej. ProductRepositoryPort.ts)
│   │   │
│   │   ├── adapters/                # ADAPTADORES (Implementaciones de Infraestructura)
│   │   │   ├── input/
│   │   │   │   └── api-gateway/     # Handlers de AWS Lambda
│   │   │   └── output/
│   │   │       ├── database/        # Conectores de base de datos (DynamoDB / Postgres)
│   │   │       └── external-apis/   # Servicios externos (ej. Pasarela de pagos)
│   │   │
│   │   └── handler.ts               # Punto de entrada de la función Lambda
│   ├── package.json
│   └── tsconfig.json
│
├── src/                             # FRONTEND (Cliente Web FoodSave)
│   ├── assets/                      # Imágenes, iconos y estilos globales
│   ├── components/                  # Componentes de UI reutilizables
│   │   ├── common/                  # Botones, Modales, Badges de vencimiento
│   │   └── products/                # ProductCard, CategoryFilter, SearchBar
│   ├── pages/                       # Vistas principales (Home, Marketplace, Dashboard)
│   ├── services/                    # Clientes de API para conectar con las Lambdas
│   ├── types/                       # Interfaces TypeScript de la interfaz
│   └── utils/                       # Formateadores de fecha, moneda, etc.
│
├── .gitignore
├── package.json
├── README.md
└── tsconfig.json
