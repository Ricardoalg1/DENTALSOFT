-- Aislamiento entre clínicas a nivel de base de datos (Row-Level Security).
-- La app se conecta como ${app_role} (sin privilegios de dueño), así que estas políticas le aplican siempre,
-- aunque una consulta en el código olvide filtrar por clinic_id.

grant usage on schema public to ${app_role};
grant select, insert, update, delete on clinic, site, app_user to ${app_role};
-- Tablas que creen futuras migraciones (corren con el rol dueño) heredan los mismos permisos.
alter default privileges in schema public grant select, insert, update, delete on tables to ${app_role};
alter default privileges in schema public grant usage, select on sequences to ${app_role};

-- Valores que TenantAwareDataSource fija en cada conexión.
create function app_current_clinic() returns uuid
    language sql stable
as $$ select nullif(current_setting('app.clinic_id', true), '')::uuid $$;

create function app_rls_bypass() returns boolean
    language sql stable
as $$ select coalesce(current_setting('app.bypass_rls', true), '') = 'on' $$;

alter table clinic enable row level security;
create policy tenant_isolation on clinic
    using (app_rls_bypass() or id = app_current_clinic())
    with check (app_rls_bypass() or id = app_current_clinic());

alter table site enable row level security;
create policy tenant_isolation on site
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());

alter table app_user enable row level security;
create policy tenant_isolation on app_user
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());
