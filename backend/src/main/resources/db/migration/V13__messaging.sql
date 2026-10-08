-- ---------- Autorización de mensajes (Ley 1581 de 2012, habeas data) ----------
-- Solo se envían recordatorios a pacientes que lo autorizaron expresamente.
alter table patient add column whatsapp_consent boolean not null default false;
alter table patient add column whatsapp_consent_at timestamptz;
alter table patient_aud add column whatsapp_consent boolean;

-- ---------- Configuración de mensajería por clínica ----------
create table messaging_settings (
    clinic_id         uuid primary key references clinic (id),
    reminders_enabled boolean     not null default false,
    -- Cuántas horas antes de la cita se envía el recordatorio.
    hours_before      integer     not null default 24 check (hours_before between 2 and 72),
    updated_by        uuid references app_user (id),
    updated_at        timestamptz not null default now()
);

alter table messaging_settings enable row level security;
create policy tenant_isolation on messaging_settings
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());

-- ---------- Mensajes (salientes y entrantes) ----------
-- OUT: recordatorios y respuestas automáticas · IN: respuestas del paciente.
-- Un mensaje entrante se procesa en segundo plano: se interpreta (botón, IA o reglas) y,
-- si la intención es clara, se confirma o cancela la cita; si no, queda para recepción.
create table message (
    id                     uuid primary key,
    clinic_id              uuid          not null references clinic (id),
    patient_id             uuid references patient (id),
    appointment_id         uuid references appointment (id),
    direction              varchar(3)    not null check (direction in ('OUT', 'IN')),
    kind                   varchar(12)   not null check (kind in ('REMINDER', 'REPLY', 'INBOUND')),
    phone                  varchar(20)   not null,
    body                   varchar(2000) not null,
    template               varchar(80),
    status                 varchar(12)   not null check (status in ('SENT', 'SIMULATED', 'FAILED', 'RECEIVED', 'PROCESSED')),
    provider_message_id    varchar(150),
    -- Mensaje al que responde (id del proveedor), cuando el paciente usa "responder" o un botón.
    reply_to_provider_id   varchar(150),
    error                  varchar(500),
    -- Para no repetir recordatorios: uno por cita y fecha (si se reprograma, se envía otro).
    appointment_starts_at  timestamptz,
    intent                 varchar(12) check (intent in ('CONFIRM', 'CANCEL', 'RESCHEDULE', 'QUESTION', 'OTHER')),
    intent_source          varchar(8) check (intent_source in ('BUTTON', 'AI', 'RULES')),
    intent_summary         varchar(300),
    action                 varchar(30),
    needs_attention        boolean       not null default false,
    resolved_by            uuid references app_user (id),
    resolved_at            timestamptz,
    created_at             timestamptz   not null default now(),
    processed_at           timestamptz
);
create index ix_message_clinic on message (clinic_id, created_at desc);
create index ix_message_attention on message (clinic_id) where needs_attention and resolved_at is null;
create index ix_message_phone on message (phone, created_at desc);
create unique index ux_message_reminder on message (appointment_id, appointment_starts_at) where kind = 'REMINDER';
-- Meta puede reenviar el mismo webhook: un mensaje entrante se guarda una sola vez.
create unique index ux_message_inbound on message (provider_message_id) where direction = 'IN';
create index ix_message_provider on message (provider_message_id) where direction = 'OUT';

alter table message enable row level security;
create policy tenant_isolation on message
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());
revoke delete on message from ${app_role};
