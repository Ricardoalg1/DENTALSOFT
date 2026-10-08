# Despliegue preparado — Occlus

Arquitectura: Caddy (TLS) → Nginx (rutas y límites) → Astro público / Next aplicación / Spring Boot. PostgreSQL y S3 permanecen fuera del acceso público. El archivo Compose es una configuración preparada; no se lanzó en un servidor remoto.

## Preparar variables privadas

```sh
python3 scripts/prepare-deploy.py
```

Genera `.env.production` con secretos JWT y sitio aleatorios, sin mostrarlos. Completa correos, endpoint/credenciales PostgreSQL, bucket y UUID comerciales. No se reemplaza un archivo existente.

RDS necesita un rol de aplicación distinto al propietario de migraciones. Usa `docker/postgres/01-app-role.sql` como referencia para aprovisionar el rol, **con una contraseña propia de producción**; no ejecutes el archivo de desarrollo con sus credenciales predeterminadas en producción. Flyway crea permisos y políticas RLS desde V2. El propietario debe tener permiso para otorgar privilegios al rol de aplicación.

## Certificado público de RDS

```sh
mkdir -p deploy/certs
curl -fsS https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem -o deploy/certs/global-bundle.pem
```

Se monta en `/app/certs/global-bundle.pem`. La URL JDBC preparada exige `sslmode=verify-full` y `sslrootcert` para verificar identidad y cifrado de la conexión, conforme a la [documentación SSL/TLS de RDS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.SSL.html). El certificado público no se guarda en Git; descárgalo en cada servidor.

## Comprobar configuración

```sh
python3 scripts/prepare-deploy.py --check
```

Comprueba presencia y coherencia de variables, UUID, correo y plazo. No se conecta a AWS ni verifica contraseñas o DNS. No imprimas `docker compose config` con secretos en una terminal que se vaya a compartir; usa `config --quiet`.

## Lanzar en el servidor elegido

Una vez completada la configuración y el DNS:

```sh
docker compose --env-file .env.production -f docker-compose.production.yml config --quiet
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
```

El dominio debe apuntar al servidor y los puertos 80/443 estar disponibles para Caddy. El único ingreso público es Caddy. Nginx toma una cabecera de IP que Caddy sobrescribe; no publiques Nginx directamente ni confíes en cabeceras de un cliente.

En AWS, la instancia debe poder acceder a RDS y tener un rol IAM que permita los objetos necesarios del bucket privado. El backend configura las credenciales S3 vacías para usar la cadena de credenciales de AWS, en vez de credenciales de desarrollo. Habilita acceso al rol desde contenedores conforme a la configuración de la instancia. Ningún bucket se crea o publica desde este Compose.

Astro usa rutas públicas `/`, `/planes`, `/blog`, `/demo`, `/privacidad` y `/condiciones`. Next atiende `/app`, `/ingresar`, `/registro`, `/salir`, `/bff` y `/_next`. El webhook de WhatsApp se reenvía al backend, que mantiene la integración desactivada hasta su configuración explícita. La API pública interna y Swagger no se exponen por el proxy.

Nginx configura 5 solicitudes/minuto con ráfaga de 5 para `/demo`, y 30/minuto con ráfaga de 10 para métricas, por IP recibida de Caddy. Puede ajustarse para equipos que comparten conexión; devuelve 429 al exceder el límite. [Referencia de limit_req](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html).

## CI

`.github/workflows/build.yml` compila y revisa Astro/Next y empaqueta Java en push/PR. Sigue el flujo de [GitHub Actions con Maven](https://docs.github.com/en/actions/tutorials/build-and-test-code/java-with-maven), con pruebas deshabilitadas en el empaquetado de esta tarea. No hace push de imágenes, despliegues, cobros o envíos automáticos.

## Operación pendiente

- Completar revisión de privacidad, condiciones, impuestos, soporte y plazo; autorizar usuarios comerciales.
- Configurar copias de seguridad de RDS, archivos S3 y recuperación en el entorno elegido.
- Definir alertas y monitorización externas y confirmar funcionamiento real de todos los servicios tras el despliegue.
- Activar proveedores e integraciones externas cuando se hayan configurado y autorizado.
- No se validaron imágenes Docker ni conexiones a RDS en esta implementación local.

## Disponibilidad y recuperación

El Compose incluye sondas, dependencias de arranque y rotación de logs. Las herramientas de respaldo y recuperación están en [Etapa 11](phase-11-operations.md). Su configuración y ejecución real siguen pendientes del entorno de operación.
