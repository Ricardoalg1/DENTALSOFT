# Flujo de ramas y entornos de Occlus

## Ramas

- `development`: integración diaria. Recibe `feature/*` y `fix/*` mediante pull request.
- `test`: candidato a liberación. Ejecuta pruebas de integración y usa datos de prueba.
- `production`: solo se actualiza desde `test`, con revisión y etiqueta de versión.

Flujo recomendado:

```text
feature/* -> development -> test -> production
```

Las ramas `test` y `production` deben estar protegidas en GitHub: pull request obligatorio, revisión de otra persona, checks verdes y sin push directo.

## Separación de datos

Producción nunca comparte credenciales ni datos con desarrollo o test.

| Entorno | Base de datos | Archivos | Secretos |
| --- | --- | --- | --- |
| Desarrollo | PostgreSQL local | SeaweedFS/MinIO local | `.env.local` sin datos reales |
| Test | PostgreSQL de prueba separado o efímero en CI | bucket `occlus-archivos-test-*` | `occlus/test/*` |
| Producción | RDS `occlus-db` | `occlus-archivos-540586745772` | `occlus/production/*` |

Para producción se mantienen backups, cifrado, eliminación protegida y acceso privado. No se deben copiar pacientes reales a test; si se necesita una copia, debe anonimizarse primero.

## Publicación

1. Se desarrolla en `development`.
2. Al pasar las pruebas, se abre PR a `test`.
3. En `test` se validan migraciones, login, archivos y pagos con datos ficticios.
4. Se crea una etiqueta (`vX.Y.Z`) y PR a `production`.
5. Antes de migrar producción: backup verificable, revisión del diff de migración y plan de reversión.
6. Tras desplegar: health checks, login y carga de un archivo de prueba.

La RDS de test en AWS es una instancia adicional con coste. Hasta aprobar ese coste, el entorno `test` debe usar PostgreSQL efímero/local en CI; la base productiva no se reutiliza.


## Servidor de desarrollo en AWS

Instancia `occlus-dev` (t3.small, us-east-2, IP elástica `77.113.133.109`), separada de producción:

- Grupo de seguridad `occlus-dev` (solo 80/443): no está autorizado en la RDS de producción.
- Rol `occlus-dev-ec2-role` solo con Session Manager: no tiene acceso al bucket de producción.
- PostgreSQL y almacenamiento S3 (SeaweedFS) corren en el mismo servidor, con claves aleatorias en `/opt/occlus/.env.development`.
- Enlaces (sin DNS propio, vía sslip.io): aplicación `https://app-77-113-133-109.sslip.io`, sitio `https://sitio-77-113-133-109.sslip.io`.

Actualizar con la rama `development` (Session Manager → `occlus-dev`):

```sh
cd /opt/occlus && git pull
docker compose --env-file .env.development -f docker-compose.production.yml -f docker-compose.dev-server.yml up -d --build
```

El logo muestra «Desarrollo vX.Y» porque la imagen se construye con `OCCLUS_ENV=development`. Para test o producción, `OCCLUS_ENV` vale `test` o `production` (predeterminado) y el logo muestra solo `vX.Y`.
