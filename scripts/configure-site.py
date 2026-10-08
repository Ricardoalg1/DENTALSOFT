#!/usr/bin/env python3
"""Prepara una clave privada local compartida sin mostrarla ni reemplazar claves."""
import os
import secrets
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / 'backend/site.properties'
FRONTEND = ROOT / 'frontend/.env.local'
SITE = ROOT / 'site/.env'

def read(path, key):
    if not path.exists():
        return None
    for line in path.read_text().splitlines():
        if line.strip().startswith(key + '='):
            return line.split('=', 1)[1].strip().strip('\"').strip("'")
    return None

def write(path, key, value):
    text = path.read_text() if path.exists() else ''
    lines = text.splitlines()
    if any(line.strip().startswith(key + '=') for line in lines):
        lines = [(key + '=' + value) if line.strip().startswith(key + '=') else line for line in lines]
    else:
        lines.append(key + '=' + value)
    # El contenido nunca pasa a la línea de comandos ni se imprime.
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as output:
        output.write('\n'.join(lines) + '\n')
    os.chmod(path, 0o600)

backend_key = read(BACKEND, 'occlus.marketing.public-key')
frontend_key = read(FRONTEND, 'SITE_PUBLIC_API_KEY')
if backend_key and frontend_key and backend_key != frontend_key:
    raise SystemExit('Las claves existentes no coinciden. Revisa ambos archivos privados; no se cambió ninguna clave.')
site_key = read(SITE, 'SITE_PUBLIC_API_KEY')
if site_key and (backend_key or frontend_key) and site_key != (backend_key or frontend_key):
    raise SystemExit('La clave de Astro no coincide con el backend. No se cambió ninguna clave.')
key = backend_key or frontend_key or site_key or secrets.token_urlsafe(48)
if len(key) < 32:
    raise SystemExit('La clave existente debe tener al menos 32 caracteres. No se cambió ninguna clave.')
write(BACKEND, 'occlus.marketing.public-key', key)
write(FRONTEND, 'SITE_PUBLIC_API_KEY', key)
write(SITE, 'SITE_PUBLIC_API_KEY', key)
for config_key, default in {'API_URL':'http://localhost:8080', 'SITE_OWNER_NAME':'SINE SAS', 'SITE_CONTACT_NAME':'Ricardo Algarin', 'PUBLIC_APP_URL':'http://localhost:3000', 'SITE_ANALYTICS_ENABLED':'false'}.items():
    if not read(SITE, config_key):
        write(SITE, config_key, default)
print('Clave privada compartida preparada. Reinicia backend, frontend y Astro. El acceso al CRM sigue requiriendo los UUID autorizados.')
