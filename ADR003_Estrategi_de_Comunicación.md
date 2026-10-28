1. Título y Estado.

Título: ADR 003: Definición de la Estrategia de Comunicación entre Clientes y Microservicios en FoodSave.
Estado: Aprobado.
Fecha: Octubre 2026.
Autores: Equipo de Arquitectura de FoodSave /  Juan Pablo Zabala Saldarriaga - Maria Camila Campo Muñoz

2. Contexto y Problema.

El sistema FoodSave requiere conectar múltiples módulos e interfaces:
Clientes Web y Móviles: Necesitan interactuar con la plataforma para explorar excedentes de alimentos, gestionar donaciones o publicar ofertas en tiempo real.
Microservicios Core (Usuarios, Inventario, Donaciones/Pedidos): Requieren comunicación sincrónica para operaciones transaccionales directas (ej. autenticación, validación de inventario disponible).
Notificaciones y Actualizaciones en Tiempo Real: Requerimiento para alertar a usuarios sobre publicaciones cercanas o cambios de estado en las donaciones/compras.
Se requiere definir el modelo de comunicación, la tecnología de transferencia y los contratos de API a utilizar, garantizando interoperabilidad, bajo acoplamiento y mantenimiento ágil.

3. Decisiones Tomadas.

A. Modelo de Comunicación: Híbrido (Síncrona y Asíncrona)
Comunicación Síncrona: Se utiliza para operaciones request/response inmediatas entre el cliente frontend/móvil y los microservicios a través del API Gateway (ej. consultar perfil, verificar disponibilidad de alimentos).
Comunicación Asíncrona (Event-Driven): Se utiliza para procesos en segundo plano o desacoplados donde no se requiere respuesta inmediata en tiempo real (ej. envío de correos de confirmación, procesamiento de analítica, notificaciones push).
B. Tecnologías Seleccionadas
REST (Representational State Transfer) sobre HTTPS: Para la comunicación síncrona principal entre los clientes (Web/Mobile) y las APIs públicas de los microservicios.
WebSockets / Webhooks: Para la recepción de notificaciones en tiempo real en la aplicación móvil/web cuando se publique un nuevo lote de alimentos o cambie el estado de un pedido.
C. Definición de Contratos de Comunicación
OpenAPI 3.0 (anteriormente Swagger): Se adopta como el estándar oficial para especificar y documentar los contratos de las APIs RESTful del proyecto FoodSave.
Estrategia Design-First / Contract-First: Los contratos OpenAPI (.yaml / .json) se diseñan antes de implementar los endpoints para permitir que los equipos de Frontend y Backend trabajen de forma paralela usando mock servers.

4. Alternativas Descartadas.

Tecnología	Razón de Descarte para FoodSave
SOAP (WSDL)	Excesiva complejidad y sobrecarga de datos en XML. Poco apto para consumo ágil desde clientes web y móviles modernos.
GraphQL (SDL)	Aunque ofrece flexibilidad de consultas, añade complejidad innecesaria en la gestión de caché y control de permisos en etapas tempranas de FoodSave.
gRPC (.proto)	Altamente eficiente para comunicación entre microservicios (Backend-to-Backend), pero introduce complejidad de integración directa con clientes web/navegadores sin un proxy adicional. Se reserva como alternativa futura para comunicación interna.

5. Buenas Prácticas Discutidas e Incluidas.

Evolución y Versionado del Contrato:
Versionado explícito en URI (ej. /api/v1/donations) garantizando compatibilidad hacia atrás cuando se introduzcan breaking changes.
Definición Clara de Códigos de Estado HTTP:
Uso adecuado de semántica REST (200 OK, 201 Created, 400 Bad Request, 401 Unauthorized, 404 Not Found, 500 Internal Error).
Estandarización de Errores:
Estructura JSON unificada para respuestas de error en todos los servicios (ej. code, message, details, timestamp).
Pruebas de Contrato (Consumer-Driven Contract Testing):
Validación del contrato OpenAPI mediante CI/CD para evitar que cambios en el backend rompan la integración con el frontend.
