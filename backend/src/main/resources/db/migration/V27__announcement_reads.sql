-- Lectura por persona de los avisos que el equipo de Occlus envía a las clínicas (campanita).
create table platform_announcement_read (
    announcement_id uuid        not null references platform_announcement (id),
    user_id         uuid        not null references app_user (id),
    clinic_id       uuid        not null references clinic (id),
    read_at         timestamptz not null default now(),
    primary key (announcement_id, user_id)
);
create index ix_announcement_read_user on platform_announcement_read (user_id);

alter table platform_announcement_read enable row level security;
create policy tenant_isolation on platform_announcement_read
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());
revoke update, delete on platform_announcement_read from ${app_role};
