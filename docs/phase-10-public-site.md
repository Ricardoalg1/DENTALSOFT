# Fase 10 — Sitio Astro y CRM comercial

## Qué quedó implementado

- `site/`: sitio público escrito en **Astro 7**, Tailwind y HTML/CSS/SVG propios. Portada, planes, blog, demo, privacidad, condiciones, 404, sitemap, robots y tarjeta social.
- `frontend/`: Next.js para la aplicación de clínicas y CRM privado. La raíz redirige a Astro. No hay CMS ni panel comercial en la portada.
- Datos compartidos de planes/artículos en `shared/site-content.ts`. Planes Esencial, Equipo, Integral y Global; precios y tamaños conservan lo acordado. No se procesan pagos, se aplican suscripciones o se hacen cobros automáticos.
- El formulario de Astro funciona con POST nativo, incluso sin JavaScript, preserva datos cuando falla y muestra éxito tras aceptación del backend. Validación de origen, consentimiento, campos y tamaño. Clave privada entre servidores; nunca se envía al navegador.
- Backend: deduplicación por correo/24 horas y límite global de 60 nuevas solicitudes/hora.
- CRM con búsqueda y filtros en la base, paginación de 25 solicitudes, estados, notas y fecha del siguiente seguimiento. El filtro de pendientes incluye fechas vencidas/hoy de solicitudes abiertas en la zona de Bogotá.
- Eliminación por privacidad: exige confirmar identidad/petición y escribir ELIMINAR. Borra solicitud y todas sus notas. Guarda un evento mínimo con identificadores, operador, motivo y fecha, sin datos de contacto ni texto del mensaje.
- Retención opcional: desactivada por defecto, con plazo explícito entre 1 y 3650 días desde última actualización. Se procesan hasta 500 solicitudes por día a las 03:20 de Bogotá, usando bloqueo para evitar carreras entre instancias. El proceso también elimina métricas con más de 90 días. No se activó ni se borró ninguna solicitud durante la implementación.
- Analítica opcional: vistas por ruta/día, sin identificadores de visitantes, IP o cookies en las tablas de métricas. Cuenta vistas, no personas; puede incluir bots. La configuración se obtiene en tiempo de ejecución.
- SINE SAS y Ricardo Algarin configurados como responsable/contacto. Falta el correo público y definir el plazo de conservación. El formulario de producción no acepta solicitudes sin responsable y correo configurados.
- Migraciones V17 y V18 aplicadas en la base local mediante Flyway; no se modificaron migraciones ya aplicadas.
- Dockerfiles para los tres servicios; despliegue preparado con Caddy HTTPS y Nginx que limita recepción de demo y métricas. GitHub Actions compila los tres proyectos sin despliegue automático.

## Abrir en localhost

Desde la raíz:

```sh
cd /Users/macbookair/DENTALSOFT
docker compose up -d
python3 scripts/configure-site.py
```

Abre terminales separadas y deja cada proceso funcionando:

```sh
# Backend. Si ya está activo en 8080, conserva el proceso existente.
cd /Users/macbookair/DENTALSOFT/backend
./mvnw spring-boot:run
```

```sh
# Aplicación clínica y CRM
cd /Users/macbookair/DENTALSOFT/frontend
node node_modules/next/dist/bin/next dev
```

```sh
# Sitio público Astro
cd /Users/macbookair/DENTALSOFT/site
npm install
npm run dev
```

- Portada y planes: http://localhost:4321
- Aplicación: http://localhost:3000/ingresar
- CRM: http://localhost:3000/app/comercial (solo usuarios autorizados)
- Backend: http://localhost:8080

Si una terminal informa que el puerto está ocupado, el servicio ya está activo o hay otro proceso usándolo; no abras una segunda instancia en ese puerto.

## Configuración local

`python3 scripts/configure-site.py` prepara una clave privada compartida en `backend/site.properties`, `site/.env` y el archivo privado de frontend, preservando configuración existente y sin mostrar secretos. Los tres archivos son ignorados por Git. Reinicia los procesos después de editar configuración.

En `backend/site.properties`:

```properties
occlus.marketing.admin-user-ids=UUID_DEL_ADMIN_AUTORIZADO_DE_OCCLUS
occlus.marketing.analytics-enabled=false
occlus.marketing.retention-enabled=false
occlus.marketing.retention-days=0
```

No se autorizan usuarios automáticamente. Usa un usuario existente con rol ADMIN que pertenezca al equipo de Occlus, no un administrador de una clínica cliente. Su UUID está en la respuesta autenticada de `/api/auth/me`.

En `site/.env`:

```dotenv
API_URL=http://localhost:8080
PUBLIC_APP_URL=http://localhost:3000
SITE_OWNER_NAME=SINE SAS
SITE_CONTACT_NAME=Ricardo Algarin
SITE_CONTACT_EMAIL=CORREO_REAL
SITE_ANALYTICS_ENABLED=false
SITE_RETENTION_DAYS=
```

`SITE_PUBLIC_API_KEY` ya la prepara el script. Para métricas activa ambos indicadores. Solo publica un plazo de conservación después de acordarlo y activar el mismo número de días en backend. No se inventó una política de conservación o contrato comercial.

`PUBLIC_APP_URL` y `SITE_URL` se usan al compilar las páginas estáticas: recompila Astro al cambiar el dominio. La clave, correo y flags del servidor se leen al ejecutar. El script de inicio de Astro carga `site/.env` mediante Node.

## Compilación local para producción

```sh
cd site
npm run check
npm run build
npm start
```

Para la aplicación Next:

```sh
cd frontend
node node_modules/next/dist/bin/next build
node node_modules/next/dist/bin/next start
```

Y para Java:

```sh
cd backend
./mvnw -DskipTests package
java -jar target/occlus-backend-0.0.1-SNAPSHOT.jar
```

Los servidores deben ejecutarse con una configuración coherente del dominio y origen. El formulario de producción exige el correo del responsable, aunque las páginas estáticas se pueden compilar sin datos privados.

## Despliegue preparado

Consulta [deployment.md](deployment.md). No se ejecutó ningún despliegue o cambio de DNS.

## Pendientes que necesitan información externa

1. Correo público de SINE SAS y correo/UUID del usuario comercial autorizado.
2. Plazo operativo de conservación y revisión del aviso de privacidad y condiciones por el responsable. La plantilla es una versión de preparación, no un contrato o política aprobados.
3. Servidor, dominio/DNS, PostgreSQL, bucket S3 privado, rol IAM y credenciales de despliegue.
4. Proveedor de facturación, WhatsApp y asistente IA: configuración externa de fases 6 y 9, que siguen pendientes de activación. Los planes no prometen cumplimiento internacional automático.

No se envían correos o mensajes a terceros desde esta fase. No se borró información comercial ni se activó la retención automática. Los registros de borrado mínimo y las copias de seguridad requieren su propia política operativa de conservación.

## Validación realizada

Compilación/paquete Java, Astro check/build, Next build y ESLint. Sin pruebas automatizadas ni emisión, envío de mensajes o pagos reales. Las imágenes Docker y el despliegue remoto quedan preparados; no se afirma validación integral en producción.

## Referencias técnicas

- [Astro con adaptador Node](https://docs.astro.build/en/guides/integrations-guide/node/): páginas estáticas y endpoints bajo un servidor Node.
- [Nginx limit_req](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html): límites de solicitudes por clave y respuesta 429.
- [Caddy reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy): cabeceras y reenvío hacia el proxy interno.
