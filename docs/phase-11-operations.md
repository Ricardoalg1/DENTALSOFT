# Etapa 11 — Preparación para producción y operación

El plan funcional inicial termina en la fase 10. Esta etapa adicional prepara el lanzamiento y la operación. Las conexiones reales a proveedores de las fases 6 y 9 siguen pendientes.

## Implementado

- Spring Boot: sondas de liveness/readiness y readiness con PostgreSQL. Las respuestas públicas de salud ocultan detalles. Cierre gradual del proceso y ventana de 40 segundos en Docker.
- Next: `/bff/health` devuelve únicamente UP/DOWN y consulta readiness del backend con un límite de 3 segundos. No solicita JWT ni expone configuración.
- Astro: `/site-api/health` indica que el sitio está atendiendo. La portada puede funcionar cuando la API de clínicas está caída.
- Compose: espera backend sano antes de arrancar Next, y Next/Astro sanos antes del proxy. Registro Docker acotado a tres archivos de 10 MB por servicio.
- Backend: cada solicitud recibe `X-Occlus-Request-Id`, generado por el servidor. El filtro registra método, código y duración; no URL, query, cuerpo, cookies, autorización o información clínica. Las sondas de salud no generan líneas del filtro. Otros logs del framework/proveedores mantienen sus políticas propias.
- Next: errores inesperados tienen pantalla de recuperación y referencia de soporte. Las llamadas normales a API tienen límite de 30 segundos y BFF de 60; se respeta una señal explícita del llamador. Fallos de conexión retornan un mensaje controlado. No se reintentan mutaciones automáticamente: la operación pudo haberse guardado aunque la respuesta no llegara.
- Herramienta `scripts/service-status.py` para revisar los tres servicios.
- Herramientas para respaldo PostgreSQL cifrado y restauración en una base vacía, sin ejecutar respaldos o restauraciones reales durante la implementación.

Las sondas indican disponibilidad técnica de proceso/base, no verifican todos los flujos clínicos, archivos S3, emisión DIAN o entrega de WhatsApp. Docker Compose no reinicia un contenedor solo por marcarse unhealthy; el reinicio de proceso usa la política del contenedor. La monitorización externa y las alertas se configuran al elegir el servidor.

## Revisar estado local

```sh
python3 scripts/service-status.py
```

Para consultar un despliegue:

```sh
python3 scripts/service-status.py --site https://occlus.lat --app https://occlus.lat --backend http://DIRECCION_INTERNA:8080
```

El backend continúa sin publicarse por el proxy. Ejecuta su comprobación desde la red interna. La herramienta devuelve código 1 si algún servicio no está disponible, sin imprimir credenciales o detalles del error.

## Respaldo PostgreSQL

Requisitos: `pg_dump` compatible con la versión del servidor (PostgreSQL 17 en el proyecto), `age`, Python 3.11+ y un rol que pueda respaldar toda la base. El rol de aplicación con RLS no debe usarse como rol de respaldo completo. PostgreSQL impide respaldar una base más nueva con un cliente pg_dump de versión anterior. [Documentación de pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html).

1. Genera una identidad age en una estación segura:

   ```sh
   age-keygen -o occlus-backup.agekey
   chmod 600 occlus-backup.agekey
   ```

   Conserva la identidad privada fuera del servidor de aplicación y copia solo el destinatario público `age1...` al entorno del respaldo. El funcionamiento de estas identidades está descrito en [age](https://github.com/FiloSottile/age).

2. Prepara un archivo `PGPASSFILE` privado con el acceso autorizado y permisos 600. No guardes contraseñas en el repositorio o comandos compartidos. Configura variables de conexión:

   ```sh
   export PGHOST=ENDPOINT_RDS
   export PGPORT=5432
   export PGDATABASE=occlus
   export PGUSER=ROL_AUTORIZADO_DE_RESPALDO
   export PGPASSFILE=/ruta/privada/pgpass
   export PGSSLMODE=verify-full
   export PGSSLROOTCERT=/ruta/deploy/certs/global-bundle.pem
   export AGE_RECIPIENT=age1_DESTINATARIO_PUBLICO
   export BACKUP_DIR=/ruta/privada/backups
   bash scripts/backup-postgres.sh
   ```

   El script usa streaming desde `pg_dump` hacia `age`, no escribe un dump sin cifrar. Produce `.dump.age` y checksum SHA-256. Preserva las definiciones y permisos para recuperación. No crea roles globales ni respalda objetos de S3. Si falla el dump o el cifrado, elimina el archivo temporal.

3. Guarda archivo y checksum en el almacenamiento privado elegido. Define periodicidad, conservación y acceso. No se configuró envío a AWS ni borrado de respaldos automático.

## Recuperar en un destino separado

Aprovisiona una base **vacía**, roles originales y permisos suficientes. Mantén ese entorno sin integraciones externas activas. No apunta automáticamente a producción ni elimina bases o tablas existentes.

```sh
export PGHOST=DESTINO_DE_RECUPERACION
export PGDATABASE=occlus_recuperacion
export PGUSER=ROL_AUTORIZADO_DE_RESTAURACION
export PGPASSFILE=/ruta/privada/pgpass-recuperacion
export AGE_IDENTITY_FILE=/ruta/privada/occlus-backup.agekey
bash scripts/restore-postgres.sh /ruta/occlus.dump.age --confirm-empty-database occlus_recuperacion
```

El script exige confirmación del nombre, archivos privados y checksum coincidente; rechaza un destino con tablas, vistas o secuencias. Usa una transacción y detiene la operación ante errores. Conserva propietarios y permisos; no usa `--clean`, `--create` ni deshabilita triggers. Roles ausentes o permisos insuficientes causan error y rollback. Los archivos S3 necesitan recuperación independiente, con sus mismas claves de objeto.

Una restauración real y la revisión posterior requieren un entorno de recuperación autorizado. No se realizó ninguna restauración en esta etapa.

## Secuencia de lanzamiento pendiente

1. Completar correo público y usuario comercial autorizado de Occlus.
2. Acordar privacidad, plazos y condiciones comerciales.
3. Completar servidor/dominio, PostgreSQL, S3/IAM y `.env.production`.
4. Compilar imágenes y revisar arranque/conectividad en un entorno de preparación.
5. Configurar y ejecutar respaldo, recuperación separada, monitorización y alertas.
6. Publicar tras revisar el resultado concreto del entorno de preparación.
7. Activar proveedor DIAN/RIPS, Meta/WhatsApp y Claude cuando las cuentas estén listas.

Recuperación de contraseña por correo, MFA, cobros de suscripciones y límites por plan no forman parte del alcance implementado de esta etapa. Se deben acordar como funciones adicionales con su proveedor y reglas comerciales.

## Validación de esta implementación

Compilación Java, build Next, Astro check/build y ESLint. Revisión sintáctica de herramientas de operación. No se añadieron ni ejecutaron pruebas automatizadas, respaldos/restauraciones reales, despliegues o mensajes externos.

## Referencias

La separación entre liveness y readiness y la inclusión explícita de la base de datos siguen la [documentación de Actuator](https://docs.spring.io/spring-boot/reference/actuator/endpoints.html). La elección de DB en readiness se hizo porque la gestión clínica requiere persistencia; liveness no depende de ella.
