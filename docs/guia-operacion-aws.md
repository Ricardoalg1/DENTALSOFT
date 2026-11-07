# Guía de operación de Occlus en AWS

Manual para administrar Occlus sin ayuda: entrar a los servidores, desplegar versiones, sacar copias de la base de
datos, revisar errores, encender o apagar el servidor de desarrollo y vigilar los costos. Cada comando está probado
en esta cuenta y explica qué hace.

> La instalación desde cero (crear la red, la base de datos, el servidor) está en
> [despliegue-aws-paso-a-paso.md](despliegue-aws-paso-a-paso.md). El flujo de ramas está en
> [flujo-ramas-entornos.md](flujo-ramas-entornos.md). Esta guía es para el día a día.

**Nunca pegues contraseñas, llaves privadas ni el contenido de `.env.production` en chats, tickets o commits.**

---

## 1. Mapa de lo que hay en AWS

Cuenta `540586745772`, región **us-east-2 (Ohio)**. Todo se crea en esa región.

| Recurso | Nombre / ID | Para qué |
|---|---|---|
| Servidor de producción | EC2 `occlus-app` · `i-0b68bb11859fc4d75` · t3.small · IP fija `52.14.213.99` | Corre la app, el sitio, Nginx y Caddy en Docker |
| Base de datos | RDS `occlus-db` · PostgreSQL 17 · db.t4g.micro · 20 GB | Datos de producción (privada, solo la ve el servidor de producción) |
| Archivos | S3 `occlus-archivos-540586745772` | Archivos clínicos de producción (privado) |
| Secretos | Secrets Manager `occlus/production/*` | Contraseñas de la base y de WhatsApp |
| Dominios | Registrados en Namecheap (no Route 53) | `occlus.lat` (sitio y reservas): DNS en Namecheap, directo a `52.14.213.99`. `occlusapp.com` (app): DNS en Cloudflare, con proxy hacia `52.14.213.99`; sus registros se editan en Cloudflare |

El servidor de desarrollo en AWS (`occlus-dev`) **se eliminó el 2 de noviembre de 2026** para ahorrar costos. Se
desarrolla y prueba en tu equipo local; si algún día se necesita otra vez, la sección 7 dice cómo recrearlo.

En el servidor, el proyecto está en `/opt/occlus`, en la rama `main`, con la configuración en `.env.production`.
Los comandos de Docker son `docker compose --env-file .env.production -f docker-compose.production.yml …`.

Contenedores:

| Contenedor | Qué es |
|---|---|
| `caddy` | Recibe el tráfico de internet y saca los certificados HTTPS |
| `edge` | Nginx: decide qué va a la app, al sitio o a los webhooks |
| `frontend` | La aplicación (Next.js) |
| `backend` | El API (Spring Boot); aplica las migraciones de la base al arrancar |
| `site` | El sitio público (Astro) |

---

## 2. Preparar tu equipo

### 2.1 Iniciar sesión en AWS

La sesión vence cada cierto tiempo. Cuando un comando diga `Your session has expired`, repite esto:

```sh
aws login
```

Comprueba que quedaste en la cuenta correcta:

```sh
aws sts get-caller-identity --query Account --output text
# Debe decir 540586745772
```

Para no escribir la región en cada comando (opcional):

```sh
aws configure set region us-east-2
```

En esta guía todos los comandos llevan `--region us-east-2` explícito, así funcionan aunque no hagas lo anterior.

### 2.2 Plugin de Session Manager (para entrar a los servidores desde tu terminal)

```sh
brew install --cask session-manager-plugin
session-manager-plugin --version
```

### 2.3 GitHub CLI (para los pull requests y etiquetas)

```sh
brew install gh
gh auth login
gh auth status
```

---

## 3. Entrar a un servidor

Los servidores **no tienen SSH abierto**: se entra con AWS Systems Manager (SSM). Hay tres formas.

### Opción A: desde la consola web (la más fácil)

AWS Console → EC2 → Instances → selecciona `occlus-app` → **Connect** → pestaña **Session Manager** → **Connect**.
Se abre una terminal en el navegador. Ve a la carpeta del proyecto:

```sh
sudo -i
cd /opt/occlus
```

### Opción B: terminal interactiva desde tu Mac

```sh
# Producción
aws ssm start-session --region us-east-2 --target i-0b68bb11859fc4d75
```

Ya dentro: `sudo -i` y `cd /opt/occlus`. Para salir: `exit` (dos veces).

### Opción C: ejecutar un comando sin entrar (lo que uso yo)

Útil para scripts. Envía el comando, espera y muestra la salida:

```sh
INSTANCE=i-0b68bb11859fc4d75   # producción

ID=$(aws ssm send-command --region us-east-2 --instance-ids $INSTANCE \
  --document-name AWS-RunShellScript \
  --parameters 'commands=["cd /opt/occlus && git log -1 --oneline && docker ps"]' \
  --query Command.CommandId --output text)

sleep 5
aws ssm get-command-invocation --region us-east-2 --command-id $ID --instance-id $INSTANCE \
  --query '[Status,StandardOutputContent,StandardErrorContent]' --output text
```

Si dice `InProgress`, espera unos segundos y repite el último comando. Los comandos por esta vía corren como `root`.

Script reutilizable (guárdalo como `~/ssm.sh` y dale `chmod +x ~/ssm.sh`):

```sh
#!/bin/sh
# Uso: INSTANCE=i-... ~/ssm.sh 'comandos'
set -e
INSTANCE=${INSTANCE:-i-0b68bb11859fc4d75}
PARAMS=$(python3 -c 'import json,sys; print(json.dumps({"commands":[sys.argv[1]],"executionTimeout":["3000"]}))' "$1")
ID=$(aws ssm send-command --region us-east-2 --instance-ids "$INSTANCE" --document-name AWS-RunShellScript \
  --parameters "$PARAMS" --timeout-seconds 600 --query Command.CommandId --output text)
while :; do
  S=$(aws ssm get-command-invocation --region us-east-2 --command-id "$ID" --instance-id "$INSTANCE" --query Status --output text 2>/dev/null || echo Pending)
  case "$S" in Pending|InProgress|Delayed) sleep 5 ;; *) break ;; esac
done
aws ssm get-command-invocation --region us-east-2 --command-id "$ID" --instance-id "$INSTANCE" \
  --query '[Status,StandardOutputContent,StandardErrorContent]' --output text
```

Ejemplo: `~/ssm.sh 'cd /opt/occlus && docker ps'`.

---

## 4. Publicar una versión nueva

### 4.1 Antes: pruebas en tu equipo

```sh
# Backend (desde la carpeta backend). Detén antes tu backend local (spring-boot:run).
./mvnw test

# Frontend (desde la carpeta frontend)
npx tsc --noEmit -p .
npx eslint src
```

Agrega la versión nueva arriba de todo en `frontend/src/lib/versions.ts` (es la que muestra el logo).

### 4.2 Subir a `development`

```sh
git checkout development
git add <archivos>
git commit -m "Feature: …"
git push origin development
```

### 4.4 Promover en GitHub: development → test → production → main

Desde tu Mac, en la carpeta del proyecto:

```sh
gh pr create --base test --head development --title "Release vX.Y: development → test" --body "Qué cambia…"
gh pr merge <número> --merge

gh pr create --base production --head test --title "Release vX.Y.0: test → production" --body "Publicación vX.Y.0"
gh pr merge <número> --merge

# El servidor de producción usa la rama main
gh pr create --base main --head production --title "Release vX.Y.0: production → main" --body "Publicación vX.Y.0"
gh pr merge <número> --merge

# Etiqueta de versión
git fetch origin
git tag -a vX.Y.0 origin/main -m "Occlus vX.Y.0: resumen"
git push origin vX.Y.0
```

Ver el estado de las ramas: `git fetch origin && git log --oneline -3 origin/main`.

### 4.5 Desplegar en producción

**Paso 1, siempre: copia de la base de datos** (desde tu Mac):

```sh
SNAP=occlus-db-antes-vX-Y-0-$(date +%Y%m%d%H%M)
aws rds create-db-snapshot --region us-east-2 --db-instance-identifier occlus-db --db-snapshot-identifier $SNAP
aws rds wait db-snapshot-available --region us-east-2 --db-snapshot-identifier $SNAP   # tarda 2 a 5 min
echo "Snapshot listo: $SNAP"
```

**Paso 2: actualizar y compilar** (dentro de `occlus-app`, `sudo -i`, `cd /opt/occlus`):

```sh
git status --short          # debe estar vacío; si hay cambios hechos a mano, ver abajo
git pull origin main
git log -1 --oneline        # confirma que quedó en el commit esperado
# Guarda las imágenes que funcionan hoy, para poder volver en 2 minutos (ver plan-contingencia.md)
for s in backend frontend site; do docker tag occlus-$s:latest occlus-$s:anterior; done
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
```

- La app sigue funcionando mientras compila. La interrupción es de 1 a 2 minutos, cuando se reemplazan los
  contenedores.
- Si `git status` muestra archivos modificados a mano, guárdalos sin perderlos con
  `git stash push -m "cambios a mano antes de vX.Y"` y luego haz el `git pull`. Verlos después:
  `git stash list` y `git stash show -p stash@{0}`.
- Si el servidor se queda sin memoria al compilar (2 GB), hazlo en horario de poco uso.

**Paso 3: reiniciar Nginx (obligatorio)**. Si no, el sitio y los webhooks dan **error 502**:

```sh
docker compose --env-file .env.production -f docker-compose.production.yml restart edge
```

**Paso 4: verificar**:

```sh
# En el servidor: todos "Up" y los que tienen chequeo, "(healthy)"
docker compose --env-file .env.production -f docker-compose.production.yml ps

# Migraciones aplicadas y arranque del backend
docker compose --env-file .env.production -f docker-compose.production.yml logs backend --since 15m \
  | grep -E "Migrating|Successfully applied|Started Occlus|ERROR"
```

Desde tu Mac:

```sh
curl -s -o /dev/null -w "%{http_code}\n" https://occlusapp.com/ingresar   # 200
curl -s -o /dev/null -w "%{http_code}\n" https://occlus.lat/              # 200
curl -s https://occlusapp.com/ingresar | grep -oE 'v[0-9]+\.[0-9]+' | head -1   # versión publicada
```

Por último entra con tu usuario y revisa a mano lo que cambió.

> Desde internet, `https://occlusapp.com/api/...` responde 404 a propósito: Nginx solo publica los webhooks
> (`/api/webhooks/...`). La app habla con el backend por dentro.

### 4.6 Si algo sale mal: volver a la versión anterior

El código se devuelve fácil. Las migraciones de Occlus solo **agregan** tablas y columnas, así que la versión
anterior funciona con la base nueva. En `occlus-app`:

```sh
cd /opt/occlus
git log --oneline -5                 # o: git tag  (para ver versiones)
git checkout v1.3.0                  # la etiqueta o commit anterior que funcionaba
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
docker compose --env-file .env.production -f docker-compose.production.yml restart edge
```

Cuando esté arreglado en GitHub, vuelve a la rama: `git checkout main && git pull origin main`.

**Restaurar la base desde un snapshot** solo si se dañaron datos. RDS no sobrescribe: crea una base **nueva** y
después hay que apuntar `DB_URL` de `.env.production` a ella. Todo lo escrito después del snapshot se pierde.

```sh
aws rds describe-db-snapshots --region us-east-2 --db-instance-identifier occlus-db \
  --query 'DBSnapshots[].[DBSnapshotIdentifier,SnapshotCreateTime,Status]' --output table

aws rds restore-db-instance-from-db-snapshot --region us-east-2 \
  --db-instance-identifier occlus-db-restaurada \
  --db-snapshot-identifier <nombre-del-snapshot> \
  --db-instance-class db.t4g.micro
# Luego: misma subred y grupo de seguridad que occlus-db (consola RDS → Modify), y cambiar DB_URL.
```

---

## 5. Configuración (`.env`) y pasarelas de pago

Las llaves viven solo en el servidor, en `.env.production` (producción) o `.env.development` (desarrollo). Para
editarlas, dentro del servidor:

```sh
cd /opt/occlus
cp .env.production .env.production.bak     # copia de seguridad antes de tocar
nano .env.production                       # Ctrl+O guarda, Ctrl+X sale
chmod 600 .env.production
```

Un cambio en `.env` **no necesita compilar**: basta recrear el contenedor que lo usa.

```sh
docker compose --env-file .env.production -f docker-compose.production.yml up -d backend
docker compose --env-file .env.production -f docker-compose.production.yml restart edge
docker compose --env-file .env.production -f docker-compose.production.yml logs backend --tail 80
```

Si una llave está mal o no corresponde al ambiente, el backend **no arranca** a propósito y el log dice cuál.

### Wompi

```sh
WOMPI_ENABLED=true
WOMPI_ENVIRONMENT=production          # sandbox en desarrollo
WOMPI_PUBLIC_KEY=pub_prod_...         # pub_test_ en sandbox
WOMPI_PRIVATE_KEY=prv_prod_...        # prv_test_ en sandbox
WOMPI_EVENTS_SECRET=prod_events_...
WOMPI_INTEGRITY_SECRET=prod_integrity_...
```

En el panel de Wompi (Desarrollo → Programadores), **en el mismo modo que las llaves** (producción o pruebas),
URL de eventos: `https://occlusapp.com/api/webhooks/wompi`.

Comprobar que la llave pública existe y está activa (sandbox: `sandbox.wompi.co`, producción: `production.wompi.co`):

```sh
curl -s https://production.wompi.co/v1/merchants/pub_prod_XXXX | python3 -m json.tool | head -20
```

### ePayco

```sh
EPAYCO_ENABLED=true
EPAYCO_CUSTOMER_ID=...
EPAYCO_PUBLIC_KEY=...
EPAYCO_P_KEY=...
EPAYCO_TEST=false
```

URL de confirmación (POST): `https://occlusapp.com/api/webhooks/epayco`.

### Mercado Pago

```sh
MERCADOPAGO_ENABLED=true
MERCADOPAGO_ACCESS_TOKEN=APP_USR-...  # TEST-... en pruebas
MERCADOPAGO_WEBHOOK_SECRET=...
```

Webhook: `https://occlusapp.com/api/webhooks/mercadopago`, evento **Pagos**.

### Comprobar un webhook

```sh
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H 'Content-Type: application/json' -d '{}' \
  https://occlusapp.com/api/webhooks/wompi
# 404 = pasarela apagada · 401 = encendida (rechaza un aviso sin firma, correcto) · 502 = reinicia edge
```

---

## 6. Diagnóstico: cuando algo no funciona

Dentro del servidor, en `/opt/occlus`. Para no repetir el comando largo, define un alias en la sesión:

```sh
alias dc='docker compose --env-file .env.production -f docker-compose.production.yml'
```

| Para… | Comando |
|---|---|
| Ver estado de los contenedores | `dc ps` |
| Últimas líneas del backend | `dc logs backend --tail 100` |
| Seguir el log en vivo (Ctrl+C sale) | `dc logs -f backend` |
| Solo errores de la última hora | `dc logs backend --since 1h \| grep -E "ERROR\|Exception"` |
| Errores de Nginx | `dc logs edge --since 30m \| grep error` |
| Errores de HTTPS/certificados | `dc logs caddy --since 1h \| grep -i error` |
| Reiniciar un contenedor | `dc restart backend` (o `frontend`, `site`, `edge`) |
| Memoria del servidor | `free -m` |
| Disco del servidor | `df -h /` |
| Memoria/CPU por contenedor | `docker stats --no-stream` |
| Versión desplegada | `git log -1 --oneline` |

### Problemas conocidos

| Síntoma | Causa | Solución |
|---|---|---|
| Error **502** en el sitio o en `/api/webhooks` tras desplegar | Nginx guarda las IP viejas de los contenedores recreados | `dc restart edge` |
| El backend se reinicia en bucle; log con `Migration checksum mismatch` | Se editó una migración ya aplicada | Nunca editar una `V<n>__*.sql` aplicada; crear una nueva. Ver 8.2 |
| El backend no arranca; log con `Wompi activado: faltan llaves` o `no corresponden al ambiente` | `.env` incompleto o llaves de test con `production` | Corregir `.env` y `dc up -d backend` |
| La compilación se corta o el servidor se congela | Memoria agotada (2 GB) | Esperar, `dc up -d --build` de nuevo en horario de poco uso |
| Disco lleno (`df -h /` > 85 %) | Imágenes viejas de Docker | `docker image prune -f` y `docker builder prune -f` |
| `Access Denied` de repente en todo AWS | Límite de gasto alcanzado o créditos agotados | AWS Settings → Billing |
| El comando de AWS dice `session has expired` | Sesión vencida | `aws login` |

---

## 7. Servidor de desarrollo (eliminado)

`occlus-dev` se eliminó el 2 de noviembre de 2026 junto con su IP fija (`77.113.133.109`), su disco, su grupo de
seguridad y su rol IAM. Los enlaces `*.sslip.io` ya no funcionan. El costo de desarrollo en AWS es $0.

Si algún día hace falta otra vez un entorno de pruebas en AWS, se recrea con:

1. Una EC2 t3.small con Ubuntu en `us-east-2`, con un rol que solo tenga `AmazonSSMManagedInstanceCore` (sin
   acceso a la base ni al bucket de producción) y un grupo de seguridad con los puertos 80 y 443 abiertos.
2. Una IP fija (Elastic IP) asociada.
3. Docker instalado, el repositorio clonado en `/opt/occlus` en la rama `development` y un `.env.development` con
   datos ficticios.
4. `docker compose --env-file .env.development -f docker-compose.production.yml -f docker-compose.dev-server.yml up -d --build`.
   Ese segundo archivo le da su propia base PostgreSQL y su propio almacenamiento, así nunca toca producción.

Ver el estado de los servidores que existen:

```sh
aws ec2 describe-instances --region us-east-2 \
  --query 'Reservations[].Instances[].[Tags[?Key==`Name`]|[0].Value,InstanceId,State.Name,PublicIpAddress]' \
  --output table
```

**Nunca apagues ni elimines `occlus-app` (i-0b68bb11859fc4d75)** ni liberes la IP `eipalloc-092a27dd5a4c61368`:
es producción y los dominios apuntan a ella.

---

## 8. Base de datos

### 8.1 Copias de seguridad

RDS hace copias automáticas (hoy se guardan **1 día**). Antes de cada despliegue se saca un snapshot manual
(sección 4.5), que se conserva hasta que lo borres.

```sh
# Ver snapshots manuales
aws rds describe-db-snapshots --region us-east-2 --db-instance-identifier occlus-db --snapshot-type manual \
  --query 'DBSnapshots[].[DBSnapshotIdentifier,SnapshotCreateTime,AllocatedStorage]' --output table

# Borrar un snapshot viejo (cuesta almacenamiento; deja al menos los dos últimos)
aws rds delete-db-snapshot --region us-east-2 --db-snapshot-identifier <nombre>

# Guardar las copias automáticas 7 días en vez de 1 (recomendado; puede tener costo de almacenamiento)
aws rds modify-db-instance --region us-east-2 --db-instance-identifier occlus-db \
  --backup-retention-period 7 --apply-immediately

# Estado de la base
aws rds describe-db-instances --region us-east-2 --db-instance-identifier occlus-db \
  --query 'DBInstances[0].[DBInstanceStatus,DBInstanceClass,AllocatedStorage,BackupRetentionPeriod,DeletionProtection]' \
  --output table
```

La base de producción es privada: no se conecta desde tu Mac. Las migraciones las aplica el backend al arrancar.

### 8.2 Tu base local (en tu Mac)

```sh
# Base y archivos locales
docker ps --format '{{.Names}} {{.Status}}'          # occlus-postgres y occlus-storage

# Arrancar el backend local
cd backend && ./mvnw spring-boot:run

# Consola SQL de la base local
docker exec -it occlus-postgres psql -U occlus -d occlus

# Qué migraciones tiene aplicadas
docker exec occlus-postgres psql -U occlus -d occlus -c \
  "select version, description, success from flyway_schema_history order by installed_rank desc limit 5"
```

Si el backend local no arranca con `Migration checksum mismatch` o `description mismatch` es porque la base tiene
un borrador viejo de una migración. Lo seguro es igualar el esquema al archivo actual y luego actualizar el
registro de Flyway (`checksum`, `description` y `script`) en una sola transacción. Hazlo solo en tu base local,
nunca en producción, y si dudas, pide ayuda antes.

---

## 9. Costos

### 9.1 Plan y créditos

```sh
aws freetier get-account-plan-state --region us-east-1
```

Muestra el plan (`FREE` o `PAID`), los **créditos que quedan** y la fecha en que vence el plan gratuito.

Al 2 de noviembre de 2026: plan **FREE**, **$113.84** en créditos, vence el **16 de abril de 2027**. Con solo
producción se gastan unos **$1.30/día (~$40/mes)**, así que los créditos alcanzan hasta **finales de enero de 2027**.
**Antes de eso hay que pasar al plan pago** en AWS Settings → Billing, o AWS puede suspender la cuenta y
producción se cae. Ahí mismo se puede poner un **límite de gasto** (si se alcanza, el proyecto se pausa).

### 9.2 Cuánto se gasta y en qué

Los créditos se descuentan automáticamente, así que el costo "normal" sale en $0. Para ver el **uso real**, se
filtran los créditos:

```sh
# Gasto del mes por servicio (cambia las fechas; End es el día siguiente al último)
aws ce get-cost-and-usage --region us-east-1 \
  --time-period Start=2026-11-01,End=2026-12-01 --granularity MONTHLY --metrics UnblendedCost \
  --filter '{"Not":{"Dimensions":{"Key":"RECORD_TYPE","Values":["Credit","Refund"]}}}' \
  --group-by Type=DIMENSION,Key=SERVICE \
  --query 'ResultsByTime[0].Groups[].[Keys[0],Metrics.UnblendedCost.Amount]' --output table

# Gasto por día (para ver si algo se disparó)
aws ce get-cost-and-usage --region us-east-1 \
  --time-period Start=2026-11-01,End=2026-11-08 --granularity DAILY --metrics UnblendedCost \
  --filter '{"Not":{"Dimensions":{"Key":"RECORD_TYPE","Values":["Credit","Refund"]}}}' \
  --query 'ResultsByTime[].[TimePeriod.Start,Total.UnblendedCost.Amount]' --output table
```

Octubre de 2026 (referencia): EC2 $12.69 · RDS $7.02 · IPs públicas $3.05 · discos $1.97 · Secrets Manager $0.74 ·
**total $25.48**, todo cubierto por créditos.

| Qué cobra | Aprox. | Cómo bajarlo |
|---|---|---|
| Servidor de producción t3.small | ~$15/mes | Necesario |
| RDS db.t4g.micro + 20 GB | ~$13/mes | Necesario |
| IP pública fija de producción | ~$3.6/mes | Necesaria |
| Disco del servidor (30 GB) | ~$2.4/mes | — |
| Secrets Manager (4 secretos) | ~$1.6/mes | — |
| Snapshots manuales de RDS | centavos por GB | Borrar los viejos (sección 8.1) |

En la consola web: **Billing and Cost Management → Cost Explorer** muestra lo mismo con gráficas, y
**Budgets** permite crear una alerta por correo cuando el gasto pase de un monto.

---

## 10. Lista rápida

| Quiero… | Sección |
|---|---|
| Entrar a un servidor | 3 |
| Publicar una versión en producción | 4.4 y 4.5 |
| Volver a la versión anterior | 4.6 |
| Poner llaves de una pasarela | 5 |
| Saber por qué algo falla | 6 |
| Servidor de desarrollo (eliminado) | 7 |
| Sacar o restaurar una copia de la base | 4.5, 4.6 y 8.1 |
| Ver cuánto se está gastando | 9 |
