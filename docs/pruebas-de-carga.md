# Pruebas de carga con k6

La API debe aguantar carga antes de desplegarse. El workflow [`load-test.yml`](../.github/workflows/load-test.yml) corre en cada pull request hacia `production` y `main`, y falla si no se cumple:

| Requisito | Umbral en k6 |
| --- | --- |
| Responder en menos de 200 ms | `p(95)<200`: el 95 % de las peticiones |
| Fallar hasta el 1 % de las peticiones | `rate<0.01`: menos del 1 % |
| Usuarios simultáneos | 500 (se cambia en `load-test.yml`) |

El login cuenta dentro del p95 general. Se prueba a 1 ingreso por segundo porque bcrypt es caro a propósito y una sesión dura 8 horas.

## Qué se prueba

- **Entorno:** [`docker-compose.loadtest.yml`](../docker-compose.loadtest.yml) levanta backend, PostgreSQL y almacenamiento efímeros. Nunca se prueba contra producción: afectaría a las clínicas y escribiría datos falsos.
- **Recursos:** los de producción. Backend con 2 CPU y 2 GB (EC2 t3.small); PostgreSQL con 2 CPU y 1 GB (RDS db.t4g.micro).
- **Usuarios:** cada usuario virtual es una persona que hace una acción y piensa de 1 a 3 segundos. Por eso 500 usuarios son unas 290 peticiones por segundo, no 500.
- **Mezcla:** 90 % lecturas (agenda, pacientes, búsqueda, perfil, reportes) y 10 % escrituras (crear pacientes y citas), repartidas entre 10 clínicas con 100 pacientes cada una. Un 409 por horario ocupado es una respuesta correcta y no cuenta como fallo.
- **Calentamiento:** el primer minuto sube la carga y no se evalúa, porque la JVM recién arrancada es lenta.

## Cómo ejecutarla

```sh
# Una carga concreta
docker compose -f docker-compose.loadtest.yml --profile carga run --rm k6 run -e USERS=500 api.js

# ¿Cuántos usuarios aguanta? Sube por escalones hasta el primero que incumple
load-tests/capacidad.sh

# Borrar el entorno y sus datos
docker compose -f docker-compose.loadtest.yml --profile carga down -v
```

En GitHub, *Actions → Prueba de carga → Run workflow* permite pedir otro número de usuarios y medir la capacidad en la máquina de CI.

## Capacidad medida

Medido el 7 de noviembre de 2026 en un Mac con Docker Desktop, 2 minutos por escalón:

| Usuarios | Peticiones/s | p95 (ms) | p99 (ms) | Fallos | Resultado |
| ---: | ---: | ---: | ---: | ---: | --- |
| 100 | 58 | 10,4 | 102,1 | 0 % | Cumple |
| 250 | 145 | 5,2 | 94,0 | 0 % | Cumple |
| 500 | 287 | 4,2 | 196,1 | 0 % | Cumple |
| 1000 | 575 | 4,5 | 326,2 | 0 % | Cumple |
| 1500 | 858 | 5,1 | 389,1 | 0 % | Cumple |
| 2000 | 1139 | 27,9 | 761,3 | 0 % | Cumple |
| 3000 | 1486 | 721,2 | 1161,7 | 0 % | No cumple |

## Cómo leer estos números

Son un límite superior, no la capacidad de producción:

- **CPU:** 2 CPU de un Mac rinden más que los 2 vCPU de un t3.small, que además son de ráfaga.
- **Servidor compartido:** en producción el backend comparte la máquina con Next, Astro, Nginx y Caddy. Aquí los tiene solo para él.
- **Camino de la petición:** esta prueba llama directo al backend. Los usuarios reales pasan por Caddy, Nginx y el BFF de Next, que añaden tiempo.
- **Datos:** 100 pacientes por clínica. Con historiales grandes las consultas pueden tardar más.
- **Base de datos:** corre junto al backend, sin la latencia de red ni los límites de disco de RDS.

Tampoco cubre Next, el sitio público, la carga de archivos, las historias clínicas ni el límite por IP de Nginx (300 peticiones por minuto).

Para saber lo que aguanta la máquina de CI hay que ejecutar el workflow con la opción de capacidad. Si la exigencia sube, debe subirse con ese resultado a la vista, para no bloquear despliegues por el ruido de la máquina.

## Hacerla obligatoria

El workflow marca el pull request en rojo, pero GitHub solo impide el merge si `Prueba de carga` es un check requerido en `production` y `main`. El despliegue sigue siendo manual en el servidor: la regla se cumple mientras se despliegue únicamente desde `main`.
