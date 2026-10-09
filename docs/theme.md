# Tema de Occlus

La aplicación Next y el sitio Astro usan una paleta basada en `logo_light.png` y `logo_dark.png`.

| Elemento   | Claro                 | Oscuro                   |
| ---------- | --------------------- | ------------------------ |
| Fondo      | Crema `#f7f5ea`       | Azul marino `#0c2943`    |
| Superficie | Crema claro `#fffdf6` | Azul `#133650`           |
| Texto      | Marino `#0d2c48`      | Claro `#edf5f8`          |
| Primario   | Turquesa `#246c78`    | Turquesa claro `#78c5c7` |

- El switch se encuentra en el acceso, la barra lateral de la aplicación y la cabecera pública.
- La primera visita sigue el tema del sistema. Una selección explícita se guarda como `occlus-theme` en localStorage.
- `shared/theme.ts` aplica la preferencia antes de pintar y escucha cambios de sistema cuando no hay una selección explícita. Sin acceso a localStorage, el cambio sigue funcionando durante la visita.
- La preferencia se comparte entre páginas y pestañas del mismo origen. En localhost, los puertos 3000 y 4321 son orígenes distintos; en el dominio único preparado para producción comparten la preferencia.
- Las imágenes originales se muestran según el tema. Astro conserva copias en `site/public/`; si se sustituyen, actualizar también esas copias.
- Tokens de aplicación: `frontend/src/app/globals.css`. Tokens públicos: `site/src/styles/global.css`. Colores decorativos públicos se sustituyeron por tokens semánticos.
- Los estados del calendario usan variables del tema; los colores clínicos del odontograma mantienen su significado. La captura de firma conserva un lienzo blanco para el PNG guardado.
- La impresión mantiene superficies claras para documentos; los controles respetan movimiento reducido.

Se realizaron compilación Next, ESLint y Astro check/build. No se ejecutaron pruebas automatizadas ni una revisión visual de todas las pantallas.
