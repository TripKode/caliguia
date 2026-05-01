# CaliGuia SuperApp

## Descripción del Proyecto

CaliGuia es una aplicación de turismo y exploración urbana de grado empresarial diseñada específicamente para Santiago de Cali. Desarrollada bajo el ecosistema interno de TripKode, esta "SuperApp" integra geolocalización avanzada, realidad aumentada (AR) e inteligencia artificial para proporcionar a los usuarios una experiencia de navegación segura, interactiva y altamente contextualizada.

El sistema está diseñado con una arquitectura orientada a dispositivos móviles (mobile-first), asegurando un alto rendimiento, interfaces adaptables y una profunda integración con las capacidades nativas del dispositivo.

## Arquitectura y Características Principales

*   **Cartografía Interactiva y Geolocalización**: Integración profunda con la API de Google Maps con JavaScript (incluyendo AdvancedMarkerElement y PlacesService) para seguimiento en tiempo real, descubrimiento de puntos de interés y cálculo de rutas.
*   **Motor de Gestión de Riesgos y Seguridad**: Renderizado dinámico de mapas de calor de riesgo y capas de límites poligonales a través de las 22 Comunas de Cali, brindando a los usuarios un conocimiento espacial inmediato sobre la seguridad del área.
*   **Guía de Voz con Inteligencia Artificial**: Un sistema de narración consciente del contexto construido sobre la Web Speech API e integraciones de LLM. El módulo evalúa las coordenadas del usuario y su proximidad a monumentos históricos o zonas de alto riesgo para emitir indicaciones de audio proactivas y localizadas.
*   **Interfaz de Realidad Aumentada (AR)**: Integración de cámara acelerada por hardware mediante React Webcam, ofreciendo renderizado del entorno y capacidades de superposición digital para un modo de exploración inmersivo.
*   **Interfaz de Usuario Fluida**: Implementación de interfaz y experiencia de usuario (UI/UX) de última generación utilizando Framer Motion para animaciones aceleradas por hardware y Tailwind CSS para un diseño escalable y basado en utilidades.

## Stack Tecnológico

*   **Framework**: Next.js (App Router, React 18+)
*   **Lenguaje**: TypeScript
*   **Estilos**: Tailwind CSS
*   **Animaciones**: Framer Motion
*   **Servicios de Mapas**: Google Maps Platform (Maps, Places, Visualization, Routes)
*   **Multimedia**: Web Speech API, MediaDevices API (Cámara)

## Requisitos Previos

Antes de configurar el proyecto, asegúrese de tener instaladas las siguientes herramientas en su entorno de desarrollo:

*   Node.js (v18.x o superior)
*   npm (v9.x o superior)
*   Una cuenta válida de Google Cloud Console con las siguientes APIs habilitadas:
    *   Maps JavaScript API
    *   Places API
    *   Directions API

## Instalación y Configuración

1.  **Configuración del Repositorio**:
    Clone el repositorio en su entorno de desarrollo local.

2.  **Instalación de Dependencias**:
    Ejecute el siguiente comando en la raíz del proyecto para instalar todas las dependencias requeridas:
    ```bash
    npm install
    ```

3.  **Configuración del Entorno**:
    Cree un archivo `.env.local` en el directorio raíz y llénelo con las claves criptográficas y tokens de API necesarios para los servicios externos. Asegúrese de que este archivo nunca se incluya en el control de versiones.
    ```env
    # Ejemplo de Configuración
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=su_clave_api_de_google_maps
    ```

## Ciclo de Desarrollo

Para inicializar el servidor de desarrollo con Hot Module Replacement (HMR):

```bash
npm run dev
```

La aplicación estará accesible en `http://localhost:3000`.

*Nota: Las funciones de geolocalización y AR requieren un contexto seguro (HTTPS) o un entorno `localhost` para funcionar correctamente debido a las políticas de seguridad del navegador.*

## Compilación y Despliegue

Para compilar la aplicación para entornos de producción:

```bash
npm run build
```

Para inicializar el servidor de producción:

```bash
npm run start
```

La aplicación está optimizada para su despliegue en Vercel, alineándose con la arquitectura de despliegue estándar de Next.js.

## Aviso de Confidencialidad

Este repositorio y su contenido son propiedad exclusiva de TripKode. Queda estrictamente prohibida la distribución, réplica o modificación no autorizada de este código fuente fuera de los parámetros organizacionales designados.
