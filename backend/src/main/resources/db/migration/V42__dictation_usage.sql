-- Minutos de dictado en línea (Groq) por clínica y mes: sirven para el tope de gasto. No guarda audio ni texto.
create table dictation_usage (
    clinic_id uuid    not null references clinic (id),
    month     date    not null,
    seconds   integer not null default 0 check (seconds >= 0),
    primary key (clinic_id, month)
);

alter table dictation_usage enable row level security;
create policy tenant_isolation on dictation_usage
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());

revoke delete on dictation_usage from ${app_role};
