# Interfaz, tablas y documentos clínicos

## Interfaz

- `/app`: accesos a pacientes, agenda y módulos habilitados con iconos Lucide, color propio por módulo y tarjetas interactivas. La navegación usa la misma paleta y sigue filtrando permisos/módulos.
- `/app/pacientes`: identificación visual, iconos, búsqueda, paginación de API y toast al crear/editar. Los errores conservan el mensaje inline y muestran una notificación; los datos personales no se añaden al texto del toast.
- Nueva cita: iconos en paciente, profesional, sede, fecha, hora, duración y notas; indicador de guardado y toast de éxito.
- `Table`: paginación compartida de filas cargadas, tamaño 10/25/50/100, primera/anterior/siguiente/última página y conteo. Las tablas ya paginadas por backend desactivan el paginador local para evitar dos controles sobre el mismo resultado. La impresión muestra todas las filas cargadas.
- Se sustituyeron las tablas HTML de CRM y gráficas por el componente compartido. Los límites de los endpoints existentes (p. ej. movimientos recientes o mayores deudores) no se convierten en una consulta ilimitada por añadir paginación local.

## Animaciones de interfaz

Las tarjetas, botones y enlaces de acción animan su propia elevación al pasar el puntero. No hay aro, canvas ni efecto que siga al cursor. Las transiciones respetan movimiento reducido y solo se activan en dispositivos con hover. Se retiró la carga del motor WebGL en Next y Astro.

Referencia PDF: [PDFBox 3](https://pdfbox.apache.org/3.0/migration.html).

## Búsqueda y documento

- `GET /api/clinical-notes/search?q=&scope=signed&page=0&size=20`: consulta y cuenta en PostgreSQL, con filtro de clínica, búsqueda literal por nombre/documento del paciente, profesional, motivo y código diagnóstico. `scope=my-drafts` devuelve únicamente borradores del usuario. La consulta admite 160 caracteres y 1–100 resultados por página.
- `GET /api/patients/{id}/clinical-notes/page`: paginación de evoluciones del paciente, con las mismas validaciones clínicas.
- `/app/historias`: buscador, filtro firmado/borradores y tarjetas de documentos.
- `/app/historias/{noteId}`: documento legible con secciones, diagnóstico, profesional, firma, huella y notas aclaratorias.
- `/app/pacientes/{id}/historia`: antecedentes y evoluciones paginadas, con herramientas de exportación.

## Exportación, impresión y auditoría

- PDF y JSON se generan en el backend, sin entregar JWT al navegador; se acceden mediante BFF autenticado.
- Endpoints: `/api/patients/{id}/clinical-document.pdf` y `.json`, con `noteId` opcional para una evolución.
- Se verifican rol clínico, módulo habilitado, pertenencia del paciente y de la nota a la clínica. Una nota debe estar firmada y superar su comprobación de hash. No se modifica el contenido firmado.
- El PDF A4 incluye datos identificativos, antecedentes actuales, evoluciones firmadas, diagnósticos y aclaraciones. No incluye odontograma, imágenes ni consentimientos adjuntos. La exportación conjunta admite hasta 2000 evoluciones; si excede el límite se rechaza expresamente.
- Fuente Noto Sans embebida para caracteres españoles, saltos de página y numeración. Se incluye su licencia.
- La impresión prepara el PDF en un visor embebido y solicita el diálogo; si el navegador no lo permite, se puede descargar e imprimir desde un lector.
- Migraciones V24 y V25: `clinical_document_event`, RLS, pertenencia de referencias y permisos de solo agregar. Eventos PDF/JSON/PRINT y estados de correo, con operador/paciente/fecha, sin texto clínico ni dirección del destinatario en el registro.
- `GENERATED` acredita la generación; no acredita que el archivo se descargó o imprimió físicamente.

## Correo: preparado y desactivado

Se pospuso la configuración del proveedor. La interfaz muestra el estado pendiente y deshabilita enviar.

Cuando se configure SMTP, `POST /api/patients/{id}/clinical-document/email` exige `operationId` y confirmación. El destinatario se obtiene exclusivamente del correo registrado del paciente; no acepta un destinatario libre ni adjuntos aportados por el navegador. El operador confirma revisión del correo y autorización. Esta confirmación no verifica automáticamente identidad ni reemplaza los procedimientos de la clínica.

- Solo evoluciones firmadas y antecedentes actuales.
- TLS y comprobación de identidad del servidor, tiempos límite.
- Registro persistente del intento antes de enviar, sin reintentos automáticos.
- UUID para impedir repetir el mismo intento y límite de un intento por paciente por minuto.
- `ACCEPTED` indica aceptación por SMTP, no entrega al buzón. Fallos de transporte conservan `UNCERTAIN` para revisar con el proveedor.
- Nunca se envió un correo real en esta implementación.

Configurar en el entorno privado del backend, o `.env.production` para Compose:

```dotenv
CLINICAL_MAIL_ENABLED=false
CLINICAL_MAIL_HOST=
CLINICAL_MAIL_PORT=587
CLINICAL_MAIL_USERNAME=
CLINICAL_MAIL_PASSWORD=
CLINICAL_MAIL_FROM=
CLINICAL_MAIL_SSL=false
```

`false` en SSL usa STARTTLS obligatorio; `true` usa TLS implícito (habitualmente puerto 465). Activar únicamente después de configurar y validar la cuenta. Los valores reales son privados y no se incluyen en Git.

## Comprobaciones de implementación

Compilación Java, build Next, ESLint y Astro check/build. No se añadieron ni ejecutaron pruebas automatizadas ni envíos externos. Los flujos de descarga/impresión y su compatibilidad visual deben revisarse con el navegador y datos autorizados; esta compilación no equivale a una validación completa de operación clínica.
