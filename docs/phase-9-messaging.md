# Fase 9 — WhatsApp y asistente de recepción

## Uso sin credenciales

1. Administración y recepción acceden a **Mensajes** (`/app/mensajes`).
2. Un administrador activa los recordatorios para su clínica y define anticipación (2–72 horas).
3. En el paciente, registrar un celular colombiano y marcar autorización de WhatsApp solamente
   cuando haya sido otorgada. Conservar el soporte de autorización.
4. Crear una cita programada/confirmada en una sede activa dentro del plazo de anticipación.
5. Pulsar **Ejecutar ciclo simulado**. El mensaje queda SIMULATED; nada sale a internet.
6. Seleccionar el recordatorio y simular CONFIRMO, CANCELAR, REPROGRAMAR, BAJA o una pregunta.

La simulación confirma o cancela **la cita real seleccionada** en la agenda local; no es un entorno
separado. La pantalla lo indica. Utilizar pacientes/citas de demostración cuando se quiera explorar.
Las respuestas libres simuladas siempre se clasifican con reglas, sin usar la API de Claude.

## Comportamiento

- Un recordatorio por cita y fecha; la reprogramación permite un recordatorio para la nueva fecha.
- Candidatos: pacientes activos con consentimiento, celular colombiano y cita futura abierta
  dentro de las horas configuradas. Máximo 50 recordatorios nuevos por ciclo.
- Se verifica consentimiento, teléfono, modo del canal y cita nuevamente al enviar.
- Celulares colombianos: diez dígitos iniciando por 3, con o sin indicativo +57.
- Cuerpo mínimo administrativo: nombre, clínica, fecha y sede. Sin diagnósticos ni tratamientos.
- Confirmaciones/cancelaciones explícitas por reglas o botones pueden cambiar la cita.
- Una respuesta enlazada al recordatorio verifica clínica, teléfono, paciente y fecha de la cita.
  Sin contexto, solo se enlaza si hay un único recordatorio candidato en 72 horas.
- Citas reprogramadas, pasadas, teléfonos cambiados, respuestas tardías y teléfonos ambiguos
  requieren revisión. Las acciones automáticas exigen recepción dentro de las últimas 24 horas.
- REPROGRAMAR y preguntas quedan en recepción; no se crea ni modifica una cita por decisión de IA.
- BAJA/STOP y frases explícitas equivalentes retiran el consentimiento de los pacientes de la clínica
  que compartan ese teléfono. No se envía una respuesta tras retirar el consentimiento.
- La bandeja muestra hasta 100 mensajes, priorizando pendientes; al resolverlos aparecen siguientes.
- Marcar atendido conserva una nota y autor. La nota documenta atención humana; no cambia la agenda.

## Envío y recuperación

QUEUED → SENDING → SENT / SIMULATED / FAILED. El intento SENDING se confirma en una transacción
antes de la llamada a Meta. Si el proceso se interrumpe, no se repite automáticamente el envío.
Los intentos interrumpidos por más de dos minutos se marcan FAILED y pendientes de revisión.
Esto evita reenvíos automáticos por un timeout/reinicio; puede dejar mensajes sin enviar que requieren
verificación humana. No se afirma entrega exactamente una vez ni aceptación/entrega cuando faltan pruebas.

SENT significa que Meta aceptó el mensaje y devolvió su id. Los webhooks informan sent/delivered/read/failed
por separado. Los estados antiguos no degradan delivered/read. Los errores no muestran tokens ni
respuestas externas crudas. No hay un botón de reenvío automático para resultados inciertos.

## Configuración real (pendiente de activar y validar)

Copiar `backend/messaging.properties.example` a `backend/messaging.properties`, privado e ignorado por Git.
Se carga al arrancar Maven desde backend; para otro directorio usar MESSAGING_CONFIG_FILE con ruta absoluta.
También se pueden definir variables de entorno directamente en el servicio de despliegue:

| Variable | Uso |
|---|---|
| WHATSAPP_LIVE_ENABLED | Activación explícita de envíos reales, inicialmente false |
| WHATSAPP_CLINIC_ID | UUID interno de la clínica asociada al número Meta |
| WHATSAPP_ACCESS_TOKEN | Token privado de Meta |
| WHATSAPP_PHONE_NUMBER_ID | Id del número empresarial |
| WHATSAPP_APP_SECRET | Secreto de la app para HMAC de webhooks |
| WHATSAPP_VERIFY_TOKEN | Token privado para la verificación inicial del webhook |
| WHATSAPP_API_VERSION | Versión Graph disponible para la app; predeterminada v23.0 |
| WHATSAPP_REMINDER_TEMPLATE | Nombre de la plantilla aprobada |
| WHATSAPP_TEMPLATE_LANGUAGE | Idioma aprobado, inicialmente es |
| MESSAGING_SCHEDULER | Automatización del servidor, inicialmente false |
| MESSAGING_AI_ENABLED | Activación global de llamadas Claude, inicialmente false |
| ANTHROPIC_API_KEY | Llave privada Claude |
| OCCLUS_AI_MODEL | Modelo disponible en la cuenta |

Para WhatsApp real se requieren live-enabled, clinic-id, token, phone-number-id, app-secret y verify-token.
Esta primera integración admite **un número real asociado a una clínica por despliegue**. Las otras clínicas
funcionan en modo simulado. La configuración de credenciales por clínica/Embedded Signup para un SaaS
con múltiples cuentas Meta requiere una extensión posterior; no compartir un número entre tenants.

Plantilla prevista `recordatorio_cita`: cuatro parámetros de cuerpo, en orden:
1. Primer nombre.
2. Clínica.
3. Fecha y hora en Colombia (dd/MM/yyyy HH:mm).
4. Sede.

Crear/aprobar en Meta una plantilla coherente con el texto registrado en Occlus y las instrucciones
CONFIRMO / CANCELAR / REPROGRAMAR / BAJA. Esta versión envía parámetros de cuerpo; no configura
botones dinámicos de plantilla. Acepta botones entrantes con payload CONFIRM/CANCEL/RESCHEDULE.
Comprobar nombre, idioma, versión y permisos en la app de Meta antes de activar los envíos.

Webhook público HTTPS del backend: `/api/webhooks/whatsapp`.
- GET valida hub.mode, hub.verify_token y devuelve hub.challenge.
- POST verifica X-Hub-Signature-256 con HMAC-SHA256 sobre el cuerpo original.
- Solo procesa eventos del phone_number_id configurado y de la clínica asociada.
- Deduplica entradas por id de Meta; persiste primero y procesa después.
- Texto libre saliente solo se utiliza para respuestas administrativas dentro de 24 horas.
- Con MESSAGING_SCHEDULER=false, las entradas quedan en cola hasta ejecutar un ciclo manual.

## Asistente Claude

Su alcance es **clasificar respuestas administrativas**, no un chat clínico ni asesoría médica.
Requiere activación global y aiEnabled de la clínica. Solo se usa en el canal real; la simulación es local.
Se envía únicamente el texto entrante de hasta 2000 caracteres, sin expediente, nombre ni teléfono
añadidos por Occlus. El paciente podría incluir información personal en su propio texto: revisar las
condiciones de tratamiento de datos antes de activar la integración externa.

Salida estructurada: CONFIRM, CANCEL, RESCHEDULE, QUESTION, OTHER u OPT_OUT.
No utiliza herramientas; su salida no selecciona citas ni ejecuta cambios. Las clasificaciones IA
requieren revisión humana. Fallos, rechazo o salida incompleta conservan la respuesta para recepción.
Timeout y reintentos desactivados para controlar latencia y llamadas.

## Permisos y auditoría

Administración configura el canal; administración y recepción operan bandeja, ciclos y simulación.
El resto de roles no accede a mensajes. Las tablas tienen RLS y claves/orígenes comprobados por trigger.
Mensajes no se borran. Cambios de cita y consentimiento se auditan con Envers; acciones automáticas
quedan también correlacionadas con su mensaje, intención y fuente. La fecha de consentimiento es auditada.
El checkbox registra autorización, pero por sí solo no sustituye el soporte aportado por el paciente.

## Estado y comprobaciones

Implementación local, adaptadores y UI disponibles. Compilación backend y build/lint frontend.
No se ejecutó la suite de pruebas ni se enviaron WhatsApps o solicitudes a Claude.
Pendientes externos: cuentas, secretos, plantilla aprobada, webhook HTTPS, revisión de datos y validación
del flujo en el entorno Meta/Claude antes de usarlo con pacientes.

Referencias:
- https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/webhooks/start/
- https://www.postman.com/meta/whatsapp-business-platform/folder/tduohwq/webhook-payload-reference
- https://platform.claude.com/docs/en/build-with-claude/structured-outputs
