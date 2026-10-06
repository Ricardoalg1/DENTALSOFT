-- btree_gist permite combinar "=" (mismo profesional) con "&&" (rangos que se cruzan) en una restricción.
create extension if not exists btree_gist;

-- Quién atiende pacientes (aparece en la agenda). Un ADMIN puede ser también odontólogo.
alter table app_user add column professional boolean not null default false;
update app_user set professional = true where role in ('DENTIST', 'ADMIN');

-- Horario semanal de atención por profesional y sede. day_of_week: 1 = lunes … 7 = domingo (ISO).
create table dentist_schedule (
    id          uuid primary key,
    clinic_id   uuid     not null references clinic (id),
    dentist_id  uuid     not null references app_user (id),
    site_id     uuid     not null references site (id),
    day_of_week smallint not null check (day_of_week between 1 and 7),
    start_time  time     not null,
    end_time    time     not null,
    check (end_time > start_time)
);
create index ix_dentist_schedule_dentist on dentist_schedule (dentist_id, day_of_week);

alter table dentist_schedule enable row level security;
create policy tenant_isolation on dentist_schedule
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());

create table appointment (
    id                  uuid primary key,
    clinic_id           uuid          not null references clinic (id),
    site_id             uuid          not null references site (id),
    dentist_id          uuid          not null references app_user (id),
    patient_id          uuid          not null references patient (id),
    starts_at           timestamptz   not null,
    ends_at             timestamptz   not null,
    status              varchar(12)   not null
        check (status in ('SCHEDULED', 'CONFIRMED', 'ATTENDED', 'NO_SHOW', 'CANCELLED')),
    reason              varchar(200),
    notes               varchar(1000),
    cancellation_reason varchar(200),
    created_by          uuid references app_user (id),
    created_at          timestamptz   not null default now(),
    updated_at          timestamptz   not null default now(),
    check (ends_at > starts_at),
    -- Un profesional no puede tener dos citas activas que se crucen. Lo garantiza Postgres,
    -- incluso si dos recepcionistas agendan al mismo tiempo.
    constraint ex_appointment_dentist_overlap exclude using gist (
        dentist_id with =,
        tstzrange(starts_at, ends_at) with &&
    ) where (status <> 'CANCELLED')
);
create index ix_appointment_clinic_start on appointment (clinic_id, starts_at);
create index ix_appointment_patient on appointment (patient_id, starts_at);

alter table appointment enable row level security;
create policy tenant_isolation on appointment
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());

-- Auditoría de citas (quién reprogramó o canceló).
create table appointment_aud (
    id                  uuid   not null,
    rev                 bigint not null references audit_revision (id),
    revtype             smallint,
    clinic_id           uuid,
    site_id             uuid,
    dentist_id          uuid,
    patient_id          uuid,
    starts_at           timestamptz,
    ends_at             timestamptz,
    status              varchar(12),
    reason              varchar(200),
    notes               varchar(1000),
    cancellation_reason varchar(200),
    primary key (id, rev)
);

alter table appointment_aud enable row level security;
create policy tenant_isolation on appointment_aud
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());

revoke update, delete on appointment_aud from ${app_role};
