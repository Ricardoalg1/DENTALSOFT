# Interfaz basada en las referencias del 9 de octubre de 2026

## Alcance

Se aplicó un sistema visual común a las páginas autenticadas, incluidos los detalles y formularios: fondo blanco cálido, títulos marino, acciones turquesa, bordes claros, tarjetas redondeadas y sombras suaves. El tema oscuro conserva la misma jerarquía con superficies oscuras.

Páginas adaptadas: inicio, plataforma, comercial, pacientes, agenda, mensajes, historias, caja, lista de precios, facturación/RIPS, inventario, reportes, equipo, sedes y cuenta.

## Componentes y recursos

- `reference-art.tsx`: reutiliza las ilustraciones de las imágenes originales aportadas por el usuario. Un SVG con viewBox recorta visualmente la zona ilustrada, sin convertir las capturas en páginas estáticas. Los originales están en `frontend/public/reference-art`.
- `section-icon.tsx`: iconos Lucide y colores de encabezados de tarjetas.
- `icon-input.tsx`: iconos de campos y control accesible para mostrar/ocultar contraseñas.
- Layout: barra lateral persistente en escritorio, navegación por permisos, buscador real de pacientes y acceso a cuenta. Notificaciones enlaza al módulo de plataforma para sus administradores.
- Reportes: gráficos de anillo calculados con datos reales y estados vacíos neutros. No se usan nombres de profesionales, valores financieros, fechas ni tendencias ficticias de las capturas.
- Equipo: búsqueda por nombre, correo y rol sobre los usuarios de la clínica.

## Comportamiento

Las acciones, validaciones, permisos y módulos del backend siguen siendo los existentes. Las animaciones actúan sobre controles y tarjetas; no hay efecto que siga al cursor. Se respeta movimiento reducido. Las composiciones se ajustan en móvil.

Las referencias tienen variaciones de barra lateral y espaciado entre capturas; se unificaron para mantener navegación consistente. No se ha comprobado una igualdad píxel a píxel en el navegador. Las capturas completas se conservan como recursos fuente de las ilustraciones y pueden optimizarse posteriormente como recortes independientes.
