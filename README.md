# Occlus

Software en la nube para clínicas odontológicas en Colombia — [occlus.lat](https://occlus.lat).

| Carpeta | Stack |
|---|---|
| `backend/` | Java 21 · Spring Boot 4 · PostgreSQL · Flyway · Spring Security (JWT) |
| `frontend/` | Next.js 16 · TypeScript · Tailwind · shadcn/ui |

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
- Flyway es dueño del esquema (`backend/src/main/resources/db/migration`); Hibernate solo valida.

## Roadmap

1. ✅ Base: clínicas, sedes, usuarios, roles, login
2. ✅ Pacientes + RLS + auditoría
3. ✅ Agenda (citas, horarios, reprogramación con arrastrar y soltar)
4. ✅ Historia clínica + odontograma
5. Tratamientos, presupuestos y caja
6. Facturación electrónica DIAN + RIPS (Res. 2275/2023)
7. Inventario
8. Reportes
9. Recordatorios WhatsApp + asistente IA
10. Sitio público (planes, blog, demo)
