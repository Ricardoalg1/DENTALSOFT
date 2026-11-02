#!/bin/sh
# Rol restringido de la aplicación (RLS le aplica), con la contraseña de .env.development.
# Solo se ejecuta al crear el volumen de datos por primera vez.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -v pw="$APP_DB_PASSWORD" <<'SQL'
create role occlus_app login password :'pw' nosuperuser nocreatedb nocreaterole nobypassrls;
SQL
