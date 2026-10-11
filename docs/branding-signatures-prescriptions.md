# Logos de clínicas, firmas y fórmulas médicas

## Dónde se configura

En **Mi cuenta**:

- El administrador puede subir el logo de su clínica y definir dirección, teléfono y correo del encabezado.
- Cada colaborador registra su propio número profesional y firma. Puede subir PNG/JPEG o dibujarla con ratón/táctil. Debe confirmar que le pertenece.
- Las imágenes admiten hasta 1 MB, máximo 2000 px por lado y 2 megapíxeles. El backend valida el formato real y guarda PNG normalizado, sin metadatos originales.
- Quitar o reemplazar una firma/logo no elimina versiones usadas por documentos firmados.

No se cambia el logo comercial de Occlus ni se comparte identidad entre clínicas. Los activos se sirven por BFF autenticado y no tienen URL pública.

## Fórmulas e indicaciones

Dentro de cada paciente, en **Fórmulas médicas**:

1. Un usuario activo marcado como profesional crea un borrador.
2. Añade medicamentos manualmente: nombre, concentración, presentación, dosis, vía, frecuencia, duración, cantidad e indicaciones. Puede crear un documento solo de recomendaciones.
3. Guarda y revisa el borrador. Solo su autor puede leer/editar el borrador.
4. Confirma la revisión y firma. Requiere registro profesional y firma configurados. Se valida que el PDF pueda generarse en la misma transacción; si falla, la fórmula sigue en borrador.
5. El documento emitido ofrece vista, PDF e impresión. Las listas se paginan en backend (10 por página).

No se sugieren medicamentos ni dosis y no se copian recomendaciones del PDF aportado. Las decisiones clínicas las escribe y revisa el profesional.

## Firma e integridad

La firma es una **imagen gráfica**, acompañada por autor autenticado, registro profesional, fecha y huella SHA-256. No se presenta como firma digital certificada ni se verifica automáticamente el registro profesional ante una entidad externa.

Al emitir una fórmula se congelan los datos del paciente, identidad/contacto/logo de la clínica y nombre/registro/firma del profesional. La fórmula firmada es inmutable en PostgreSQL; si requiere corrección se crea otra fórmula. Se guarda una UUID de operación para evitar duplicar la creación por un mismo intento.

Las nuevas evoluciones guardan una referencia inmutable a la firma existente cuando se firman. Las evoluciones antiguas no reciben una firma gráfica retroactiva. La exportación de historia usa el encabezado actual de la clínica, conserva el contenido clínico firmado y añade las firmas capturadas donde estén disponibles.

## Backend y aislamiento

Migración **V26** (aplicada a la base local):

- `document_asset`: imágenes privadas versionadas, solo inserción/lectura para el rol de aplicación.
- `clinic_document_branding`: encabezado por clínica.
- `user_document_profile`: registro y firma actual por colaborador.
- `clinical_note_signature`: evidencia capturada al firmar una evolución.
- `clinical_prescription`: borrador/emitida, contenido, instantánea y huella.
- `clinical_prescription_event`: eventos de creación, edición, firma y generación PDF. No incluye texto de medicamentos ni imágenes en logs.

Todas tienen RLS por `clinic_id`. Triggers verifican referencias de la misma clínica, autor profesional activo, firma propia e inmutabilidad. Controladores clínicos requieren módulo `CLINICAL_RECORD` y rol clínico; los servicios comprueban además autor/profesional. Recepción no accede a fórmulas.

Servicios: `DocumentBrandingService`, `PrescriptionService`, `BrandedPdfRenderer`. El PDF usa PDFBox y Noto Sans, colores marino/turquesa, logo repetido, firma, ajuste de texto, márgenes A4 y paginación.

## Comprobaciones

Build Next, ESLint y compilación Java. La muestra PDF se generó con el renderizador de producción y datos ficticios para revisión visual; no es una receta real. No se ejecutaron suites de pruebas ni envíos externos. La compatibilidad del diálogo de impresión depende del visor PDF del navegador; se ofrece descarga como alternativa.

Los eventos `PDF` acreditan generación, incluida la validación al firmar, no impresión física ni descarga completada.

## Entorno local

Se detectó un backend en ejecución desde el entorno de desarrollo en el puerto 8080. No se detuvo ese proceso. Si el IDE no recarga los nuevos controladores, reinícialo. El editor puede generar clases incompatibles con Java 21 en `target/classes`; para ejecutar una compilación Maven limpia, primero detén el backend del IDE, ejecuta `./mvnw -DskipTests clean package` dentro de `backend` y arranca el JAR generado.
