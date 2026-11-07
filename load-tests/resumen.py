#!/usr/bin/env python3
"""Convierte el resumen de k6 en una tabla Markdown para la página de la ejecución en GitHub."""
import json
import os
import sys

path, users = sys.argv[1:3]
if not os.path.exists(path):
    raise SystemExit(f'### Prueba de carga\n\nk6 no dejó resultados en `{path}`: no hubo medición.')
metrics = json.load(open(path))['metrics']
PREFIX = 'http_req_duration{flow:sostenida'
total = metrics[PREFIX + '}']
failed = metrics['http_req_failed{flow:sostenida}']['value'] * 100
print(f'### Prueba de carga: {users} usuarios simultáneos\n')
print(f"p95 **{total['p(95)']:.1f} ms** (límite 200) · fallos **{failed:.2f} %** (límite 1 %) · "
      f"{metrics['http_reqs{flow:sostenida}']['count']} peticiones\n")
print('| Operación | Mediana (ms) | p95 (ms) | p99 (ms) | Máximo (ms) |')
print('| --- | ---: | ---: | ---: | ---: |')
rows = [(key[len(PREFIX) + len(',name:'):-1], value) for key, value in metrics.items() if key.startswith(PREFIX + ',name:')]
for name, value in sorted(rows, key=lambda row: -row[1]['p(95)']):
    print(f"| {name} | {value['med']:.1f} | {value['p(95)']:.1f} | {value['p(99)']:.1f} | {value['max']:.1f} |")
