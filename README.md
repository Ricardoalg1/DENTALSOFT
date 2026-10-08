# Occlus

Software en la nube para clínicas odontológicas en Colombia — [occlus.lat](https://occlus.lat).

| Carpeta | Stack |
|---|---|
| `backend/` | Java 21 · Spring Boot 4 · PostgreSQL · Flyway · Spring Security (JWT) |
| `frontend/` | Next.js 16 · TypeScript · Tailwind · shadcn/ui |
| `site/` | Astro 7 · Tailwind · sitio público |

## Desarrollo local

```bash
# 1. Base de datos (Postgres, puerto 5433) y almacenamiento S3 (SeaweedFS, puerto 8333)
docker compose up -d

# 2. Backend → http://localhost:8080  (Swagger: /swagger-ui.html)
cd backend && ./mvnw spring-boot:run

# 3. Frontend → http://localhost:3000
cd frontend && pnpm install && pnpm dev
```

Pruebas del backend (levantan su propio Postgres y S3 con Testcontainers, requiere Docker):

```bash
cd backend && ./mvnw test
```

> Detén `spring-boot:run` antes de correr `./mvnw clean …`: DevTools recarga las clases mientras Maven
> las reescribe y el servidor queda caído con `ClassFormatError`.

## Arquitectura

- El navegador **nunca** habla directo con Spring Boot. Next.js (Server Components y Server Actions)
  llama al backend y guarda el JWT en una cookie `httpOnly`.
- **Multi-tenant (BD compartida + `clinic_id`)** con dos capas de aislamiento:
  1. El backend toma el `clinic_id` del JWT (nunca del request) y filtra cada consulta.
  2. **Row-Level Security de Postgres**: `TenantAwareDataSource` fija `app.clinic_id` en cada conexión y
     las políticas solo dejan ver/escribir filas de esa clínica, aunque el código olvide filtrar.
- **Dos roles de base de datos**: `occlus` (dueño, solo Flyway) y `occlus_app` (la app; sin privilegios
  para saltarse RLS). En local el rol se crea con `docker/postgres/01-app-role.sql`; en producción hay que
  crearlo a mano y definir `DB_USER`/`DB_PASSWORD` y `DB_MIGRATION_USER`/`DB_MIGRATION_PASSWORD`.
- **Auditoría** con Hibernate Envers: cada cambio a un paciente guarda la versión completa, quién y cuándo
  (`audit_revision`, `patient_aud`). La app no tiene permiso para editar ni borrar ese historial.
- **Agenda**: Postgres impide que un profesional tenga dos citas activas que se crucen (restricción de
  exclusión `ex_appointment_dentist_overlap`), así que ni dos recepcionistas al mismo tiempo pueden crear un cruce.
  Las horas se manejan en hora de Colombia (UTC-5, sin horario de verano).
- **Historia clínica** (Res. 1995 de 1999): solo el equipo de salud la ve (recepción no) y solo los profesionales
  escriben. Las evoluciones se firman y desde ahí son inmutables: el trigger `tg_clinical_note_immutable`
  bloquea cualquier `UPDATE`/`DELETE`, y un hash SHA-256 guardado al firmar permite detectar alteraciones.
  Se corrigen con notas aclaratorias (solo-agregar). Diagnósticos CIE-10 con la estructura de RIPS.
- **Odontograma** (notación FDI): las marcas nunca se borran (`removed_at`), así que se puede ver el
  odontograma de cualquier fecha; calcula COP-D y ceo-d.
- **Historia clínica** (Res. 1995 de 1999): las evoluciones firmadas y los consentimientos son inmutables
  (triggers de Postgres) y llevan una huella SHA-256 para detectar alteraciones; se corrigen con notas
  aclaratorias o se revocan, nunca se editan ni se borran. Los archivos tampoco se borran: se ocultan con motivo.
- **Archivos** (radiografías, fotos, firmas) en S3. En local, SeaweedFS (MinIO dejó de publicar imágenes
  gratuitas); en producción, AWS S3 con `STORAGE_ENDPOINT` vacío. El tipo de archivo se detecta por su
  contenido, no por la extensión. El navegador los ve a través de `/bff/files/{id}`, nunca con una URL pública.
- **Reportes**: agregaciones en SQL (`JdbcTemplate`) filtradas por clínica y reforzadas por RLS; solo
  administradores. El CSV de pagos usa `;`, BOM UTF-8 y neutraliza fórmulas (inyección CSV en Excel).
- Flyway es dueño del esquema (`backend/src/main/resources/db/migration`); Hibernate solo valida.

## Roadmap

1. ✅ Base: clínicas, sedes, usuarios, roles, login
2. ✅ Pacientes + RLS + auditoría
3. ✅ Agenda (citas, horarios, reprogramación con arrastrar y soltar)
4. ✅ Historia clínica + odontograma
5. ✅ Tratamientos, presupuestos y caja (con protección de cobros simultáneos y cierres)
6. 🚧 Facturación electrónica DIAN + RIPS: borradores y revisión local implementados; emisión y MUV pendientes
7. ✅ Inventario: insumos, existencias por sede, lotes, movimientos y alertas
8. ✅ Reportes (recaudo, producción, agenda, cartera, exportación CSV)
9. 🚧 Mensajería: recordatorios, bandeja, simulador y clasificación Claude implementados; activación y validación externa pendientes
10. ✅ Sitio público (planes, blog, demo), CRM comercial y métricas agregadas — configuración y publicación pendientes
11. 🚧 Etapa adicional de producción y operación: salud, errores, logs y herramientas de respaldo implementados; despliegue y recuperación reales pendientes

## Facturación y RIPS — Fase 6 en curso

Los administradores pueden entrar a **Facturación y RIPS**, guardar los datos fiscales del prestador y
crear documentos desde **Pacientes → Tratamientos y pagos → Preparar factura**. Solo se incluyen
procedimientos realizados. Cada procedimiento se reserva en un único documento activo; cancelar el
borrador libera la reserva. Los documentos preparados conservan una copia de los datos del paciente,
los precios y los diagnósticos tomados de evoluciones firmadas.

Se implementaron la vista previa de RIPS para consultas y procedimientos, las comprobaciones locales
y la descarga de un **borrador JSON**. Se toma como referencia la Resolución **0948 de 2026** y el
documento técnico 1 **v003 del 15 de julio de 2026**, publicados en
[SISPRO](https://contenidos.sispro.gov.co/central-financiamiento/Pages/facturacion-electronica.aspx).

La fase 6 todavía requiere elegir e integrar un proveedor tecnológico, habilitar la emisión DIAN
(incluidos numeración autorizada, XML y CUFE), verificar los catálogos oficiales y conectar el MUV para
obtener el CUV. Los consecutivos `OCL-*` identifican borradores internos. La exportación conserva
`numFactura: null` hasta que exista una FEV emitida; no debe radicarse como documento validado.

El alcance y los pasos pendientes están en [docs/phase-6-billing.md](docs/phase-6-billing.md).

## Mensajes — Fase 9

Administración y recepción tienen una bandeja en **Mensajes**. Se implementaron recordatorios con
autorización del paciente, simulación de respuestas, confirmación/cancelación explícitas y atención
humana de preguntas/reprogramaciones. El asistente Claude clasifica respuestas administrativas;
no accede a la historia clínica ni ejecuta decisiones de agenda por sí mismo.

El modo inicial es simulado y la automatización está apagada. No envía WhatsApp ni llama a Claude.
El adaptador real requiere configurar Meta, una plantilla aprobada y un webhook HTTPS. Alcance,
configuración y límites en [docs/phase-9-messaging.md](docs/phase-9-messaging.md).

## Inventario — Fase 7

Disponible en **Inventario** para todo el equipo. Administradores gestionan el catálogo, stock mínimo
y ajustes; administradores y auxiliares registran entradas, consumos, bajas y traslados.
Los saldos se manejan por sede y lote, con hasta tres decimales en la unidad definida.
Los movimientos son inmutables, no permiten stock negativo y registran usuario, motivo y referencia.
Los lotes vencidos no se consumen y generan alertas junto con los próximos a vencer y el stock bajo.
Detalle de operación y alcance en [docs/phase-7-inventory.md](docs/phase-7-inventory.md).

## Sitio público — Fase 10

Sitio público en Astro (`site/`): inicio, planes con pago mensual/anual, blog y solicitudes persistentes de demo. Aplicación clínica y CRM privado en Next.js (`frontend/`).
CRM separado de las clínicas, con acceso explícito para el equipo de Occlus, paginación, fechas de seguimiento y eliminación por privacidad. Docker y CI preparados; despliegue remoto pendiente.
Consulta configuración, precios y pendientes de publicación en [docs/phase-10-public-site.md](docs/phase-10-public-site.md).

Para abrir en localhost y compilar, sigue [Fase 10](docs/phase-10-public-site.md#abrir-en-localhost).

## Producción y operación — Etapa 11

Controles de disponibilidad, identificadores de solicitudes, errores controlados y herramientas de respaldo cifrado/restauración. Estado de servicios: `python3 scripts/service-status.py`.
Alcance y pasos pendientes en [docs/phase-11-operations.md](docs/phase-11-operations.md).
