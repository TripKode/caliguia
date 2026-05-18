# CaliGuia SuperApp

## Resumen Ejecutivo

CaliGuia es una plataforma de turismo y exploración urbana de nivel empresarial diseñada específicamente para Santiago de Cali. Desarrollada bajo el ecosistema interno de **TripKode** y potenciada por la tecnología de catálogos y negocios de **KodeTap**, esta aplicación integra geolocalización avanzada, realidad aumentada e inteligencia artificial de vanguardia. Su propósito es proporcionar a los usuarios una experiencia de navegación segura, interactiva y altamente contextualizada. El sistema está estructurado como una Progressive Web App (PWA) orientada a dispositivos móviles, garantizando un alto rendimiento, interfaces adaptables y una profunda integración con las capacidades nativas del dispositivo.

## Arquitectura y Módulos Principales

El núcleo de la aplicación está construido sobre **Next.js** y **React 19**, empleando el App Router para una gestión eficiente de rutas. La internacionalización (i18n) está integrada de forma nativa (Español, Inglés y Portugués), permitiendo la adaptación fluida del contenido a múltiples idiomas.

En el ámbito del backend, la plataforma expone una capa de servicios API integral que gestiona componentes críticos:
- **Autenticación y Seguridad**: Implementada con NextAuth.js para la gestión segura de sesiones de usuarios.
- **Servicios Cartográficos**: Integración profunda con Google Maps Platform, incluyendo proxys seguros para la gestión de credenciales, renderizado de mapas interactivos y overlays de calor para zonas de seguridad.
- **Módulo de Negocios**: Potenciado por **KodeTap**, que facilita la integración de perfiles comerciales, catálogos de productos interactivos y conectividad directa con proveedores (ej. hoteles y comercios locales).

## Capa de Inteligencia Artificial

Un componente destacado de la arquitectura es la integración de inteligencia artificial para servicios cognitivos, visuales y auditivos:
- **Modelos de Lenguaje (LLM) y Visión Computacional**: Se emplean los modelos avanzados de **Groq** (como LLaMA 3.3 para procesamiento de lenguaje natural y LLaMA 4 Scout para visión). Estos motores analizan el entorno físico a través de la cámara del usuario e interactúan mediante un chatbot contextualizado con personalidades adaptables según el idioma.
- **Síntesis y Clonación de Voz**: La aplicación utiliza el avanzado sistema open-source **[F5-TTS](https://github.com/swivid/f5-tts)**, desplegado como un microservicio independiente mediante interfaces Gradio en el entorno `caliguia-worker-tts`. Esta arquitectura in-house alimenta un sistema integral de narración de alta calidad consciente del contexto turístico, eliminando la dependencia de proveedores externos comerciales.

## Capa de Datos e Integraciones

La gestión y persistencia de información están centralizadas mediante **Prisma ORM** sobre una base de datos **MongoDB**. Esto proporciona un mapeo objeto-relacional robusto, acceso estructurado a perfiles de usuarios, gestión de clones de voz y preferencias de viaje. Las librerías internas abstraen las conexiones con servicios externos de alta complejidad, asegurando que la lógica de negocio permanezca desacoplada.

## Stack Tecnológico y Entorno

- **Core**: Next.js 16, React 19, TypeScript.
- **Estilos y Animación**: Tailwind CSS v4, Framer Motion y componentes modulares (Lucide Icons).
- **Base de Datos**: MongoDB + Prisma ORM.
- **Infraestructura Cloud / APIs**: Google Cloud Platform (Storage, Vision, Maps API), Groq APIs
- **PWA**: Soporte nativo de Service Workers y Notificaciones Push (Web Push).

## Requisitos y Configuración Inicial

La configuración del entorno de desarrollo requiere Node.js (v20+). Es imperativo disponer de accesos autenticados a las consolas de proveedores en la nube con los servicios de cartografía, enrutamiento y geolocalización debidamente habilitados, de igual manera que las credenciales para los diversos servicios de inteligencia artificial (Groq, Google Maps, NextAuth, Database URLs).

Para la inicialización técnica:
1. Clonar el repositorio.
2. Instalar dependencias mediante `npm install`.
3. Configurar estrictamente el archivo `.env.local` con las claves criptográficas correspondientes.
4. Ejecutar el servidor de desarrollo con `npm run dev`.

## Ciclo de Vida y Despliegue

La fase de construcción (`npm run build`) empaqueta los recursos de Next.js de forma altamente optimizada. El acceso al hardware de los dispositivos finales para cámara y reconocimiento de voz exige invariablemente la provisión de los servicios mediante HTTPS.

## Licencia y Propiedad Intelectual

Este proyecto y sus componentes arquitectónicos son propiedad intelectual de **TripKode** y cuentan con integraciones tecnológicas de **KodeTap**.

Actualmente, el código fuente se encuentra disponible bajo los términos de la **Licencia MIT** con el propósito específico de permitir su despliegue, evaluación y auditoría técnica durante competiciones de innovación (Hackathons). Esto garantiza total transparencia para el panel de evaluación.

Para más detalles sobre las condiciones de uso y distribución, por favor consulte el archivo `LICENSE` incluido en la raíz de este repositorio.
