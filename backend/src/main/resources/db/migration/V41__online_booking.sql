-- ---------- Reserva de citas en línea ----------
-- Una solicitud pública nunca toca al paciente ni su historia: vive aquí hasta que la clínica la aprueba.

create table online_booking_settings (
    clinic_id        uuid primary key references clinic (id),
    slug             varchar(60) not null,
    enabled          boolean     not null default false,
    visit_types      text[]      not null default '{FIRST_VISIT,CONTROL}',
    dentist_ids      uuid[]      not null default '{}',
    duration_minutes smallint    not null default 30 check (duration_minutes between 10 and 240),
    min_notice_hours smallint    not null default 4 check (min_notice_hours between 0 and 720),
    max_days_ahead   smallint    not null default 30 check (max_days_ahead between 1 and 90),
    updated_at       timestamptz not null default now(),
    constraint ux_online_booking_slug unique (slug)
);

create table online_booking_request (
    id                uuid primary key default gen_random_uuid(),
    clinic_id         uuid         not null references clinic (id),
    dentist_id        uuid         not null references app_user (id),
    site_id           uuid         not null references site (id),
    starts_at         timestamptz  not null,
    ends_at           timestamptz  not null,
    visit_type        varchar(20)  not null,
    status            varchar(10)  not null default 'HOLD'
        check (status in ('HOLD', 'PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'EXPIRED')),
    hold_token_hash   varchar(64),
    hold_expires_at   timestamptz  not null,
    full_name         varchar(120),
    phone             varchar(30),
    email             varchar(160),
    channel           varchar(10)  check (channel in ('EMAIL', 'WHATSAPP')),
    -- Correo o celular normalizado al que se envió el código: con él se limita el abuso entre clínicas.
    verify_target     varchar(160),
    code_hash         varchar(64),
    code_attempts     integer      not null default 0,
    code_sends        integer      not null default 0,
    code_sent_at      timestamptz,
    verified_at       timestamptz,
    consent_version   varchar(30),
    consent_at        timestamptz,
    manage_token_hash varchar(64),
    appointment_id    uuid references appointment (id),
    patient_id        uuid references patient (id),
    decided_by        uuid references app_user (id),
    decided_at        timestamptz,
    decision_reason   varchar(200),
    created_at        timestamptz  not null default now(),
    check (ends_at > starts_at),
    -- Dos personas no pueden apartar la misma hora, ni siquiera al mismo tiempo.
    constraint ex_online_booking_overlap exclude using gist (
        dentist_id with =,
        tstzrange(starts_at, ends_at) with &&
    ) where (status in ('HOLD', 'PENDING'))
);
create index ix_online_booking_clinic on online_booking_request (clinic_id, status, starts_at);
create index ix_online_booking_target on online_booking_request (verify_target, created_at);
create unique index ux_online_booking_hold on online_booking_request (hold_token_hash) where hold_token_hash is not null;
create unique index ux_online_booking_manage on online_booking_request (manage_token_hash) where manage_token_hash is not null;

alter table online_booking_settings enable row level security;
create policy tenant_isolation on online_booking_settings
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());

alter table online_booking_request enable row level security;
create policy tenant_isolation on online_booking_request
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());
