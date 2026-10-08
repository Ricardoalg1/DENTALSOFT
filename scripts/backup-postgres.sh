#!/usr/bin/env bash
# Respaldo cifrado por streaming. No crea un dump sin cifrar en disco.
set -euo pipefail
umask 077
for tool in pg_dump age python3; do
  command -v "$tool" >/dev/null || { echo "Falta la herramienta $tool." >&2; exit 1; }
done
: "${PGHOST:?Define PGHOST}"
: "${PGDATABASE:?Define PGDATABASE}"
: "${PGUSER:?Define PGUSER con acceso al respaldo completo}"
: "${PGPASSFILE:?Define PGPASSFILE privado}"
: "${AGE_RECIPIENT:?Define la clave pública de cifrado age}"
[[ "$PGDATABASE" =~ ^[A-Za-z_][A-Za-z0-9_-]{0,62}$ ]] || { echo 'PGDATABASE debe ser un nombre de base, no una URL.' >&2; exit 1; }
[[ "$AGE_RECIPIENT" =~ ^age1[a-z0-9]+$ ]] || { echo 'AGE_RECIPIENT debe ser una clave pública age.' >&2; exit 1; }
python3 - <<'PY'
import os, stat
from pathlib import Path
path = Path(os.environ['PGPASSFILE'])
if not path.is_file() or stat.S_IMODE(path.stat().st_mode) & 0o077:
    raise SystemExit('PGPASSFILE debe existir y tener permisos privados (chmod 600).')
PY
unset PGPASSWORD
export PGSSLMODE="${PGSSLMODE:-verify-full}"
occlus_backup_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
occlus_backup_dir="${BACKUP_DIR:-$occlus_backup_root/backups}"
mkdir -p "$occlus_backup_dir"
occlus_backup_file="$occlus_backup_dir/occlus-$(date -u +%Y%m%dT%H%M%SZ)-$$.dump.age"
occlus_backup_temp="$(mktemp "$occlus_backup_dir/.backup.XXXXXX")"
trap 'rm -f "$occlus_backup_temp"' EXIT
# pg_dump mantiene su snapshot consistente. Con RLS el rol restringido no basta.
pg_dump --format=custom --no-password --dbname "$PGDATABASE" | age --recipient "$AGE_RECIPIENT" > "$occlus_backup_temp"
[[ -s "$occlus_backup_temp" ]] || { echo 'No se produjo un respaldo válido.' >&2; exit 1; }
mv "$occlus_backup_temp" "$occlus_backup_file"
python3 - "$occlus_backup_file" <<'PY'
import hashlib, sys
from pathlib import Path
path = Path(sys.argv[1])
with path.open('rb') as stream:
    checksum = hashlib.file_digest(stream, 'sha256').hexdigest()
path.with_name(path.name + '.sha256').write_text(checksum + '\n')
PY
printf 'Respaldo cifrado creado: %s\n' "$occlus_backup_file"
printf 'Guarda también el archivo .sha256. La clave privada age debe conservarse fuera del servidor.\n'
