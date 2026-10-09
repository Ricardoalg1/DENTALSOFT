# Etapa 12 — Panel de administración de plataforma

El equipo de Occlus crea clientes, decide qué módulos tiene cada uno, controla sus suscripciones y ve qué pasa en todas las cuentas. **Todo lo que restringe el acceso lo decide el backend**; el frontend solo lo refleja.

## Quién es administrador de plataforma

Una lista explícita de UUID de usuario en `OCCLUS_PLATFORM_ADMIN_IDS` (la misma que usa el CRM). No es un rol más: ser `ADMIN` de una clínica no da acceso. Cada llamada a `/api/platform/**` comprueba la lista, confirma en la base que el usuario sigue activo y recién entonces ejecuta en modo sistema (sin RLS). Cambiar la lista exige reiniciar el backend.

## Qué hace cada pieza

| Necesidad | Cómo se resuelve |
|---|---|
| Crear clientes | `POST /api/platform/clinics`: clínica, sede, administrador, suscripción y datos comerciales en **una transacción**. Genera una contraseña temporal que se muestra **una sola vez** (no se guarda). El administrador debe cambiarla antes de hacer nada (`403 PASSWORD_CHANGE_REQUIRED` mientras tanto, también en el JWT por la claim `pcr`). Si viene de una solicitud del CRM, queda marcada como ganada. |
| Módulos por cliente | `clinic_subscription.modules`. Seis módulos con dependencias (Facturación requiere Historia clínica y Tratamientos/caja; Reportes requiere Tratamientos/caja). Pacientes, agenda, sedes y equipo son el núcleo. |
| Exigirlos en el backend | `EntitlementInterceptor` sobre `/api/**`: lee la suscripción en **cada petición** (una lectura por clave primaria). Quitar un módulo o suspender surte efecto al instante, también para sesiones ya iniciadas; no hay que esperar a que venza el JWT. Los controladores se anotan con `@RequiresModule` o `@SkipEntitlements`; una prueba por reflexión falla si algún endpoint nuevo queda sin decidir. Los procesos de fondo (recordatorios, webhook de WhatsApp) también lo respetan. |
| Suscripciones automáticas | Prueba → cobro → activa → mora → suspendida, más cancelación al fin del periodo. **El acceso se calcula por fechas** (`Subscription.access`), no depende de que un proceso haya corrido: si el motor se cae, nadie obtiene acceso de más ni de menos. El motor (`SubscriptionEngine`) solo actualiza estados, cobra y avisa. |
| Datos del cliente | `platform_client`: razón social, contacto, ciudad, notas internas, origen. Conteos de uso (usuarios, pacientes, citas, archivos): **nunca datos clínicos**. |
| Auditoría | `platform_audit` es solo-inserción: la aplicación no puede modificar ni borrar filas. Guarda quién, qué, sobre quién y el detalle (sin secretos). |
| Eventos y notificaciones | `platform_event` con clave de deduplicación (un hecho aparece una vez aunque el motor corra mil veces) y `platform_notification` por persona del equipo. |
| Avisos a clínicas | `platform_announcement`: banner en la aplicación de todas las clínicas o de una. |
| Límite de usuarios | `UserLimits.lockAndCheck` con candado de asesoría + conteo, dentro de la transacción: dos altas simultáneas no superan el cupo. |

## Ciclo de vida de una suscripción

- **TRIAL**: acceso hasta `trial_ends_at` + días de gracia (`SUBSCRIPTION_GRACE_DAYS`, 7 por defecto).
- **ACTIVE**: acceso hasta el fin del periodo. Con cancelación programada, hasta el instante exacto (sin gracia). El plan interno no vence.
- **PAST_DUE**: llegó la fecha de cobro. Se crea **un** cobro por periodo (`unique (clinic_id, period_start)`). Con medio de pago se intenta con la pasarela; sin él, se avisa para cobrar a mano. Acceso durante la gracia.
- **SUSPENDED**: superada la gracia, o suspendida a mano. Sin acceso; los datos no se tocan.
- **CANCELLED**: sin acceso. `reactivate` (cortesía) o un pago manual (el periodo empieza hoy: no se cobra lo que no se pudo usar) la devuelven a ACTIVE.

Reintentos del cobro automático: hasta 4 intentos, a 1, 3 y 5 días. Con la gracia por defecto la clínica se suspende antes de agotarlos; el cobro queda pendiente y se paga a mano. Cada intento reserva el cobro (arrendamiento de 10 min) y la llamada a la pasarela ocurre **sin transacción ni candado abiertos**, con clave de idempotencia. Dos motores a la vez no cobran dos veces (`skip locked`; probado con 4 hilos).

Un pago manual se acepta **una vez por referencia y cliente**: un doble clic no paga dos periodos.

## Pantallas (`/app/plataforma`, solo equipo Occlus)

Resumen (clientes por estado, ingreso mensual recurrente, pruebas por terminar, mora, renovaciones, ejecutar el motor a mano) · Clientes (filtros, alta, ficha con suscripción, módulos, cobros, datos, uso, actividad) · Notificaciones · Eventos · Auditoría · Planes · Avisos.

En la aplicación de cada clínica: el menú solo muestra los módulos contratados, las rutas de módulos no incluidos llevan a una pantalla que lo explica, una suscripción suspendida/cancelada muestra una pantalla de acceso pausado, y hay avisos de prueba por terminar, pago pendiente y anuncios. `/app/cuenta` muestra el plan y cambia la contraseña.

## Decisiones y supuestos que conviene revisar

- **Qué módulos trae cada plan** es una suposición de negocio (Esencial: historia clínica y tratamientos/caja; Equipo: + reportes; Integral y Global: todos). Se edita en *Planes* sin tocar código; los clientes existentes conservan lo suyo.
- **La pasarela de pagos es simulada** (`occlus.platform.gateway: simulated`; aprueba salvo que el token contenga «fail»). El arranque falla si se configura otra. Falta elegir proveedor (Wompi, ePayco, etc.) y escribir su adaptador (`PaymentGateway`): hay que conseguir credenciales y decidir tokenización. Mientras tanto, los pagos reales se registran a mano. **Nunca se guardan datos de tarjeta**, solo el token.
- **Sin restablecer contraseñas ni «entrar como el cliente»**, a propósito: darían acceso a datos clínicos desde el panel. Si un cliente olvida su contraseña hay que decidir el flujo (correo de recuperación) antes de construirlo.
- **El JWT no se revoca** al cambiar el rol de alguien; la suscripción y los módulos sí rigen al instante porque se consultan en cada petición.
- El registro abierto está **apagado en producción** (`SELF_REGISTRATION=false` en backend y frontend); en desarrollo sigue encendido y crea una prueba de 14 días del plan Integral.
- Las 8 clínicas que ya existían pasaron a plan *Interno* (todos los módulos, sin cobro ni vencimiento) para no cortar a nadie.

## Configuración

| Variable | Valor por defecto | Para qué |
|---|---|---|
| `OCCLUS_PLATFORM_ADMIN_IDS` | vacío | UUID de quienes administran la plataforma (separados por coma). **Obligatoria en producción**; si está vacía, nadie entra al panel. |
| `SELF_REGISTRATION` | `true` (dev), `false` (prod) | Registro abierto de clínicas. |
| `SUBSCRIPTION_GRACE_DAYS` | `7` | Días de acceso tras vencer la prueba o el pago. |
| `SUBSCRIPTIONS_SCHEDULER` | `false` (dev), `true` (prod) | Ejecuta el motor cada 15 min. Con `false` se puede lanzar a mano desde el panel. |
| `SELF_SERVICE_TRIAL_DAYS` | `14` | Prueba del registro abierto. |

Migraciones: `V19__platform_admin.sql` (tablas, políticas RLS, planes y migración de las clínicas existentes) y `V20__platform_indexes.sql`.

## Pruebas

Backend: 29 pruebas nuevas contra PostgreSQL real (Testcontainers).

- `EntitlementCoverageTests`: ningún endpoint sin decidir; dependencias de módulos coherentes.
- `PlatformAdminTests`: solo el equipo entra al panel; el panel no expone datos clínicos; alta con cambio forzado de contraseña; módulos exigidos con la misma sesión y dependencias validadas; suspensión inmediata; límite de usuarios, incluida la carrera concurrente; RLS y auditoría solo-inserción; avisos, notificaciones, planes, edición de datos.
- `SubscriptionEngineTests`: avisos sin duplicar; acceso por fechas sin motor; cobro por pasarela una sola vez (también con 4 motores en paralelo); reintentos, suspensión y pago manual; sin tarjeta; cancelación (al fin del periodo y de inmediato); extensión de prueba; el token de pago nunca vuelve al navegador.
- `SelfRegistrationDisabledTests`.

Navegador (Playwright): alta de un cliente, entrega de la contraseña temporal, cambio forzado, menú por módulos, `/app/inventario` bloqueado, habilitar el módulo, suspender con la sesión abierta (pantalla de acceso pausado), reactivar, y recorrido de todas las páginas sin errores de consola.

> **Aviso para quien desarrolla con VS Code:** el servidor de lenguaje Java de la extensión recompila sobre `backend/target/classes` con otro nivel de fuente y deja clases con «Unresolved compilation problems». Si `./mvnw test` falla al cargar el contexto con ese mensaje, ejecuta las pruebas desde una copia del backend (con `docker/` junto a ella) o cierra la ventana de Java del IDE.
