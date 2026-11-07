#!/usr/bin/env bash
# ¿Cuántos usuarios aguanta la API? Sube la carga por escalones hasta el primero que incumple
# los umbrales de api.js. Uso: load-tests/capacidad.sh [usuarios por escalón...]
set -u
cd "$(dirname "$0")/.."
compose=(docker compose -f docker-compose.loadtest.yml --profile carga)
levels=("$@")
[ ${#levels[@]} -gt 0 ] || levels=(100 250 500 1000 1500 2000 3000 4000)
: "${DURATION:=2m}"
mkdir -p load-tests/resultados

"${compose[@]}" up -d --build --wait backend || exit 1

last_ok=0
printf '%-9s %-8s %-9s %-9s %-8s %s\n' usuarios req/s p95_ms p99_ms fallos resultado
for users in "${levels[@]}"; do
  rm -f "load-tests/resultados/capacidad-$users.json"
  "${compose[@]}" run --rm k6 run --quiet -e USERS="$users" -e RAMP=30s -e DURATION="$DURATION" \
    --summary-export="resultados/capacidad-$users.json" api.js >/dev/null 2>&1
  code=$?
  # Sin resumen no hubo medición: nunca se cuenta como un escalón superado.
  if [ ! -s "load-tests/resultados/capacidad-$users.json" ]; then
    echo "$users: k6 terminó con código $code sin dejar resultados." >&2
    break
  fi
  python3 - "load-tests/resultados/capacidad-$users.json" "$users" "$code" "$DURATION" <<'PY'
import json, sys
path, users, code, duration = sys.argv[1:]
metrics = json.load(open(path))['metrics']
latency = metrics['http_req_duration{flow:sostenida}']
seconds = int(duration[:-1]) * (60 if duration.endswith('m') else 1)
print(f"{users:<9} {metrics['http_reqs{flow:sostenida}']['count'] / seconds:<8.0f} {latency['p(95)']:<9.1f} "
      f"{latency['p(99)']:<9.1f} {metrics['http_req_failed{flow:sostenida}']['value'] * 100:<7.2f}% "
      f"{'cumple' if code == '0' else 'NO cumple (código ' + code + ')'}")
PY
  [ "$code" -eq 0 ] || break
  last_ok=$users
done
echo "Capacidad medida: $last_ok usuarios simultáneos cumpliendo p95 < 200 ms y fallos < 1 %."
