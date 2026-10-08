#!/usr/bin/env python3
"""Consulta disponibilidad sin tokens, datos de pacientes o credenciales."""
import argparse
import json
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

parser = argparse.ArgumentParser()
parser.add_argument('--site', default='http://localhost:4321')
parser.add_argument('--app', default='http://localhost:3000')
parser.add_argument('--backend', default='http://localhost:8080')
args = parser.parse_args()
checks = [('Sitio público', args.site.rstrip('/') + '/site-api/health'),
          ('Aplicación y API', args.app.rstrip('/') + '/bff/health'),
          ('Backend y PostgreSQL', args.backend.rstrip('/') + '/actuator/health/readiness')]

def check(item):
    name, url = item
    try:
        request = urllib.request.Request(url, headers={'Accept': 'application/json'})
        with urllib.request.urlopen(request, timeout=5) as response:
            body = json.loads(response.read(4096))
            return name, response.status == 200 and body.get('status') == 'UP'
    except (OSError, ValueError):
        return name, False

with ThreadPoolExecutor(max_workers=3) as pool:
    results = list(pool.map(check, checks))
for name, up in results:
    print(name + ': ' + ('disponible' if up else 'no disponible'))
sys.exit(0 if all(up for _, up in results) else 1)
