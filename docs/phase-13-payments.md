# Etapa 13 — Pagos con Wompi y ePayco, sesiones revocables y módulos por plan

## Qué quedó listo

| Tema | Estado |
|---|---|
| Pago de la suscripción por Wompi (redirección) | Implementado y probado contra un Wompi simulado. |
| Cobro automático con tarjeta guardada (Wompi) | Implementado y probado contra un Wompi simulado. |
| Pago de la suscripción por ePayco (checkout + confirmación firmada) | Implementado y probado contra un ePayco simulado. **Sin cobro automático**: cada periodo lo paga la clínica. |
| Sesiones revocables | Implementado y probado. |
| Módulos por plan | Decididos (ver abajo). |

> **Importante: nada de esto se ha probado contra Wompi ni ePayco reales** (no hay credenciales en este entorno). Wompi se implementó leyendo su documentación oficial; **la documentación de ePayco no estaba accesible** y esa parte (formato de la confirmación, firma y URL de validación) se basa en su flujo estándar conocido. Antes de cobrar dinero real, prueba ambos en **modo de pruebas** de cada pasarela (lista al final).

## Cómo se paga

### Desde la clínica (administrador): `Mi cuenta → Pagar ahora`

1. El backend (`POST /api/subscription/checkout`) toma el cobro pendiente —o crea el del siguiente periodo si paga por adelantado— y registra un intento con una **referencia única** (`occ-<uuid>`).
2. **Wompi**: se redirige a su Web Checkout con el monto, la referencia y una **firma de integridad calculada en el servidor** (`SHA-256(referencia + centavos + COP + secreto de integridad)`). **ePayco**: se abre su checkout con los mismos datos.
3. La persona escribe su tarjeta **en la página de la pasarela**. Occlus nunca recibe datos de tarjeta.
4. Al terminar, la pasarela devuelve a `/pago?c=<intento>`. Esa página pregunta el resultado al backend, que **consulta la transacción a la pasarela** y la aplica. En paralelo, el webhook de la pasarela hace lo mismo. Ambos caminos son idempotentes.

Una clínica **suspendida o con la prueba vencida puede pagar** y reactivarse sola: la pantalla de «acceso pausado» incluye el botón de pago.

### Cobro automático (Wompi)

La clínica guarda una tarjeta en `Mi cuenta`: el **navegador** la envía directo a Wompi (`/tokens/cards` con la llave pública) y a Occlus solo llega el token; el backend lo convierte en una *fuente de pago* (`/payment_sources`, tras aceptar la persona los términos y la autorización de datos que exige Wompi). El motor de suscripciones cobra esa fuente con `recurrent=true`, con las mismas reglas de reintento de siempre. El equipo también puede registrar una fuente a mano desde la ficha del cliente.

## Reglas de seguridad (valen para ambas pasarelas)

- **Nada se da por pagado por lo que diga el navegador o el cuerpo de un webhook.** Siempre se consulta la transacción a la pasarela y se cruzan **referencia, monto y moneda** con lo registrado. Si no coincide, no se aplica y se crea un evento crítico `PAYMENT_REVIEW`.
- Webhooks: firma verificada en tiempo constante (Wompi: checksum con el secreto de eventos; ePayco: SHA-256 de `p_cust_id_cliente^p_key^x_ref_payco^x_transaction_id^x_amount^x_currency_code`). Firma inválida: `401`. Error al procesar: `500` para que la pasarela reintente. Referencia desconocida: `200` sin hacer nada.
- Un segundo pago aprobado sobre un cobro ya pagado o anulado **no se aplica** y avisa al equipo para reembolsar (`PAYMENT_REVIEW`).
- Mientras hay un pago en curso, el cobro automático espera 30 minutos para no cobrar dos veces.
- Las llaves privadas viven solo en variables de entorno; la configuración las oculta en `toString`. Al arrancar se rechazan llaves que no correspondan al ambiente (`pub_test_` en producción, etc.).
- Las rutas `/api/subscription/**` solo las usa el administrador de la clínica (la clínica sale del token, no de la petición) y funcionan con la suscripción suspendida para poder pagar.
- Los tokens de pago nunca vuelven al navegador.
- Con una **contraseña temporal** vigente solo se puede usar la autenticación (cambiarla, `/me`, cerrar sesión): antes esto se saltaba en los controladores exentos de suscripción.

## Configuración (`.env`)

```sh
# Siempre en producción:
PAYMENTS_SIMULATED=false         # ya fijo en docker-compose.production.yml
PUBLIC_URL=https://occlus.lat    # (compose lo arma con PUBLIC_DOMAIN)

# Wompi — panel de comercio → Desarrolladores
WOMPI_ENABLED=true
WOMPI_ENVIRONMENT=sandbox        # sandbox | production
WOMPI_PUBLIC_KEY=pub_test_...    # en producción pub_prod_...
WOMPI_PRIVATE_KEY=prv_test_...
WOMPI_EVENTS_SECRET=test_events_...
WOMPI_INTEGRITY_SECRET=test_integrity_...

# ePayco — Configuración → Integraciones → Llaves API
EPAYCO_ENABLED=true
EPAYCO_CUSTOMER_ID=...           # P_CUST_ID_CLIENTE
EPAYCO_PUBLIC_KEY=...
EPAYCO_P_KEY=...                 # P_KEY
EPAYCO_TEST=true                 # false en producción
```

Pueden estar activas las dos a la vez; la clínica ve un botón por cada una. Si falta una llave o no corresponde al ambiente, **el backend no arranca** (preferible a cobrar mal).

### Lo que hay que configurar en los paneles de las pasarelas

- **Wompi → Desarrolladores → URL de eventos**: `https://occlus.lat/api/webhooks/wompi` (una para pruebas y otra para producción).
- **ePayco → Configuración → Integraciones → URL de confirmación**: `https://occlus.lat/api/webhooks/epayco`; método POST.
- El proxy (`deploy/nginx.conf`) ya enruta `/api/webhooks/(wompi|epayco)` al backend y `/pago` al frontend.

### Probar antes de cobrar de verdad

1. Con llaves de **pruebas**, crear un cliente, entrar como su administrador y pagar con una tarjeta de prueba de la pasarela (Wompi y ePayco publican tarjetas de prueba aprobadas y rechazadas).
2. Verificar que llega el webhook (en `Plataforma → Eventos` aparece «Pago recibido») y que el cobro queda `PAGADO`.
3. Con una tarjeta **rechazada**: la clínica ve el mensaje y queda un evento «Cobro fallido».
4. Wompi: guardar una tarjeta y ejecutar el proceso de suscripciones con la prueba vencida; debe cobrar la fuente.
5. **ePayco, en particular**: confirmar que la confirmación llega con los campos `x_ref_payco`, `x_transaction_id`, `x_amount`, `x_currency_code`, `x_signature`, `x_id_invoice`, y que `https://secure.epayco.co/validation/v1/reference/<ref_payco>` devuelve `data.x_cod_response`. Si alguno difiere, solo hay que ajustar `EpaycoCheckout`.

## Sesiones revocables

Antes, el rol y el estado «activo» viajaban solo dentro del JWT: **un usuario desactivado conservaba el acceso hasta que vencía el token (8 h)**. Ahora cada token lleva un `sid` que apunta a una fila de `user_session`, y el validador del JWT consulta en cada petición (una lectura por clave primaria) que la sesión exista y no esté cerrada ni vencida, que el usuario esté activo y que su rol y clínica coincidan con los del token. Falla cerrado.

| Evento | Efecto |
|---|---|
| Cerrar sesión | El token se invalida en el servidor (aunque lo hubieran copiado). |
| Cambiar la contraseña | Se cierran **todas** las demás sesiones; solo vale la nueva. |
| Desactivar a un usuario | Pierde el acceso al instante. |
| Cambiar su rol | Su token deja de valer; entra de nuevo con el rol nuevo. |
| «Cerrar las demás sesiones» / cerrar una | En `Mi cuenta → Sesiones abiertas`. |

Efecto de despliegue: los tokens anteriores a esta versión no traen `sid`, así que **todos los usuarios deben iniciar sesión una vez**. Una tarea diaria borra las sesiones vencidas o cerradas hace más de una semana.

## Módulos por plan

Criterio: lo que el sitio ya promete en cada plan, y dejar fuera de las tarifas fijas lo que tiene costo variable o carga regulatoria.

| Módulo | Esencial | Equipo | Integral | Global (cotizado) |
|---|:-:|:-:|:-:|:-:|
| Historia clínica | ✓ | ✓ | ✓ | ✓ |
| Tratamientos y caja | ✓ | ✓ | ✓ | ✓ |
| Reportes | | ✓ | ✓ | ✓ |
| Inventario | | | ✓ | ✓ |
| Facturación y RIPS | | | | ✓ |
| Mensajes (WhatsApp) | | | | ✓ |

- **Mensajes (WhatsApp)**: cada conversación tiene un costo con Meta y crece con el uso; no conviene regalarlo en una tarifa fija.
- **Facturación y RIPS**: exige un facturador autorizado ante la DIAN (Dataico) y soporte regulatorio.
- Ambos se pueden **agregar a cualquier cliente como adicional** (ficha del cliente → Módulos) y cobrar aparte. Todo se edita en `Plataforma → Planes` sin tocar código; los clientes que ya existen conservan lo que tienen.
- La **prueba gratuita** del registro abierto habilita todos los módulos (probar todo es lo normal); al convertirse en cliente, se le asigna su plan.

## Suspensión administrativa y pago

Si una clínica con el periodo todavía vigente es suspendida por el equipo y luego paga, **el pago la reactiva** y el periodo nuevo se suma al final del que ya tenía pagado (antes quedaba cobrada pero suspendida: se corrigió). Si necesitas un bloqueo que un pago no pueda levantar, **cancela** la suscripción en vez de suspenderla.

## Recuperación de contraseña (propuesta, no implementada)

Falta decidir un proveedor de correo (Amazon SES, Postmark, Resend…) y configurar SPF/DKIM de `occlus.lat`. El diseño recomendado:

1. **Recuperación por correo**: enlace de un solo uso, token aleatorio de ≥128 bits del que solo se guarda el hash, vigencia de 30 minutos, solicitud nueva invalida la anterior, límite de intentos por cuenta y por IP, y respuesta idéntica exista o no el correo (sin revelar qué cuentas existen). Al completarse: cierra **todas** las sesiones (ya soportado) y avisa por correo del cambio. Nunca se envía una contraseña por correo.
2. **Personal de una clínica**: su administrador genera una contraseña temporal con cambio obligatorio (el mecanismo ya existe), con registro en auditoría.
3. **Si el único administrador pierde su correo**: el equipo de Occlus **nunca ve ni fija contraseñas**; tras verificar la identidad por otro canal, cambia el correo registrado (con aviso al correo anterior y registro en auditoría) y la persona usa el flujo 1.
4. **Doble factor (TOTP)** obligatorio para el equipo de plataforma y recomendado para administradores de clínica: el panel concentra mucho poder.
