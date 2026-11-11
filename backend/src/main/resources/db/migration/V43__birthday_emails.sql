-- Correos de cumpleaños: solo a pacientes que lo autorizaron y solo en clínicas que lo activaron.

-- Autorización del paciente (con fecha, como soporte ante la SIC), igual que la de WhatsApp.
alter table patient add column birthday_email_consent boolean not null default false;
alter table patient add column birthday_email_consent_at timestamptz;
alter table patient_aud add column birthday_email_consent boolean;
alter table patient_aud add column birthday_email_consent_at timestamptz;

-- Interruptor de la clínica: apagado por defecto.
alter table clinic add column birthday_emails_enabled boolean not null default false;

-- Un saludo por paciente y año: evita duplicados aunque la tarea corra dos veces. Guarda solo el
-- SHA-256 del enlace para dejar de recibirlos; el enlace en sí va únicamente en el correo.
create table birthday_email (
    clinic_id        uuid        not null references clinic (id),
    patient_id       uuid        not null references patient (id),
    year             integer     not null,
    sent_at          timestamptz not null default now(),
    optout_token_hash varchar(64) not null unique,
    primary key (patient_id, year)
);

create index birthday_email_clinic on birthday_email (clinic_id);

alter table birthday_email enable row level security;
create policy tenant_isolation on birthday_email
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());
