# Plan de contingencia de Occlus

Qué hacer si se cae la aplicación, si se dañan los datos o si AWS deja de estar disponible: cómo sacar copias en tu
propio computador, cómo restaurarlas y cómo volver a poner Occlus en línea en pocos minutos.

> Complementa [guia-operacion-aws.md](guia-operacion-aws.md) (operación diaria). Los IDs y nombres de este
> documento son los reales de la cuenta `540586745772`, región `us-east-2`.

---

## 1. Resumen: qué puede fallar y cuánto tarda volver

| Qué pasó | Cómo se nota | Tiempo para volver | Sección |
|---|---|---|---|
| Un contenedor se colgó o Nginx quedó desactualizado | Error 502, pantalla en blanco | 1 a 3 min | 4.1 |
| Una versión nueva salió con errores | Falla justo después de desplegar | 2 min (con imágenes `:anterior`) · 8 min (recompilando) | 4.2 |
| El servidor no responde | Nada carga; Session Manager no conecta | 3 a 5 min (reinicio) | 4.3 |
| El servidor se perdió (disco dañado, borrado) | La instancia no arranca o no existe | 10 a 15 min **con imagen AMI** · 1 a 2 h sin ella | 4.4 |
| Datos borrados o dañados por error | Faltan pacientes, citas, etc. | 15 a 30 min (restaurar en AWS) | 5.1 y 5.2 |
| AWS no tiene copia utilizable | Las copias de AWS fallan o no existen | 1 a 3 h (desde tu copia local) | 5.3 |
| Archivos de S3 borrados | Faltan radiografías o PDF | Minutos | 5.4 |

**Lo más importante:** las copias que hace AWS (RDS y versiones de S3) son la primera línea. Tu copia local es la
segunda, para cuando AWS no sirve.

---

## 2. Preparación (hacer una vez, antes de necesitarla)

Un plan de contingencia solo funciona si esto ya está hecho el día del problema.

| # | Tarea | Estado al 2 nov 2026 |
|---|---|---|
| 1 | Guardar `.env.production` en tu gestor de contraseñas (sección 2.1) | Pendiente |
| 2 | Instalar las herramientas en tu Mac (sección 2.2) | Pendiente |
| 3 | Crear tu llave de cifrado `age` y guardarla en dos lugares (sección 2.3) | Pendiente |
| 4 | Subir las copias automáticas de RDS de 1 a 7 días (sección 2.4) | Pendiente |
| 5 | Crear una imagen AMI del servidor (sección 2.5) | Pendiente |
| 6 | Hacer la primera copia local y probar restaurarla (secciones 3 y 5.3) | Pendiente |
| 7 | Activar FileVault en tu Mac | Revisar |

### 2.1 Guardar la configuración del servidor

`.env.production` tiene las contraseñas, llaves de pasarelas y dominios. Sin él, un servidor nuevo no arranca.
Ábrelo y cópialo **completo** a una nota segura de tu gestor de contraseñas (1Password, Bitwarden, Llavero de iCloud):

```sh
aws ssm start-session --region us-east-2 --target i-0b68bb11859fc4d75
sudo cat /opt/occlus/.env.production
```

Repite cada vez que cambies una llave. **Nunca** lo guardes en un archivo de texto suelto, en un correo ni en Git.

### 2.2 Herramientas en tu Mac

```sh
brew install --cask session-manager-plugin   # túnel hacia la base de datos
brew install postgresql@17 age               # pg_dump de la misma versión que la base · cifrado
aws --version && session-manager-plugin --version && age --version
$(brew --prefix postgresql@17)/bin/pg_dump --version   # debe decir 17.x
```

### 2.3 Llave de cifrado de las copias

Las copias de la base tienen historias clínicas: se guardan **cifradas** con `age`. Se usan dos llaves: una pública,
que cifra, y una privada, que descifra.

```sh
mkdir -p ~/.occlus && chmod 700 ~/.occlus
age-keygen -o ~/.occlus/age-key.txt
chmod 600 ~/.occlus/age-key.txt
grep 'public key' ~/.occlus/age-key.txt      # copia la línea age1... (la pública)
```

- Guarda el contenido de `~/.occlus/age-key.txt` (la privada) en tu gestor de contraseñas **y** en un segundo lugar
  (por ejemplo, impreso en un sobre). **Si la pierdes, las copias no se pueden abrir nunca.**
- Agrega la pública a tu terminal para no escribirla cada vez:

```sh
echo 'export AGE_RECIPIENT=age1...tu-llave-publica...' >> ~/.zshrc && source ~/.zshrc
```

### 2.4 Copias automáticas de la base: 7 días

Hoy RDS guarda solo 1 día: un error descubierto dos días después no tiene vuelta atrás.

```sh
aws rds modify-db-instance --region us-east-2 --db-instance-identifier occlus-db \
  --backup-retention-period 7 --apply-immediately
```

### 2.5 Imagen AMI del servidor

Una AMI es una **foto completa del disco del servidor**: sistema, Docker, código, `.env.production`, certificados e
imágenes ya compiladas. Con ella se levanta un servidor idéntico en minutos. Cuesta poco (~$1.5/mes; las siguientes
solo guardan los cambios).

```sh
aws ec2 create-image --region us-east-2 --instance-id i-0b68bb11859fc4d75 --no-reboot \
  --name "occlus-app-$(date +%Y%m%d)" --description "Servidor Occlus después de v1.3.0"
# Devuelve un ImageId (ami-...). Tarda 5 a 15 min en quedar "available":
aws ec2 describe-images --region us-east-2 --owners self \
  --query 'Images[].[ImageId,Name,State,CreationDate]' --output table
```

Crea una nueva **después de cada versión publicada** y borra las de más de un mes:

```sh
aws ec2 deregister-image --region us-east-2 --image-id ami-viejo
# y su snapshot de disco (aparece en la descripción de la imagen):
aws ec2 describe-snapshots --region us-east-2 --owner-ids self \
  --query 'Snapshots[].[SnapshotId,StartTime,Description]' --output table
aws ec2 delete-snapshot --region us-east-2 --snapshot-id snap-viejo
```

---

## 3. Copia de seguridad en tu computador

**Frecuencia recomendada:** una vez por semana, y siempre antes de una versión grande.

### 3.1 Con el script (recomendado)

```sh
aws login
cd ~/DENTALSOFT
bash scripts/respaldo-produccion.sh                 # guarda en ~/occlus-respaldos
# o en un disco externo cifrado:
bash scripts/respaldo-produccion.sh /Volumes/RespaldoOcclus
```

Qué hace, paso a paso:

1. Lee de Secrets Manager el usuario dueño de las tablas (el rol de la aplicación no basta: con la seguridad por
   clínica no ve todas las filas).
2. Abre un **túnel** con Session Manager: tu Mac (`localhost:15432`) → el servidor → la base de datos. La base no
   tiene IP pública, así que es la única forma de llegar a ella desde afuera.
3. Ejecuta `scripts/backup-postgres.sh`, que hace `pg_dump` y lo **cifra al vuelo** con tu llave `age`. Nunca queda
   en disco una copia sin cifrar. Junto a la copia deja un archivo `.sha256` para detectar si se daña.
4. Descarga los archivos del bucket S3 con `aws s3 sync` (solo baja lo nuevo o cambiado).
5. Cierra el túnel y borra las credenciales temporales.

Resultado:

```text
~/occlus-respaldos/
├── base/
│   ├── occlus-20261102T150000Z-12345.dump.age       ← base de datos cifrada
│   └── occlus-20261102T150000Z-12345.dump.age.sha256
└── archivos/                                          ← copia del bucket (radiografías, PDF…)
```

### 3.2 Comprobar que la copia sirve

Una copia que no se puede abrir no es una copia. Verifica que descifra y que tiene tablas:

```sh
F=$(ls -t ~/occlus-respaldos/base/*.dump.age | head -1)
age --decrypt -i ~/.occlus/age-key.txt "$F" | $(brew --prefix postgresql@17)/bin/pg_restore --list | grep -c "TABLE DATA"
# Debe dar un número mayor que 50
```

La prueba completa (restaurar en tu base local) está en la sección 5.3; hazla al menos una vez.

### 3.3 Dónde guardarla

- Tu Mac con **FileVault activado** (Ajustes → Privacidad y seguridad → FileVault).
- Un **disco externo cifrado** (Utilidad de Discos → formato APFS cifrado), guardado fuera de la oficina.
- Conserva las últimas 4 semanales y una por mes; borra las demás.
- Son datos de salud (Ley 1581 de 2012): no los subas a Google Drive, Dropbox ni correos.

### 3.4 Sin el script (manual)

Si el script falla, estos son los mismos pasos a mano, en dos terminales:

```sh
# Terminal 1: el túnel (déjala abierta)
HOST=$(aws rds describe-db-instances --region us-east-2 --db-instance-identifier occlus-db \
  --query 'DBInstances[0].Endpoint.Address' --output text)
aws ssm start-session --region us-east-2 --target i-0b68bb11859fc4d75 \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "{\"host\":[\"$HOST\"],\"portNumber\":[\"5432\"],\"localPortNumber\":[\"15432\"]}"

# Terminal 2: usuario y contraseña del dueño de las tablas (campos username y password)
aws secretsmanager get-secret-value --region us-east-2 --secret-id occlus/production/app-db \
  --query SecretString --output text
$(brew --prefix postgresql@17)/bin/pg_dump -h localhost -p 15432 -U <username> -d occlus -Fc \
  | age -r "$AGE_RECIPIENT" > ~/occlus-respaldos/base/occlus-manual-$(date +%Y%m%d).dump.age
aws s3 sync s3://occlus-archivos-540586745772 ~/occlus-respaldos/archivos --region us-east-2
```

---

## 4. Si se cae la aplicación

Primero, **diagnóstico en 1 minuto** desde tu Mac:

```sh
curl -s -o /dev/null -w "app %{http_code}\n" https://occlusapp.com/ingresar
curl -s -o /dev/null -w "sitio %{http_code}\n" https://occlus.lat/
aws ec2 describe-instance-status --region us-east-2 --instance-ids i-0b68bb11859fc4d75 --include-all-instances \
  --query 'InstanceStatuses[0].[InstanceState.Name,SystemStatus.Status,InstanceStatus.Status]' --output text
aws rds describe-db-instances --region us-east-2 --db-instance-identifier occlus-db \
  --query 'DBInstances[0].DBInstanceStatus' --output text
```

| Resultado | Ve a |
|---|---|
| Servidor `running ok ok`, base `available`, pero la app da 502 o no carga | 4.1 |
| Pasó justo después de desplegar | 4.2 |
| Servidor `impaired` o Session Manager no conecta | 4.3 |
| El servidor no existe o no arranca después de 4.3 | 4.4 |
| Base distinta de `available` | 5.1 |
| Todo responde 200 pero un usuario dice que no le funciona | Su internet o su navegador; pídele probar en otra red |

En todos los pasos dentro del servidor:

```sh
aws ssm start-session --region us-east-2 --target i-0b68bb11859fc4d75
sudo -i
cd /opt/occlus
alias dc='docker compose --env-file .env.production -f docker-compose.production.yml'
```

### 4.1 Los contenedores fallan (1 a 3 min)

```sh
dc ps                                   # ¿alguno no está "Up" o no está "healthy"?
dc up -d                                # levanta lo que esté abajo, sin recompilar
dc restart edge                         # Nginx: resuelve el 502 tras reinicios
dc logs backend --tail 80               # si el backend sigue fallando, aquí dice por qué
free -m && df -h /                      # memoria y disco
```

- Disco lleno (más de 90 %): `docker image prune -f && docker builder prune -f`, luego `dc up -d`.
- Memoria agotada: `dc restart backend`; si se repite, considera pasar a t3.medium.
- El backend dice que no conecta a la base: ve a 5.1.

### 4.2 La versión nueva salió mala (2 min)

Si al desplegar guardaste las imágenes como `:anterior` (paso que ya incluye la guía de operación), vuelve atrás sin
compilar:

```sh
for s in backend frontend site; do docker tag occlus-$s:anterior occlus-$s:latest; done
dc up -d --no-build
dc restart edge
```

Si no existen las imágenes `:anterior`, vuelve al código anterior y recompila (~8 min):

```sh
git tag                                  # versiones publicadas
git checkout v1.3.0                      # la última que funcionaba
dc up -d --build && dc restart edge
```

Las migraciones de la base solo agregan tablas y columnas, así que la versión anterior funciona con la base nueva.
Después, corrige en GitHub y publica una versión nueva; el servidor vuelve a `main` con
`git checkout main && git pull origin main`.

### 4.3 El servidor no responde (3 a 5 min)

```sh
aws ec2 reboot-instances --region us-east-2 --instance-ids i-0b68bb11859fc4d75
sleep 120
curl -s -o /dev/null -w "%{http_code}\n" https://occlusapp.com/ingresar
```

Docker arranca solo con el servidor y los contenedores se levantan solos. Si a los 5 minutos sigue sin responder,
**apágalo y préndelo** (no es lo mismo que reiniciar: AWS lo mueve a otro hardware; la IP fija se conserva):

```sh
aws ec2 stop-instances --region us-east-2 --instance-ids i-0b68bb11859fc4d75
aws ec2 wait instance-stopped --region us-east-2 --instance-ids i-0b68bb11859fc4d75
aws ec2 start-instances --region us-east-2 --instance-ids i-0b68bb11859fc4d75
aws ec2 wait instance-running --region us-east-2 --instance-ids i-0b68bb11859fc4d75
```

Si después responde con 502, entra y ejecuta `dc restart edge`.

### 4.4 El servidor se perdió: levantar uno nuevo (10 a 15 min con AMI)

Requiere tener una AMI (sección 2.5).

```sh
# 1. La AMI más reciente
aws ec2 describe-images --region us-east-2 --owners self \
  --query 'sort_by(Images,&CreationDate)[-1].[ImageId,Name]' --output text

# 2. Si el servidor viejo existe, apágalo para que no compitan
aws ec2 stop-instances --region us-east-2 --instance-ids i-0b68bb11859fc4d75

# 3. Servidor nuevo, igual al anterior: misma subred, mismo grupo de seguridad y mismo rol
aws ec2 run-instances --region us-east-2 --image-id ami-XXXXXXXX --instance-type t3.small \
  --subnet-id subnet-012a2cf1c0a17963c --security-group-ids sg-074059daf2d9df12b \
  --iam-instance-profile Name=occlus-ec2-profile --metadata-options HttpTokens=required \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=occlus-app}]' \
  --query 'Instances[0].InstanceId' --output text
NUEVO=i-XXXXXXXX      # el ID que devolvió el comando anterior
aws ec2 wait instance-running --region us-east-2 --instance-ids $NUEVO

# 4. Pasarle la IP fija: los dominios vuelven a funcionar sin tocar Namecheap
aws ec2 associate-address --region us-east-2 --allocation-id eipalloc-092a27dd5a4c61368 \
  --instance-id $NUEVO --allow-reassociation

# 5. Verificar (2 a 3 min después)
curl -s -o /dev/null -w "%{http_code}\n" https://occlusapp.com/ingresar
```

Si da 502, entra al servidor nuevo y ejecuta `dc restart edge`. Si la AMI es anterior a la última versión, actualiza
el código como en la guía de operación (sección 4.5, paso 2). Cuando todo funcione, elimina el servidor viejo y
actualiza el ID en `guia-operacion-aws.md` y en este documento.

**Sin AMI:** hay que montar el servidor desde cero con [despliegue-aws-paso-a-paso.md](despliegue-aws-paso-a-paso.md),
secciones 6 a 8, usando el `.env.production` guardado en tu gestor de contraseñas. Toma 1 a 2 horas.

---

## 5. Restaurar datos

**Antes de restaurar, para y piensa:** restaurar devuelve la base a un momento del pasado. Todo lo registrado
después se pierde, salvo que lo recuperes a mano. Si el problema es pequeño (un paciente borrado), muchas veces es
mejor restaurar en una base **aparte**, copiar solo lo que falta y borrar la base aparte.

Ninguna restauración de RDS sobrescribe la base actual: siempre se crea una base **nueva** y luego se apunta la
aplicación a ella. Así la original queda intacta por si te equivocaste de momento.

### 5.1 A un minuto exacto del pasado (copias automáticas de RDS)

Sirve para "alguien borró algo hoy a las 3:10 p. m.": vuelves a las 3:05 p. m. Funciona dentro de los días de
retención (hoy 1; 7 tras la sección 2.4).

```sh
# Hasta cuándo se puede volver
aws rds describe-db-instances --region us-east-2 --db-instance-identifier occlus-db \
  --query 'DBInstances[0].LatestRestorableTime' --output text

# Crear la base restaurada. La hora va en UTC (Colombia + 5 horas): 3:05 p. m. → 20:05Z
aws rds restore-db-instance-to-point-in-time --region us-east-2 \
  --source-db-instance-identifier occlus-db --target-db-instance-identifier occlus-db-restaurada \
  --restore-time 2026-11-02T20:05:00Z \
  --db-instance-class db.t4g.micro --db-subnet-group-name occlus-db-subnets \
  --vpc-security-group-ids sg-04ef80f5099440483 --no-publicly-accessible
aws rds wait db-instance-available --region us-east-2 --db-instance-identifier occlus-db-restaurada   # 10 a 20 min
aws rds describe-db-instances --region us-east-2 --db-instance-identifier occlus-db-restaurada \
  --query 'DBInstances[0].Endpoint.Address' --output text
```

Luego apunta la aplicación a la base restaurada, en el servidor:

```sh
cp .env.production .env.production.antes-de-restaurar
nano .env.production       # en DB_URL cambia solo el nombre del host por el que devolvió el comando anterior
dc up -d backend && dc restart edge
dc logs backend --tail 50  # debe decir "Started OcclusBackendApplication"
```

Cuando confirmes que todo está bien: en la consola de RDS quita la protección contra borrado de `occlus-db` y
elimínala (o renómbrala), y activa la protección en la restaurada:

```sh
aws rds modify-db-instance --region us-east-2 --db-instance-identifier occlus-db-restaurada \
  --deletion-protection --backup-retention-period 7 --apply-immediately
```

Las contraseñas de la base son las mismas que la original, así que Secrets Manager no cambia (solo el campo `host`
del secreto `occlus/production/app-db`, si quieres que el script de respaldo apunte a la nueva).

### 5.2 Desde un snapshot manual

Igual que 5.1, pero partiendo de un snapshot (por ejemplo, el que se saca antes de cada versión):

```sh
aws rds describe-db-snapshots --region us-east-2 --db-instance-identifier occlus-db \
  --query 'DBSnapshots[].[DBSnapshotIdentifier,SnapshotCreateTime]' --output table
aws rds restore-db-instance-from-db-snapshot --region us-east-2 \
  --db-instance-identifier occlus-db-restaurada --db-snapshot-identifier <nombre> \
  --db-instance-class db.t4g.micro --db-subnet-group-name occlus-db-subnets \
  --vpc-security-group-ids sg-04ef80f5099440483 --no-publicly-accessible
aws rds wait db-instance-available --region us-east-2 --db-instance-identifier occlus-db-restaurada
```

Después, los mismos pasos de 5.1 para apuntar la aplicación.

### 5.3 Desde tu copia local

Cuando AWS no tiene una copia utilizable. Necesitas una base **vacía** con los mismos roles; `restore-postgres.sh`
se niega a escribir en una base que ya tenga tablas.

**Primero, practica en tu Mac** (hazlo una vez para confirmar que tus copias sirven):

```sh
# Base local vacía de prueba, con los roles que espera la copia
docker exec occlus-postgres psql -U occlus -c "create database occlus_prueba_restauracion"
aws secretsmanager get-secret-value --region us-east-2 --secret-id occlus/production/app-db \
  --query SecretString --output text      # anota username y app_username
docker exec occlus-postgres psql -U occlus -c "create role <username> nologin" -c "create role <app_username> nologin"

# Restaurar la copia más reciente
echo "localhost:5433:occlus_prueba_restauracion:occlus:occlus" > ~/.occlus/pgpass-local   # credenciales de docker-compose.yml
chmod 600 ~/.occlus/pgpass-local
F=$(ls -t ~/occlus-respaldos/base/*.dump.age | head -1)
PATH="$(brew --prefix postgresql@17)/bin:$PATH" PGHOST=localhost PGPORT=5433 PGUSER=occlus \
  PGDATABASE=occlus_prueba_restauracion PGPASSFILE=~/.occlus/pgpass-local PGSSLMODE=disable \
  AGE_IDENTITY_FILE=~/.occlus/age-key.txt \
  bash scripts/restore-postgres.sh "$F" --confirm-empty-database occlus_prueba_restauracion

# Revisar y borrar la prueba
docker exec occlus-postgres psql -U occlus -d occlus_prueba_restauracion -c "select count(*) from patient"
docker exec occlus-postgres psql -U occlus -c "drop database occlus_prueba_restauracion"
```

**En AWS, de verdad:**

1. Crea una base RDS nueva y vacía con los roles, siguiendo
   [despliegue-aws-paso-a-paso.md](despliegue-aws-paso-a-paso.md), sección 5 ("Crear los dos roles de base de
   datos"). Usa las contraseñas de `occlus/production/app-db`.
2. Abre el túnel hacia la base nueva (sección 3.4, terminal 1, con el host nuevo).
3. Restaura con el dueño de las tablas:

   ```sh
   PATH="$(brew --prefix postgresql@17)/bin:$PATH" PGHOST=localhost PGPORT=15432 PGUSER=<username> \
     PGDATABASE=occlus PGPASSFILE=<archivo-pgpass> PGSSLMODE=require AGE_IDENTITY_FILE=~/.occlus/age-key.txt \
     bash scripts/restore-postgres.sh <copia>.dump.age --confirm-empty-database occlus
   ```

4. Apunta la aplicación a la base nueva (pasos finales de 5.1).

### 5.4 Archivos de S3

El bucket tiene **versionado**: un archivo borrado o sobrescrito conserva sus versiones anteriores.

```sh
# Ver versiones y marcas de borrado de un archivo
aws s3api list-object-versions --bucket occlus-archivos-540586745772 --prefix <ruta/del/archivo> --region us-east-2

# Recuperar un archivo borrado: elimina su "marca de borrado" (DeleteMarker) usando su VersionId
aws s3api delete-object --bucket occlus-archivos-540586745772 --key <ruta/del/archivo> \
  --version-id <VersionId-de-la-marca> --region us-east-2
```

Desde tu copia local (si el bucket se perdió):

```sh
aws s3 sync ~/occlus-respaldos/archivos s3://occlus-archivos-540586745772 --region us-east-2
```

---

## 6. Después de cualquier incidente

1. Confirma que la app funciona: entra, abre un paciente, abre un archivo, agenda una cita de prueba y bórrala.
2. Saca una copia nueva (sección 3) y una AMI nueva (sección 2.5).
3. Anota qué pasó, a qué hora, qué hiciste y cuánto tardó. Si se perdieron datos de pacientes o hubo acceso
   indebido, la Ley 1581 obliga a informar a la Superintendencia de Industria y Comercio y a los titulares
   afectados; consulta con tu abogado.
4. Si fue un problema repetido, revisa la sección 7.

---

## 7. Mejoras que reducen el riesgo

| Mejora | Qué evita | Costo aprox. |
|---|---|---|
| Copias de RDS a 7 días (2.4) | Perder lo que se descubre tarde | Centavos |
| AMI después de cada versión (2.5) | Pasar 2 horas montando un servidor | ~$1.5/mes |
| Alarma de CloudWatch "servidor caído" con aviso por correo | Enterarte por una clínica | ~$0.10/mes |
| Multi-AZ en RDS | Base caída si falla la zona us-east-2a | +$13/mes |
| Servidor t3.medium | Caídas por memoria al compilar | +$15/mes |
| Copia local semanal (sección 3), guardada fuera de la oficina | Perderlo todo si se compromete la cuenta de AWS | $0 |
