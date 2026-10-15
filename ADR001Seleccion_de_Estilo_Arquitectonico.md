ADR 001: Selección de Estilo Arquitectónico

FoodSave es una plataforma web que conecta comercios con consumidores para reducir el desperdicio de alimentos. El sistema debe:
•	Escalar con facilidad a medida que aumente el número de usuarios y comercios.
•	Separar responsabilidades entre interfaz, lógica de negocio y persistencia.
•	Permitir despliegue en la nube con disponibilidad global.
•	Integrar servicios externos (imágenes, pagos, notificaciones).

Se adopta una arquitectura Cliente-Servidor con API REST organizada en capas:
•	Frontend: React + TypeScript → interfaz web responsiva, modular y fácil de mantener.
•	Backend: Node.js + Express → servicios REST, lógica de negocio y gestión de roles.
•	Base de datos: MongoDB Atlas → almacenamiento flexible y escalable en la nube.
•	Servicios externos: Cloudinary (imágenes), Git/GitHub (versionado), Postman (pruebas).

Justificación técnica
•	Separación de capas: facilita el mantenimiento y la evolución del sistema.
•	Cliente-Servidor: modelo probado que permite interacción clara entre usuarios y comercios.
•	API REST: estándar ampliamente adoptado, facilita integración con aplicaciones móviles futuras.
•	MongoDB Atlas: base NoSQL que soporta datos heterogéneos (productos, pedidos, usuarios).
•	Despliegue en la nube: Vercel (frontend) y Render (backend) garantizan disponibilidad y escalabilidad.





Alternativas consideradas
•	Monolito tradicional: descartado por baja escalabilidad y dificultad de mantenimiento.
•	Microservicios: descartado en esta fase inicial por complejidad de despliegue y sobrecarga operativa.
•	Arquitectura en capas con API REST: seleccionada por simplicidad, escalabilidad progresiva y facilidad de integración con servicios externos.


Consecuencias
✅ Positivas:
•	Separación clara de responsabilidades.
•	Despliegue independiente de frontend y backend.
•	Escalabilidad futura hacia microservicios.
•	Facilidad de pruebas y mantenimiento.
⚠️ Negativas:
•	Mayor gestión de seguridad en la API.
•	Necesidad de coordinación entre servicios en despliegues.
•	Dependencia de proveedores cloud (Vercel, Render, MongoDB Atlas).

Impacto en el proyecto
•	Permite cumplir los objetivos de FoodSave: publicar alimentos, gestionar pedidos y conectar usuarios con comercios.
•	Facilita agregar nuevas funcionalidades como mapas, pagos en línea, notificaciones push e inteligencia artificial.
•	Establece una base sólida para futuras versiones con microservicios o arquitectura orientada a eventos.
Estado
•	Pendiente / En pruebas – Esta decisión está siendo evaluada en la primera versión del proyecto. Se confirmará su aceptación definitiva tras las pruebas funcionales y de despliegue.
