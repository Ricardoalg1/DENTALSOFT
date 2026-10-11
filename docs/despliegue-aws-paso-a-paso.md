# Despliegue en AWS, paso a paso

Guía para quien nunca ha usado AWS. Arquitectura inicial, simple y segura: **un servidor (EC2) con Docker** + **base de datos gestionada (RDS PostgreSQL)** + **bucket privado (S3)**. Escala después si hace falta (sección 12).

```
Internet ──443──► Caddy (HTTPS) ─► Nginx (límites) ─► Astro (sitio) / Next (app) / Spring (API)
                      EC2 (única puerta pública)              │            │
                                                     RDS PostgreSQL     S3 privado
                                                   (sin acceso público)  (vía rol IAM)
```

Los precios de AWS cambian y dependen de la región: usa la [calculadora de AWS](https://calculator.aws/) antes de crear nada. Un entorno de pruebas pequeño ronda unas decenas de dólares al mes.

---

## 0. Antes de empezar

- Correo propio para la cuenta (mejor uno de la empresa, no personal) y una tarjeta.
- Un gestor de contraseñas (Bitwarden, 1Password). Aquí guardarás secretos.
- **Región:** elige una y úsala siempre. `us-east-1` (Virginia) es la más barata; `sa-east-1` (São Paulo) tiene menor latencia para Colombia pero cuesta más. Ambas son válidas para la ley colombiana (ver la política de privacidad, sección 10). Esta guía usa `us-east-1`; si cambias, cambia también `STORAGE_REGION`.

## 1. Cuenta AWS segura

1. Crea la cuenta en aws.amazon.com.
2. **Activa MFA en el usuario raíz** (Cuenta → Credenciales de seguridad → MFA). Después no uses el usuario raíz para el día a día.
3. En **IAM → Usuarios**, crea un usuario administrador para ti, con MFA, y entra siempre con él.
4. En **Billing → Budgets**, crea un presupuesto mensual con alerta al correo (por ejemplo al 80 %). Evita sorpresas.

## 2. Red y grupos de seguridad (el "firewall")

Usaremos la VPC por defecto para no complicarte. Lo importante son los **grupos de seguridad** (EC2 → Security Groups → Create):

**`sg-occlus-app`** (el servidor)
| Entrada | Puerto | Origen |
|---|---|---|
| HTTP | 80 | 0.0.0.0/0 |
| HTTPS | 443 | 0.0.0.0/0 |
| (nada más) | | |

No abras el 22 (SSH). Para entrar al servidor usaremos **SSM Session Manager** (sección 6), sin puertos abiertos ni llaves.

**`sg-occlus-db`** (la base de datos)
| Entrada | Puerto | Origen |
|---|---|---|
| PostgreSQL | 5432 | **solo** el grupo `sg-occlus-app` (selecciona el grupo, no una IP) |

Esto es lo que garantiza que **la base de datos solo acepta conexiones de tu aplicación**.

## 3. Bucket S3 privado (archivos clínicos)

S3 → Create bucket:
- Nombre único, p. ej. `occlus-archivos-prod`; misma región.
- **Block all public access: activado** (las 4 casillas).
- **Bucket Versioning: Enable** (recuperas archivos borrados o sobrescritos).
- **Default encryption: SSE-S3** (activado por defecto).
- Después, en *Management → Lifecycle rules*: elimina versiones antiguas de objetos tras 90 días y limpia cargas incompletas tras 7.

## 4. Rol IAM para el servidor

El backend accede a S3 **sin llaves guardadas**: el servidor tiene un rol.

1. IAM → Policies → Create policy → JSON (cambia el nombre del bucket):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {"Effect": "Allow", "Action": ["s3:ListBucket", "s3:GetBucketLocation"], "Resource": "arn:aws:s3:::occlus-archivos-prod"},
    {"Effect": "Allow", "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], "Resource": "arn:aws:s3:::occlus-archivos-prod/*"}
  ]
}
```
Llámala `occlus-s3-archivos`.
2. IAM → Roles → Create role → "AWS service" → **EC2**. Adjunta `occlus-s3-archivos` y la política gestionada **`AmazonSSMManagedInstanceCore`** (para entrar por Session Manager). Nómbralo `occlus-ec2-role`.

## 5. Base de datos RDS

RDS → Create database:
- **Standard create**, motor **PostgreSQL 17**.
- Plantilla *Production* para algo serio, o *Dev/Test* para las primeras pruebas.
- Identificador `occlus-db`. Usuario maestro `occlus_admin` y una contraseña larga (guárdala en el gestor).
- Clase: `db.t4g.small` o `db.t4g.medium` para empezar. Almacenamiento gp3 de 20 GB con *autoscaling* activado.
- **Multi-AZ:** recomendado en producción real (réplica en otra zona; si una falla, AWS conmuta solo). Para pruebas puedes omitirlo.
- Conectividad: VPC por defecto, **Public access: No**, grupo de seguridad `sg-occlus-db`.
- **Backup:** retención automática de **14 a 35 días**, activa *copia de seguridad automatizada* (permite volver a cualquier minuto de ese periodo).
- **Encryption: Enabled**. **Deletion protection: Enabled**.
- Nombre de la base inicial: `occlus`.

Al terminar, copia el **Endpoint** (algo como `occlus-db.xxxx.us-east-1.rds.amazonaws.com`).

### Crear los dos roles de base de datos
Occlus usa **dos roles**: uno **propietario** (solo para migraciones) y uno **de aplicación**, restringido. El de aplicación **no puede saltarse** el aislamiento entre clínicas (RLS). Desde el servidor (sección 7) conéctate con el usuario maestro:

```sh
docker run --rm -it postgres:17 psql "host=ENDPOINT port=5432 dbname=occlus user=occlus_admin sslmode=require"
```

y ejecuta (usa contraseñas distintas, largas y aleatorias; no las de desarrollo):

```sql
create role occlus login password 'CONTRASEÑA_PROPIETARIO' nosuperuser nocreatedb nocreaterole;
create role occlus_app login password 'CONTRASEÑA_APP' nosuperuser nocreatedb nocreaterole nobypassrls;
grant occlus to occlus_admin;
alter database occlus owner to occlus;
grant all on schema public to occlus;
```
Verifica que `occlus_app` no tenga privilegios extra: `\du` debe mostrar que no es superusuario ni tiene `Bypass RLS`. Flyway otorga luego, en las migraciones, los permisos exactos al rol de aplicación.

## 6. El servidor EC2

EC2 → Launch instance:
- Imagen **Ubuntu 24.04 LTS**; tipo **t3.medium** (2 vCPU, 4 GB; Java necesita memoria); disco gp3 de 30 GB.
- Sin par de llaves (usarás SSM) o con una llave si prefieres, pero sin abrir el 22.
- Red: grupo `sg-occlus-app`. **IAM instance profile: `occlus-ec2-role`**.
- Advanced → *Metadata version*: **V2 only (required)** y **Metadata response hop limit: 2**. Sin el valor 2, los contenedores Docker no pueden obtener las credenciales del rol y S3 fallará.
- Una vez creada: EC2 → **Elastic IPs** → asignar una y asociarla a la instancia (así la IP no cambia).

Entrar: EC2 → la instancia → **Connect → Session Manager**.

Instala Docker y herramientas:
```sh
sudo apt-get update && sudo apt-get install -y ca-certificates curl git python3 unattended-upgrades
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker
sudo dpkg-reconfigure -plow unattended-upgrades   # parches de seguridad automáticos
```

## 7. Dominio en Namecheap

Namecheap → Domain List → Manage → **Advanced DNS**:
| Tipo | Host | Valor |
|---|---|---|
| A Record | `@` | tu IP elástica |
| A Record | `www` | tu IP elástica |
La propagación tarda de minutos a unas horas. Caddy obtendrá el certificado HTTPS solo cuando el dominio apunte al servidor.

> **Recomendado:** pon **Cloudflare** (plan gratuito) delante: cambias los *nameservers* del dominio a los de Cloudflare y activas el proxy (nube naranja). Te da protección contra ataques masivos (DDoS) y un firewall web básico sin costo. Con Cloudflare, usa SSL/TLS en modo **Full (strict)** y limita en el grupo de seguridad el 80/443 a las IP de Cloudflare si quieres cerrar del todo el acceso directo.

## 8. Instalar y lanzar Occlus

En el servidor:
```sh
git clone <URL-de-tu-repositorio> occlus && cd occlus
mkdir -p deploy/certs
curl -fsS https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem -o deploy/certs/global-bundle.pem
python3 scripts/prepare-deploy.py        # crea .env.production con secretos aleatorios
nano .env.production
```
Completa en `.env.production`:
- `PUBLIC_DOMAIN`, `TLS_EMAIL`, `SITE_CONTACT_EMAIL`, `SITE_OWNER_NIT`.
- `DB_URL=jdbc:postgresql://ENDPOINT:5432/occlus?sslmode=verify-full&sslrootcert=/app/certs/global-bundle.pem`
- `DB_USER=occlus_app` y su contraseña; `DB_MIGRATION_USER=occlus` y su contraseña.
- `STORAGE_BUCKET`, `STORAGE_REGION`.
- Plazo de conservación: `SITE_RETENTION_ENABLED`, `SITE_RETENTION_DAYS` y `SITE_RETENTION_PUBLIC_DAYS` con el mismo número (ver sección 11).

**Primer administrador de plataforma** (hay que crearlo una vez):
1. Pon temporalmente `SELF_REGISTRATION=true` en `.env.production` y lanza (paso siguiente).
2. Entra a `https://tu-dominio/registro` y crea la clínica "Occlus" con tu correo real.
3. Obtén tu UUID: `docker run --rm -it postgres:17 psql "host=ENDPOINT dbname=occlus user=occlus_admin sslmode=require" -c "select id,email from app_user"`.
4. Cambia `SELF_REGISTRATION=false`, pon el UUID en `OCCLUS_PLATFORM_ADMIN_IDS` y reinicia: `docker compose --env-file .env.production -f docker-compose.production.yml up -d`.

Lanzar:
```sh
python3 scripts/prepare-deploy.py --check
docker compose --env-file .env.production -f docker-compose.production.yml config --quiet
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
docker compose --env-file .env.production -f docker-compose.production.yml ps    # todos "healthy"
```

## 9. ¿La API queda restringida a la propia aplicación?

Sí, con estas capas:
1. **Spring Boot no publica puertos**: en el Compose solo Caddy expone el 80/443. El backend vive en una red interna de Docker; nadie en Internet puede llamarlo directamente.
2. **Nginx solo reenvía rutas conocidas** (sitio, app, `/bff`, y los webhooks de pago y WhatsApp). La API interna y Swagger **no** se exponen.
3. **El navegador nunca habla con el backend**: Next lo hace desde el servidor y guarda el token en una cookie `httpOnly`.
4. **Webhooks** (Wompi, ePayco, WhatsApp): públicos por necesidad, pero verifican firma criptográfica.
5. **RDS** solo acepta conexiones del grupo `sg-occlus-app`.
6. **Defensas contra abuso** (implementadas): límite de peticiones por IP en Nginx (general, login/registro, demo y chat), tope de conexiones simultáneas, cortes de conexiones lentas, bloqueo temporal tras 5 contraseñas erróneas por correo (en el backend) y cabeceras de seguridad (HSTS, anti-clickjacking) en Caddy.

## 10. Reintentos y resiliencia

- Las **operaciones que modifican datos no se reintentan solas** a propósito: si la respuesta no llegó, el cambio pudo guardarse y un reintento automático duplicaría cobros o registros. El usuario ve un mensaje claro y revisa.
- Las consultas tienen **tiempos máximos** (30 s en API, 60 s en BFF), y la conexión a la base de datos se rehace sola si se cae.
- Docker reinicia cada servicio (`restart: unless-stopped`) y espera a que el backend esté sano antes de arrancar el resto (*healthchecks*).
- Si el servidor entero cae, hay que recrearlo; por eso importan las copias (sección 11) y, a futuro, Multi-AZ y varias instancias.

## 11. Copias de seguridad y conservación

| Qué | Cómo | Dónde configurarlo |
|---|---|---|
| Base de datos | Copias automáticas con **recuperación a un instante** (14–35 días) | RDS (paso 5) |
| Snapshot manual antes de cada actualización importante | Crear snapshot | RDS → Snapshots |
| Archivos | **Versionado** de S3 + reglas de ciclo de vida | S3 (paso 3) |
| Configuración | Guarda `.env.production` cifrado en tu gestor de contraseñas; el código está en Git | Tú |
| Todo junto (opcional) | **AWS Backup**: plan diario con retención y copia a otra región | AWS Backup |

**Pruébalas:** una copia que nunca se ha restaurado no es una copia. Restaura un snapshot de RDS a una instancia nueva al menos una vez antes de lanzar y comprueba que los datos estén.

**Plazos de conservación (política de privacidad, sección 8):** hoy el plazo para solicitudes comerciales **no está definido** (`SITE_RETENTION_ENABLED=false`, `SITE_RETENTION_DAYS=0`): el sistema **no borra nada** hasta que lo actives. El backend acepta de 1 a 3650 días. Una referencia habitual es **730 días (24 meses)** desde la última actividad comercial, pero **debes decidirlo tú con tu asesor legal**. Si lo activas, usa el mismo número en `SITE_RETENTION_DAYS` y `SITE_RETENTION_PUBLIC_DAYS`. Las historias clínicas no entran en esta purga: las conserva la clínica, hoy 15 años por normativa de salud.

## 12. Balanceo de carga y crecimiento

Para las pruebas y los primeros clientes **no necesitas balanceador**: un servidor con Caddy ya termina HTTPS. Súmalo cuando necesites alta disponibilidad:
1. Un **Application Load Balancer (ALB)** con certificado de **ACM**, delante de 2 instancias EC2 en zonas distintas (Auto Scaling Group).
2. La app ya es *stateless* (JWT y sesiones revocables guardadas en la base de datos), así que puede correr en varias instancias.
3. **Antes de eso, ten en cuenta:** las tareas programadas (`SUBSCRIPTIONS_SCHEDULER`, retención) deben correr en **una sola** instancia, o se duplican; y el bloqueo por intentos de login es por instancia (el límite por IP de Nginx sí sigue). Conviene moverlo a un almacén compartido (Redis/ElastiCache).
4. **AWS WAF** sobre el ALB (o Cloudflare) para reglas contra inyecciones y bots.

## 13. Monitoreo y alertas

- **CloudWatch**: alarmas de CPU alta, memoria/disco del servidor y de RDS (almacenamiento libre, conexiones, CPU). Envíalas a un SNS con tu correo.
- **UptimeRobot** (gratis) consultando `https://tu-dominio/bff/health` y `/site-api/health`.
- Activa **GuardDuty** (detección de amenazas) y revisa los avisos de **AWS Trusted Advisor / Security Hub**.
- Revisa los logs: `docker compose ... logs --tail=200 backend`.

## 14. Lista antes de probar con usuarios

- [ ] MFA en la cuenta raíz y presupuesto con alerta.
- [ ] `sg-occlus-db` solo acepta desde `sg-occlus-app`; RDS sin acceso público.
- [ ] Roles de base `occlus` y `occlus_app` con contraseñas propias; `occlus_app` sin `bypassrls`.
- [ ] Bucket S3 con acceso público bloqueado y versionado.
- [ ] Instancia con rol IAM, IMDSv2 y *hop limit* 2.
- [ ] DNS apuntando y HTTPS válido (candado en el navegador).
- [ ] `docker compose ps` con todo *healthy*; `SELF_REGISTRATION=false`.
- [ ] Usuario de plataforma real, no el de pruebas; contraseña fuerte.
- [ ] Copias de RDS activas y **una restauración probada**.
- [ ] Política de privacidad y condiciones **revisadas por un abogado**; correo de atención de titulares funcionando.
- [ ] Probado: crear cliente, entrar, subir un archivo, enviar un aviso y ver la campanita.
- [ ] Pasarelas de pago, Dataico y WhatsApp **apagados** hasta probarlos uno por uno.
