# Recuperar contraseña y verificación en dos pasos

Guía para quien opera Occlus. Explica qué configurar antes de desplegar y qué hacer cuando alguien pierde el acceso.

## Antes de desplegar

Agrega esto a `.env.production`. Sin `TOTP_ENCRYPTION_KEY`, `docker compose` no arranca.

| Variable | Valor | Para qué |
|---|---|---|
| `TOTP_ENCRYPTION_KEY` | Resultado de `openssl rand -base64 32` | Cifra los secretos de la verificación en dos pasos |
| `ACCOUNT_MAIL_FROM` | `notificaciones@occlusapp.com` | Remitente en un dominio verificado en Amazon SES (`occlusapp.com`). Sin él no salen correos |
| `ACCOUNT_MAIL_PROVIDER` | `ses` (predeterminado en producción) | Envía con Amazon SES usando el rol de la instancia, sin llaves guardadas. Con `smtp` usa `CLINICAL_MAIL_*` |
| `SES_REGION` | `us-east-2` | Región del proyecto en la que está SES |
| `PLATFORM_REQUIRE_2FA` | `true` (predeterminado en producción) | Exige la verificación para usar el panel de plataforma |

**Guarda `TOTP_ENCRYPTION_KEY` en tu gestor de contraseñas.** Si se pierde, nadie con la verificación activa podrá ingresar y los secretos no se pueden recuperar. No la cambies en un servidor que ya tenga usuarios con la verificación activa.

En SES, el dominio debe estar verificado con DKIM y la cuenta fuera del modo de pruebas (sandbox); si no, solo llegan correos a direcciones verificadas. El rol de la instancia necesita `ses:SendEmail` sobre esa identidad.

### Orden del primer despliegue

1. Agrega las variables y haz una copia de la base de datos.
2. Despliega. La migración `V40` se aplica sola.
3. Si `PLATFORM_REQUIRE_2FA` está en `true`, el panel de plataforma queda bloqueado hasta que actives la verificación en **Mi cuenta**. Actívala de inmediato y guarda tus códigos de respaldo.
4. Prueba la recuperación con una cuenta real: pide el enlace, revisa que llegue y que no caiga en spam.

Si falta el proveedor de correo, la pantalla de recuperación informa que no está disponible y los avisos de seguridad no se envían. La verificación en dos pasos sí funciona sin correo.

## Cómo funciona

**Recuperar la contraseña**
- La respuesta es igual exista o no el correo, y el trabajo ocurre en segundo plano. Ni el mensaje ni el tiempo de respuesta revelan quién tiene cuenta.
- El enlace vence en 30 minutos, sirve una vez y solo vale el último pedido. Se envían máximo 3 por hora a cada cuenta.
- La base guarda solo el hash del token. El token viaja en el fragmento de la URL (`#t=`), que no llega a los servidores ni a los registros.
- La dirección del enlace sale de `PUBLIC_URL`, nunca de la petición.
- Al cambiar la contraseña se cierran todas las sesiones y se avisa por correo.
- **Si la cuenta tiene verificación en dos pasos, el enlace no basta:** también pide el código. Controlar el correo de alguien no da acceso a su cuenta.

**Verificación en dos pasos**
- Usa códigos TOTP estándar, compatibles con Google Authenticator, Microsoft Authenticator, 1Password y similares.
- El secreto se guarda cifrado con AES-256-GCM. La llave no está en la base de datos, así que una copia robada de la base no permite generar códigos.
- Un código no se puede usar dos veces.
- Cada 5 códigos incorrectos seguidos la verificación se bloquea: 15 minutos, luego 30, 1 hora y así hasta 24 horas. El conteo queda en la base y no se reinicia al volver a ingresar la contraseña. Al bloquearse se avisa por correo.
- Activar, desactivar o regenerar códigos exige la contraseña. Desactivar y regenerar exigen además un código.
- Solo la puede activar el administrador de la plataforma (`OCCLUS_PLATFORM_ADMIN_IDS`). Las clínicas entran con su contraseña.
- Se entregan 3 códigos de respaldo de un solo uso, que se muestran una sola vez y se guardan como hash.

Los eventos quedan en `account_security_event`, una tabla de solo inserción para la aplicación. Nunca guarda tokens, códigos ni contraseñas.

## Si alguien pierde el teléfono y los códigos de respaldo

El panel no tiene un botón para quitar la verificación, a propósito: sería la forma más fácil de saltársela engañando a alguien de soporte.

1. **Verifica la identidad por un canal distinto al correo de la cuenta,** por ejemplo una llamada al número que ya tenías registrado y la confirmación del administrador de la clínica. Una solicitud por correo o WhatsApp no basta: es el ataque típico.
2. Ejecuta esto con el rol dueño de la base (`occlus`), reemplazando el id:

   ```sql
   begin;
   delete from user_recovery_code where user_id = 'ID_DEL_USUARIO';
   delete from user_two_factor where user_id = 'ID_DEL_USUARIO';
   insert into account_security_event (user_id, clinic_id, event)
     select id, clinic_id, 'TWO_FACTOR_DISABLED' from app_user where id = 'ID_DEL_USUARIO';
   update user_session set revoked_at = now(), revoked_reason = 'TWO_FACTOR_CHANGED'
     where user_id = 'ID_DEL_USUARIO' and revoked_at is null;
   commit;
   ```

3. Pide a la persona que la active de nuevo apenas ingrese.
