# Configuración Dataico

## Dónde editar la llave

Editar `backend/dataico.properties`, archivo privado ignorado por Git. Copiarlo desde
`backend/dataico.properties.example` si todavía no existe. No se necesita editar Java ni Next.js.

```properties
occlus.dataico.auth-token=TU_LLAVE_API
occlus.dataico.account-id=UUID_DE_LA_CUENTA_DATAICO
occlus.dataico.clinic-id=UUID_DE_LA_CLINICA_OCCLUS
occlus.dataico.environment=PRUEBAS
occlus.dataico.prefix=PREFIJO_DE_HABILITACION
occlus.dataico.resolution-number=RESOLUCION_DE_HABILITACION
```

La llave y el account_id se obtienen en Configuración de Dataico.
La numeración se consulta en Ventas > Facturas > Numeraciones > Editar.
El UUID de Occlus aparece en Facturación y RIPS > Conexión Dataico.
No confundir ambos UUID. La cuenta se limita a esa clínica; otros tenants no pueden consultarla.

Arrancar el backend desde `backend/` con `./mvnw spring-boot:run` para cargar el archivo.
Spring no carga automáticamente un `.env`. Para un IDE u otro directorio de trabajo,
usar `DATAICO_CONFIG_FILE=/ruta/absoluta/backend/dataico.properties`.
En despliegue usar variables DATAICO_AUTH_TOKEN, DATAICO_ACCOUNT_ID, DATAICO_CLINIC_ID,
DATAICO_ENVIRONMENT, DATAICO_PREFIX y DATAICO_RESOLUTION_NUMBER en el gestor de secretos.
No usar variables `NEXT_PUBLIC_*` para estas credenciales.

## Alcance implementado

- Credenciales privadas en backend, conexión HTTPS con timeout y sin redirecciones.
- Consulta autenticada de factura por consecutivo completo (prefijo incluido).
- Panel administrativo en `/app/facturacion` que muestra UUID, CUFE y estado explícito.
- Errores de Dataico sin exponer token ni la respuesta cruda.
- Un estado configurado significa que se introdujeron credenciales, no que fueron verificadas.
- No se reintenta automáticamente ninguna emisión ni se envía correo al paciente.

## Pendiente para emisión de prueba

Confirmar account_id, resolución, prefijo, rango/consecutivo de habilitación y el tipo
de operación aplicable (particular, recaudo o facturación a ERP). Completar datos fiscales
del comprador, tratamiento tributario y forma de pago, y almacenar el vínculo persistente
entre borrador y factura externa antes de habilitar el POST. Todavía no existe botón de
emisión: los borradores locales no se envían a Dataico.

El contrato publicado define `env: PRUEBAS` para habilitación y `PRODUCCION` para emisión definitiva.
No cambiar a producción hasta completar el flujo y revisar la numeración real.
La consulta de facturas existente no recibe `env` según el contrato: usa la cuenta y número
completo. Confirmar en Dataico que el número consultado pertenece al entorno de prueba.

## Referencias oficiales

- https://portaldelcliente.dataico.com/es/knowledge/documentaci%C3%B3n-t%C3%A9cnica-de-la-api-de-dataico-factura-electr%C3%B3nica-sector-salud
- Swagger: https://app.dataico.com/api-docs
- Contrato OpenAPI: https://app.dataico.com/json-api
- Consulta: https://portaldelcliente.dataico.com/es/knowledge/documentaci%C3%B3n-t%C3%A9cnica-de-la-api-de-dataico-factura-electr%C3%B3nica-1
