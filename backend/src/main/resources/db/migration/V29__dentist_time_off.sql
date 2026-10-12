-- Días y franjas en que un profesional no atiende (vacaciones, festivos, permisos, jornadas especiales).
-- Sin hora = todo el día. Se aplican además del horario semanal.
create table dentist_time_off (
    id         uuid primary key,
    clinic_id  uuid         not null references clinic (id),
    dentist_id uuid         not null references app_user (id),
    from_date  date         not null,
    to_date    date         not null,
    start_time time,
    end_time   time,
    reason     varchar(120) not null default '',
    created_at timestamptz  not null default now(),
    check (to_date >= from_date),
    check ((start_time is null) = (end_time is null)),
    check (end_time is null or end_time > start_time)
);
create index ix_dentist_time_off_dentist on dentist_time_off (dentist_id, from_date);

alter table dentist_time_off enable row level security;
create policy tenant_isolation on dentist_time_off
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());
