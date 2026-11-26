# ADR 005: Evolución funcional y operativa del MVP FoodSave

- **Estado:** Parcialmente sustituido para reservas nuevas.
- **Fecha:** 18 de noviembre de 2026.

**Actualización del 21 de noviembre de 2026:** los pedidos nuevos ya no usan
checkout ni requieren pago; conservan la reserva de inventario durante 15 minutos.
El webhook de Mercado Pago permanece para compatibilidad con pedidos anteriores.
El entorno de staging está desplegado; esto no constituye validación de producción.

## Contexto

El MVP ya usa Angular, API Gateway HTTP API, AWS Lambda, DynamoDB y Cognito
(ADR004). La propuesta inicial del ADR001 ya no representa el stack vigente. Para
continuar la evolución sin cambiar la arquitectura serverless se requieren pagos,
gestión de comercios, imágenes, notificaciones y controles previos al lanzamiento.

## Decisiones

- Se mantiene una API REST modular en AWS; no se separa en microservicios hasta que
  el crecimiento justifique su complejidad operativa.
- Mercado Pago gestionará el checkout. Una reserva retiene inventario por 15
  minutos; solo un webhook verificado del proveedor confirma el pago.
- Los comercios podrán solicitar una cuenta, pero un administrador deberá
  aprobarlos antes de publicar ofertas. La asignación inicial de administradores
  se hará fuera del autoservicio público.
- Amazon S3 almacenará imágenes de ofertas. Las cargas usarán URLs firmadas y el
  bucket no expondrá escrituras públicas.
- Las notificaciones se desacoplarán del flujo de reserva: correo asíncrono y
  actualizaciones en tiempo real para clientes conectados, conforme al ADR003.
- El correo de compradores invitados será opcional; la reserva no se bloqueará si
  no se proporciona.
- La información personal se tratará conforme al marco colombiano de protección
  de datos. La política pública requiere completar la identidad y contacto del
  responsable y revisión legal antes de operar públicamente.
- Los workflows automatizarán pruebas, build, validación OpenAPI/SAM y auditoría
  de dependencias. El workflow no desplegará recursos ni utilizará secretos.

## Consecuencias y límites

- La plantilla SAM prepara Streams de DynamoDB para procesar cambios de estado
  sin bloquear el checkout. El procesador envía confirmaciones por SES y publica
  cambios a conexiones WebSocket autorizadas con un token aleatorio de pedido;
  los errores agotados se envían a una DLQ de SQS.
- La consulta HTTP del estado expone únicamente el estado y vencimiento, y exige
  el token privado de seguimiento. El token sin hash solo se conserva en la
  sesión del navegador; DynamoDB guarda su hash.
- Los controles antiabuso limitan reservas por IP seudonimizada y API Gateway
  aplica throttling general.
- La infraestructura y el código están preparados, pero no se han desplegado
  ni se han ejecutado transacciones reales de pago, SES, S3 o WebSocket.

- La confirmación de pago depende de credenciales privadas de Mercado Pago y de un
  webhook público con firma verificada; ningún redirect del navegador confirma un
  pago.
- Las integraciones de AWS y proveedores externos se preparan sin desplegar
  recursos. Su activación requiere credenciales en el entorno correspondiente,
  dominio/origen público, remitente SES verificado, configuración del webhook,
  asignación manual del grupo administrador y revisión de costos. La DLQ requiere
  monitoreo y un procedimiento operativo para inspección/reprocesamiento.
- La política de privacidad es un borrador con campos pendientes y requiere
  completar información del responsable y revisión legal antes de producción.
- Las notificaciones usan entrega al menos una vez; el consumidor y el proceso
  de operación deben contemplar reintentos y posibles duplicados de correo.
- Los pagos reales, cargos, reembolsos, tarifas de domicilio y obligaciones
  tributarias requieren validación operativa y legal antes de producción.
