# Occlus

Software en la nube para clínicas odontológicas en Colombia — [occlus.lat](https://occlus.lat).

| Carpeta | Stack |
|---|---|
| `backend/` | Java 21 · Spring Boot 4 · PostgreSQL · Flyway · Spring Security (JWT) |
| `frontend/` | Next.js 16 · TypeScript · Tailwind · shadcn/ui |

## Desarrollo local

```bash
# 1. Base de datos (Postgres en el puerto 5433)
docker compose up -d

# 2. Backend → http://localhost:8080  (Swagger: /swagger-ui.html)
cd backend && ./mvnw spring-boot:run

# 3. Frontend → http://localhost:3000
cd frontend && pnpm install && pnpm dev
```

Pruebas del backend (levantan su propio Postgres con Testcontainers, requiere Docker):

```bash
cd backend && ./mvnw test
```

## Arquitectura

- El navegador **nunca** habla directo con Spring Boot. Next.js (Server Components y Server Actions)
  llama al backend y guarda el JWT en una cookie `httpOnly`.
- Cada clínica es un *tenant*: todas las tablas de negocio llevan `clinic_id` y el backend lo toma
  siempre del JWT, nunca del request.
- Flyway es dueño del esquema (`backend/src/main/resources/db/migration`); Hibernate solo valida.

## Roadmap

1. ✅ Base: clínicas, sedes, usuarios, roles, login
2. Pacientes
3. Agenda
4. Historia clínica + odontograma
5. Tratamientos, presupuestos y caja
6. Facturación electrónica DIAN + RIPS (Res. 2275/2023)
7. Inventario
8. Reportes
9. Recordatorios WhatsApp + asistente IA
10. Sitio público (planes, blog, demo)
