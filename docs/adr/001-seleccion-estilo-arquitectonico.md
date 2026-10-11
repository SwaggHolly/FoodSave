ADR 001: Selección de Estilo Arquitectónico
Título del proyecto: FoodSave   
PDF

Estado: Pendiente / En pruebas (Se confirmará tras pruebas funcionales y de despliegue)   
PDF
+ 1

Fecha: Octubre 2026

Contexto y Problema
FoodSave es una plataforma web que busca conectar comercios con consumidores para reducir el desperdicio de alimentos. El sistema requiere satisfacer los siguientes requerimientos:   
PDF
Escalar con facilidad conforme aumente el número de usuarios y comercios.   
PDF
Separar las responsabilidades de interfaz, lógica de negocio y persistencia.   
PDF
Permitir despliegue en la nube con disponibilidad global.   
PDF
Integrar servicios externos (imágenes, pagos y notificaciones).   
PDF
Decisión
Se adopta una Arquitectura Cliente-Servidor con API REST organizada en capas, conformada por el siguiente stack de tecnologías:   
PDF
Frontend: React + TypeScript (interfaz web responsiva, modular y mantenible).   
PDF
Backend: Node.js + Express (servicios REST, lógica de negocio y gestión de roles).   
PDF
Base de Datos: MongoDB Atlas (almacenamiento NoSQL flexible y escalable en la nube).   
PDF
Servicios externos: Cloudinary (imágenes), Git/GitHub (control de versiones) y Postman (pruebas de API).   
PDF
Justificación técnica:
Separación de capas: Facilita el mantenimiento y la evolución independiente del sistema.   
PDF
Cliente-Servidor & API REST: Modelo estándar y probado que facilitará la futura integración de aplicaciones móviles.   
PDF
MongoDB Atlas: Permite manejar datos heterogéneos (productos, pedidos, usuarios) de forma escalable.   
PDF
Despliegue Cloud: Uso de Vercel (Frontend) y Render (Backend) para asegurar disponibilidad.   
PDF
Alternativas Consideradas
Monolito Tradicional: Descartado por baja escalabilidad y mayor dificultad de mantenimiento.   
PDF
Microservicios: Descartado para esta fase inicial dada su complejidad operativa y sobrecarga en el despliegue.   
PDF
Arquitectura en Capas con API REST (Seleccionada): Mantiene la simplicidad, escalabilidad progresiva y flexibilidad necesaria.   
PDF
Consecuencias
Positivas:
Separación clara de responsabilidades.   
PDF
Despliegue independiente entre el frontend y backend.   
PDF
Facilidad de mantenimiento y pruebas.   
PDF
Base sólida para escalar en el futuro hacia microservicios o arquitecturas orientadas a eventos.   
PDF
Negativas / Riesgos:
Requiere mayor gestión de la seguridad en los endpoints de la API.   
PDF
Necesidad de coordinación continua entre servicios en cada despliegue.   
PDF
Dependencia de proveedores en la nube (Vercel, Render, MongoDB Atlas).   
PDF
