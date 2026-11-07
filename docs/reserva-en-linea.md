# Reserva de citas en línea

Guía para quien opera Occlus. Incluida en todos los planes; cada clínica la activa en **Agenda > Página de reservas**.

## Cómo funciona

1. El paciente entra a `occlus.lat/reservar/<clinica>` y elige tipo de cita, profesional y hora libre. La hora queda apartada 10 minutos.
2. Deja nombre, celular y correo, acepta el tratamiento de datos y confirma con un código de 6 dígitos que recibe por correo o WhatsApp.
3. Recepción ve la solicitud en **Agenda > Solicitudes en línea**, la asocia a un paciente (o crea uno) y la confirma. Solo entonces nace la cita.
4. El paciente recibe un enlace para cancelar o cambiar la hora. Cambiar una cita confirmada la libera y la solicitud vuelve a recepción.

## Qué configurar en producción

| Variable | Para qué |
|---|---|
| `ACCOUNT_MAIL_FROM` | Remitente en un dominio verificado en Amazon SES: `notificaciones@occlusapp.com` |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET` | Captcha de Cloudflare. **Sin ellas, todas las páginas de reserva quedan apagadas** |
| `BOOKING_WHATSAPP_CODE_TEMPLATE`, `BOOKING_WHATSAPP_NOTICE_TEMPLATE` | Opcionales. Sin ellas, el código solo sale por correo |

El widget de Turnstile debe permitir el dominio `occlus.lat`.

### WhatsApp

Está programado, pero apagado y sin probar con Meta. Para activarlo:

1. **Número exclusivo** para la API de Meta, de un chip o línea que pueda recibir un SMS o una llamada.
2. **Portafolio de Meta Business** verificado, con la cuenta de WhatsApp Business y un método de pago.
3. **Credenciales:** token permanente de usuario del sistema, `Phone number ID`, secreto de la app y token de verificación del webhook.
4. **Dos plantillas aprobadas por Meta**, en español:
   - **Código:** categoría *autenticación*, con botón de copiar código. Meta fija el texto y no admite enlaces. Su nombre va en `BOOKING_WHATSAPP_CODE_TEMPLATE`.
   - **Aviso:** categoría *utilidad*, con un solo parámetro en el cuerpo. Su nombre va en `BOOKING_WHATSAPP_NOTICE_TEMPLATE`. Texto sugerido: `Occlus, sobre tu cita: {{1}}`.
5. **Servidor:** `docker-compose.production.yml` fija hoy `WHATSAPP_LIVE_ENABLED: "false"` y no pasa las credenciales. Hay que cambiarlo, definir `WHATSAPP_CLINIC_ID` y hacer una prueba real con un celular.

Los mensajes salen del número de la plataforma, no del de cada clínica. Solo acepta celulares colombianos. Meta cobra por mensaje de plantilla entregado.

## Protección

- **Separada de la historia clínica:** la solicitud vive en `online_booking_request`. No toca `patient` ni `appointment` hasta que la clínica aprueba.
- **Sin datos ajenos:** las horas públicas no llevan nombres ni motivos, y el flujo público nunca consulta la tabla de pacientes.
- **Datos mínimos:** el motivo se elige de una lista. Los apartados sin verificar se borran a los 2 días; lo demás, 30 días después de la cita o de la solicitud.
- **Sin choques:** una restricción de Postgres impide dos solicitudes activas en la misma hora. La de la agenda impide confirmar sobre otra cita.
- **Secretos:** códigos y enlaces se guardan solo como SHA-256. El enlace viaja en el fragmento de la URL (`#t=`) y deja de servir al cancelar, al rechazar o cuando la cita pasa.
- **Autorización:** se guardan la versión del texto (`consent_version`) y la fecha. Si cambias el texto, cambia `CONSENT_VERSION` en `PublicBookingService`.
- **Suscripción vencida:** la página responde 404, igual que si no existiera.

### Límites

| Qué | Tope |
|---|---|
| Peticiones por IP (nginx) | 30 por minuto, ráfaga de 30 |
| Apartados por IP | 10 por hora (en memoria de cada instancia) |
| Intentos por código | 5; luego se libera la hora |
| Envíos por apartado | 3, con 30 segundos entre cada uno |
| Envíos por destinatario, entre todas las clínicas | 6 en 24 horas |
| Solicitudes pendientes por contacto en una clínica | 3 |
| Por clínica | 30 apartados y 200 solicitudes pendientes |

Una cita creada a mano en la agenda puede ocupar una hora con una solicitud pendiente. Al confirmar, recepción recibe el aviso de choque y debe rechazarla o llamar al paciente.
