# CaliGuia SuperApp

## Resumen Ejecutivo

CaliGuia es una plataforma de turismo y exploración urbana de nivel empresarial diseñada específicamente para Santiago de Cali. Desarrollada bajo el ecosistema interno de TripKode, esta aplicación integra geolocalización avanzada, realidad aumentada e inteligencia artificial para proporcionar a los usuarios una experiencia de navegación segura, interactiva y altamente contextualizada. El sistema está estructurado con una arquitectura orientada a dispositivos móviles, garantizando un alto rendimiento, interfaces adaptables y una profunda integración con las capacidades nativas del dispositivo.

## Arquitectura y Módulos Principales

El desarrollo actual de la aplicación se fundamenta en una estructura modular robusta. El núcleo de la interfaz y la experiencia del usuario se rige por un enrutamiento internacionalizado mediante el módulo de configuración de internacionalización, permitiendo la adaptación del contenido a múltiples idiomas y regiones desde las rutas principales de la aplicación.

En el ámbito del backend, la plataforma expone una capa de servicios API integral. Esta capa gestiona componentes críticos como la autenticación y administración de usuarios, el procesamiento de datos geográficos segmentados para las comunas de Cali y la integración directa con proveedores de servicios hoteleros. Adicionalmente, cuenta con rutas dedicadas a la seguridad de la infraestructura cartográfica, implementando proxys y gestión segura de credenciales para los servicios de localización.

Un componente destacado de la arquitectura es la integración de inteligencia artificial para servicios multimedia y cognitivos. La aplicación incorpora motores de generación y clonación de voz, apoyándose en proveedores de infraestructura neuronal como ElevenLabs, PlayHT y modelos desplegados a través de interfaces como Gradio. Estas integraciones alimentan un sistema integral de narración consciente del contexto. Paralelamente, se han implementado capacidades de visión artificial que complementan la exploración del usuario analizando el entorno físico.

## Capa de Datos e Integraciones

La gestión y persistencia de información están centralizadas mediante un mapeo objeto-relacional robusto, proporcionando acceso estructurado y predictivo a la base de datos subyacente. Las librerías internas del núcleo de la aplicación abstraen las conexiones con servicios externos de alta complejidad computacional, asegurando que la lógica de negocio permanezca desacoplada de la implementación técnica específica de los modelos acústicos y de lenguaje.

## Stack Tecnológico y Entorno

El proyecto se sustenta sobre un framework de renderizado híbrido de última generación, utilizando TypeScript como lenguaje principal para garantizar la seguridad de tipos y la mantenibilidad del código a escala corporativa. El sistema de diseño se construye mediante la composición de utilidades CSS para facilitar la escalabilidad, en conjunto con librerías de animación espacial para ofrecer transiciones fluidas. Las interacciones cartográficas dependen de ecosistemas corporativos de mapas, mientras que las características biométricas y ambientales hacen uso de las interfaces de programación de aplicaciones nativas del navegador.

## Requisitos y Configuración Inicial

La configuración de un entorno de desarrollo exige la preparación de un entorno de ejecución de JavaScript moderno junto con su gestor de dependencias estandarizado. Es imperativo disponer de accesos autenticados a las consolas de proveedores en la nube con los servicios de cartografía, enrutamiento y geolocalización debidamente habilitados, de igual manera que las credenciales para los diversos servicios de inteligencia artificial y síntesis de voz integrados en el código.

Para la inicialización técnica, el personal de ingeniería debe obtener el repositorio fuente y resolver el árbol de dependencias completo. Como paso crítico de seguridad, resulta estrictamente necesario configurar las variables de entorno de forma aislada, inyectando las claves criptográficas, tokens de acceso y cadenas de conexión a las bases de datos correspondientes sin exponer información sensible al control de versiones.

## Ciclo de Vida y Despliegue

La fase de construcción y prueba permite ejecutar el código en modalidad de desarrollo, con reemplazo de módulos en caliente para una iteración ágil. Resulta importante destacar que el acceso al hardware de los dispositivos finales para realidad aumentada y reconocimiento de voz exige invariablemente la provisión de los servicios mediante protocolos criptográficos seguros. Durante la promoción a entornos productivos, el sistema compila los recursos en paquetes altamente optimizados, diseñados para ser distribuidos a través de redes de entrega de contenido globales y entornos de ejecución de borde.

## Licencia y Propiedad Intelectual

Este proyecto y sus componentes arquitectónicos son propiedad intelectual de **TripKode**. 

Actualmente, el código fuente se encuentra disponible bajo los términos de la **Licencia MIT** con el propósito específico de permitir su despliegue, evaluación y auditoría técnica durante competiciones de innovación (Hackathons). Esto garantiza total transparencia para el panel de evaluación.

Para más detalles sobre las condiciones de uso y distribución, por favor consulte el archivo `LICENSE` incluido en la raíz de este repositorio.
