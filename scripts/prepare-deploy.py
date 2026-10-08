#!/usr/bin/env python3
"""Genera secretos de despliegue y valida configuración sin imprimir valores."""
import argparse
import os
import re
import secrets
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--check', action='store_true', help='Solo comprobar configuración, sin cambios')
args = parser.parse_args()
path = ROOT / '.env.production'
if not path.exists():
    if args.check:
        raise SystemExit('Falta .env.production. Ejecuta primero python3 scripts/prepare-deploy.py.')
    text = (ROOT / '.env.production.example').read_text()
    for name in ('JWT_SECRET', 'SITE_PUBLIC_API_KEY'):
        text = text.replace(name + '=\n', name + '=' + secrets.token_urlsafe(48) + '\n')
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as output:
        output.write(text)
    print('Creado .env.production privado. Completa los campos de correo, usuarios, base de datos y almacenamiento.')
    raise SystemExit(0)
values = {}
for line in path.read_text().splitlines():
    if line and not line.lstrip().startswith('#') and '=' in line:
        key, value = line.split('=', 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
required = ['PUBLIC_DOMAIN', 'TLS_EMAIL', 'DB_URL', 'DB_USER', 'DB_PASSWORD', 'DB_MIGRATION_USER',
            'DB_MIGRATION_PASSWORD', 'JWT_SECRET', 'SITE_PUBLIC_API_KEY', 'OCCLUS_PLATFORM_ADMIN_IDS',
            'SITE_OWNER_NAME', 'SITE_CONTACT_EMAIL', 'STORAGE_BUCKET']
errors = ['Falta ' + key for key in required if not values.get(key)]
for key in ('TLS_EMAIL', 'SITE_CONTACT_EMAIL'):
    if values.get(key) and not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', values[key]):
        errors.append('Correo inválido en ' + key)
for key in ('JWT_SECRET', 'SITE_PUBLIC_API_KEY'):
    if len(values.get(key, '')) < 32:
        errors.append('Se requieren al menos 32 caracteres en ' + key)
if values.get('DB_USER') == values.get('DB_MIGRATION_USER'):
    errors.append('DB_USER debe ser distinto del propietario de migraciones para conservar RLS')
if 'ENDPOINT_RDS' in values.get('DB_URL', ''):
    errors.append('Reemplaza ENDPOINT_RDS en DB_URL')
if values.get('OCCLUS_PLATFORM_ADMIN_IDS'):
    try:
        for item in values['OCCLUS_PLATFORM_ADMIN_IDS'].split(','):
            uuid.UUID(item.strip())
    except ValueError:
        errors.append('OCCLUS_PLATFORM_ADMIN_IDS debe contener UUID válidos')
if values.get('SITE_RETENTION_ENABLED', 'false') == 'true':
    try:
        days = int(values.get('SITE_RETENTION_DAYS', '0'))
        if not 1 <= days <= 3650:
            raise ValueError
        if values.get('SITE_RETENTION_PUBLIC_DAYS') != str(days):
            errors.append('El plazo público debe coincidir con SITE_RETENTION_DAYS')
    except ValueError:
        errors.append('SITE_RETENTION_DAYS debe estar entre 1 y 3650 cuando está activo')
elif values.get('SITE_RETENTION_PUBLIC_DAYS'):
    errors.append('No publiques un plazo de eliminación automática mientras esté desactivada')
if 'sslmode=verify-full' not in values.get('DB_URL', ''):
    errors.append('DB_URL debe verificar TLS con sslmode=verify-full para RDS')
if not (ROOT / 'deploy/certs/global-bundle.pem').exists():
    errors.append('Falta el certificado público de RDS en deploy/certs/global-bundle.pem')
if errors:
    print('\n'.join(errors))
    raise SystemExit(1)
print('Configuración presente y coherente. No se verificó conexión, DNS ni credenciales remotas.')
