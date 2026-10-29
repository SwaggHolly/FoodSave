1. Título y Estado.

Título: ADR 003: Definición de la Estrategia de Comunicación entre Clientes y Microservicios en FoodSave.
Estado: Aprobado.
Fecha: Octubre 2026.
Autores: Equipo de Arquitectura de FoodSave /  Juan Pablo Zabala Saldarriaga - Maria Camila Campo Muñoz

--------------------------------------------------------------------------------------------------------------------------------------------

2. Contexto y Problema.

El sistema FoodSave requiere conectar múltiples módulos e interfaces:
Clientes Web y Móviles: Necesitan interactuar con la plataforma para explorar excedentes de alimentos, gestionar donaciones o publicar ofertas en tiempo real.
Microservicios Core (Usuarios, Inventario, Donaciones/Pedidos): Requieren comunicación sincrónica para operaciones transaccionales directas (ej. autenticación, validación de inventario disponible).
Notificaciones y Actualizaciones en Tiempo Real: Requerimiento para alertar a usuarios sobre publicaciones cercanas o cambios de estado en las donaciones/compras.
Se requiere definir el modelo de comunicación, la tecnología de transferencia y los contratos de API a utilizar, garantizando interoperabilidad, bajo acoplamiento y mantenimiento ágil.

--------------------------------------------------------------------------------------------------------------------------------------------

3. Decisiones Tomadas.

A. Modelo de Comunicación: Híbrido (Síncrona y Asíncrona)
Comunicación Síncrona: Se utiliza para operaciones request/response inmediatas entre el cliente frontend/móvil y los microservicios a través del API Gateway (ej. consultar perfil, verificar disponibilidad de alimentos).
Comunicación Asíncrona (Event-Driven): Se utiliza para procesos en segundo plano o desacoplados donde no se requiere respuesta inmediata en tiempo real (ej. envío de correos de confirmación, procesamiento de analítica, notificaciones push).

Justificación: La comunicación síncrona garantiza coherencia en tiempo real en operaciones donde el cliente depende de la respuesta del servidor para continuar su flujo en la pantalla.
Justificación: Si el servicio de correos falla o tarda 5 segundos en responder, no debemos bloquear la experiencia del usuario al reservar su comida. La comunicación asíncrona desacopla los servicios, mejora el rendimiento percibido y evita fallos en cadena.

--------------------------------------------------------------------------------------------------------------------------------------------

B. Tecnologías Seleccionadas
REST (Representational State Transfer) sobre HTTPS: Para la comunicación síncrona principal entre los clientes (Web/Mobile) y las APIs públicas de los microservicios.
WebSockets / Webhooks: Para la recepción de notificaciones en tiempo real en la aplicación móvil/web cuando se publique un nuevo lote de alimentos o cambie el estado de un pedido.

Justificacion.
REST (Representational State Transfer) sobre HTTPS
¿Por qué se adapta mejor a FoodSave?
Estándar y bajo aprendizaje: Al ser un proyecto desarrollado por un equipo de dos personas, REST permite construir endpoints rápidos y limpios sin una curva de aprendizaje compleja.
Compatibilidad nativa: Funciona sin configuraciones adicionales en navegadores web y aplicaciones móviles Android/iOS.
Caché eficiente: Aprovecha las cabeceras HTTP estándar para almacenar en caché consultas frecuentes (como categorías de alimentos o zonas de cobertura).

WebSockets / Webhooks (Tiempo Real)
¿Por qué se adapta mejor a FoodSave?
Naturaleza perecedera del alimento: La comida en oferta o donación se agota en minutos. El envío masivo de peticiones tradicionales (polling) saturaría el servidor.
Notificaciones Push instantáneas: Cuando un restaurante publique una oferta relámpago, WebSockets permite empujar (push) la notificación a los usuarios cercanos de inmediato.

--------------------------------------------------------------------------------------------------------------------------------------------

C. Definición de Contratos de Comunicación
OpenAPI 3.0 (anteriormente Swagger): Se adopta como el estándar oficial para especificar y documentar los contratos de las APIs RESTful del proyecto FoodSave.
Estrategia Design-First / Contract-First: Los contratos OpenAPI (.yaml / .json) se diseñan antes de implementar los endpoints para permitir que los equipos de Frontend y Backend trabajen de forma paralela usando mock servers.

Justificación.
¿Por qué OpenAPI 3.0?
Estandarización: Define de manera clara y legible para humanos y máquinas la estructura de las rutas, parámetros, respuestas y esquemas de datos JSON.
Documentación Viva: Herramientas como Swagger UI generan documentación interactiva de forma automática a partir del archivo .yaml.

--------------------------------------------------------------------------------------------------------------------------------------------

4. Alternativas Descartadas.

Tecnología	Razón de Descarte para FoodSave
SOAP (WSDL)	Excesiva complejidad y sobrecarga de datos en XML. Poco apto para consumo ágil desde clientes web y móviles modernos.
GraphQL (SDL)	Aunque ofrece flexibilidad de consultas, añade complejidad innecesaria en la gestión de caché y control de permisos en etapas tempranas de FoodSave.
gRPC (.proto)	Altamente eficiente para comunicación entre microservicios (Backend-to-Backend), pero introduce complejidad de integración directa con clientes web/navegadores sin un proxy adicional. Se reserva como alternativa futura para comunicación interna.


Justificación.
¿Por qué se descartaron las demás alternativas?
Alternativa	Razón por la que NO encaja en FoodSave
SOAP (WSDL)	Obsoleto y pesado: Utiliza estructuras XML complejas que aumentan el consumo de datos en redes móviles y complican la integración en JavaScript/TypeScript.
GraphQL (SDL)	Sobreingeniería en etapa inicial: Aunque evita pedir datos de más, añade complejidad en la gestión de caché del lado del cliente, seguridad de consultas pesadas y mayor tiempo de configuración.
gRPC (.proto)	Complejidad en el cliente: Excelente para comunicación de alto rendimiento entre backend y backend, pero requiere un proxy adicional (ej. gRPC-Web) para funcionar directo desde navegadores web.

--------------------------------------------------------------------------------------------------------------------------------------------

