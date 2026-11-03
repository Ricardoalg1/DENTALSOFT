#!/usr/bin/env bash
# Copia de seguridad de producción en este computador: base de datos cifrada (age) y archivos de S3.
# La base no es accesible desde internet: se abre un túnel por Session Manager a través del servidor
# y se reutiliza scripts/backup-postgres.sh (no escribe un dump sin cifrar).
#
# Uso: AGE_RECIPIENT=age1... bash scripts/respaldo-produccion.sh [carpeta-destino]
# Requisitos: aws (con sesión iniciada), session-manager-plugin, postgresql@17, age, nc.
set -euo pipefail
umask 077

REGION=us-east-2
INSTANCE=i-0b68bb11859fc4d75
BUCKET=occlus-archivos-540586745772
SECRET_ID=occlus/production/app-db
LOCAL_PORT=15432
DEST="${1:-$HOME/occlus-respaldos}"

for tool in aws session-manager-plugin age python3 nc; do
  command -v "$tool" >/dev/null || { echo "Falta la herramienta $tool (ver docs/plan-contingencia.md)." >&2; exit 1; }
done
pg_bin="$(brew --prefix postgresql@17 2>/dev/null || true)/bin"
[[ -x "$pg_bin/pg_dump" ]] || { echo 'Falta PostgreSQL 17: brew install postgresql@17' >&2; exit 1; }
export PATH="$pg_bin:$PATH"
: "${AGE_RECIPIENT:?Define AGE_RECIPIENT con tu clave pública age (age1...)}"
aws sts get-caller-identity >/dev/null 2>&1 || { echo 'La sesión de AWS venció: ejecuta aws login.' >&2; exit 1; }

mkdir -p "$DEST/base" "$DEST/archivos"
workdir="$(mktemp -d)"
tunnel_pid=""
cleanup() {
  [[ -n "$tunnel_pid" ]] && kill "$tunnel_pid" 2>/dev/null || true
  rm -rf "$workdir"
}
trap cleanup EXIT

# Credenciales del propietario de las tablas: con RLS, el rol restringido de la aplicación no ve todo.
aws secretsmanager get-secret-value --region "$REGION" --secret-id "$SECRET_ID" \
  --query SecretString --output text > "$workdir/secret.json"
field() { python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))[sys.argv[2]])' "$workdir/secret.json" "$1"; }
db_host="$(field host)"
db_port="$(field port)"
db_name="$(field dbname)"
db_user="$(field username)"
python3 - "$workdir/secret.json" "$workdir/pgpass" "$LOCAL_PORT" <<'PY'
import json, sys
s = json.load(open(sys.argv[1]))
esc = lambda v: str(v).replace('\\', '\\\\').replace(':', '\\:')
with open(sys.argv[2], 'w') as f:
    f.write(':'.join(['localhost', sys.argv[3], esc(s['dbname']), esc(s['username']), esc(s['password'])]) + '\n')
PY
chmod 600 "$workdir/pgpass"
rm -f "$workdir/secret.json"

echo "Abriendo túnel: localhost:$LOCAL_PORT → servidor → base de datos…"
aws ssm start-session --region "$REGION" --target "$INSTANCE" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "{\"host\":[\"$db_host\"],\"portNumber\":[\"$db_port\"],\"localPortNumber\":[\"$LOCAL_PORT\"]}" \
  > "$workdir/tunel.log" 2>&1 &
tunnel_pid=$!
for _ in $(seq 1 30); do nc -z localhost "$LOCAL_PORT" 2>/dev/null && break; sleep 1; done
nc -z localhost "$LOCAL_PORT" 2>/dev/null || { cat "$workdir/tunel.log" >&2; echo 'No se pudo abrir el túnel.' >&2; exit 1; }

echo "Copiando la base de datos (cifrada)…"
# El túnel termina en localhost: el certificado no coincide con ese nombre, pero la conexión sigue cifrada.
PGHOST=localhost PGPORT="$LOCAL_PORT" PGDATABASE="$db_name" PGUSER="$db_user" PGPASSFILE="$workdir/pgpass" \
  PGSSLMODE=require BACKUP_DIR="$DEST/base" bash "$(dirname "$0")/backup-postgres.sh"

echo "Copiando los archivos de S3…"
aws s3 sync "s3://$BUCKET" "$DEST/archivos" --region "$REGION" --only-show-errors

echo
echo "Copia terminada en $DEST"
du -sh "$DEST/base" "$DEST/archivos"
echo "Los archivos de S3 quedan sin cifrar en este disco: mantén FileVault activado."
