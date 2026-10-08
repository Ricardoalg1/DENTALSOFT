#!/usr/bin/env bash
# Restaura únicamente en una base existente y vacía. No crea ni borra bases.
set -euo pipefail
umask 077
if [[ $# -ne 3 || "$2" != '--confirm-empty-database' ]]; then
  echo 'Uso: bash scripts/restore-postgres.sh ARCHIVO.dump.age --confirm-empty-database NOMBRE_BASE_DESTINO' >&2
  exit 1
fi
for tool in pg_restore psql age python3; do
  command -v "$tool" >/dev/null || { echo "Falta la herramienta $tool." >&2; exit 1; }
done
: "${PGHOST:?Define PGHOST del destino}"
: "${PGDATABASE:?Define PGDATABASE del destino}"
: "${PGUSER:?Define PGUSER con permisos para restaurar}"
: "${PGPASSFILE:?Define PGPASSFILE privado}"
: "${AGE_IDENTITY_FILE:?Define el archivo de identidad privado age}"
[[ "$PGDATABASE" =~ ^[A-Za-z_][A-Za-z0-9_-]{0,62}$ ]] || { echo 'Nombre de base inválido.' >&2; exit 1; }
[[ "$3" == "$PGDATABASE" ]] || { echo 'La confirmación no coincide con PGDATABASE.' >&2; exit 1; }
occlus_restore_file="$1"
python3 - "$occlus_restore_file" <<'PY'
import hashlib, os, stat, sys
from pathlib import Path
for key in ('PGPASSFILE', 'AGE_IDENTITY_FILE'):
    path = Path(os.environ[key])
    if not path.is_file() or stat.S_IMODE(path.stat().st_mode) & 0o077:
        raise SystemExit(key + ' debe tener permisos privados (chmod 600).')
path = Path(sys.argv[1])
manifest = path.with_name(path.name + '.sha256')
if not path.is_file() or not manifest.is_file():
    raise SystemExit('Falta el respaldo cifrado o su archivo .sha256.')
with path.open('rb') as stream:
    checksum = hashlib.file_digest(stream, 'sha256').hexdigest()
if checksum != manifest.read_text().strip():
    raise SystemExit('El respaldo no coincide con el checksum. No se restauró información.')
PY
unset PGPASSWORD
export PGSSLMODE="${PGSSLMODE:-verify-full}"
occlus_restore_tables="$(psql --no-password --dbname "$PGDATABASE" --tuples-only --no-align --set=ON_ERROR_STOP=1 --command="select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not in ('pg_catalog','information_schema') and n.nspname not like 'pg_toast%' and c.relkind in ('r','p','v','m','S','f');")"
[[ "$occlus_restore_tables" == '0' ]] || { echo 'El destino contiene tablas, vistas o secuencias. No se modificó.' >&2; exit 1; }
# Conserva propietario y permisos del dump: aprovisiona antes los roles originales.
# No usa --clean, --create o --disable-triggers. Una transacción evita restauraciones parciales.
age --decrypt --identity "$AGE_IDENTITY_FILE" "$occlus_restore_file" | pg_restore --exit-on-error --single-transaction --no-password --dbname "$PGDATABASE"
printf 'Restauración finalizada en la base confirmada. Mantén las integraciones externas desactivadas durante la revisión.\n'
