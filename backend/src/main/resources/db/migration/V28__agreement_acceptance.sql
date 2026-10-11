-- Aceptación electrónica del acuerdo de encargo de tratamiento de datos entre Occlus y cada clínica.
-- Es evidencia (Ley 527 de 1999): quién aceptó, cuándo, qué versión y desde dónde. No se edita ni se borra.
create table clinic_agreement_acceptance (
    id          uuid primary key,
    clinic_id   uuid         not null references clinic (id),
    user_id     uuid         not null references app_user (id),
    version     varchar(30)  not null,
    accepted_at timestamptz  not null default now(),
    ip          varchar(64),
    user_agent  varchar(300),
    unique (clinic_id, version)
);

alter table clinic_agreement_acceptance enable row level security;
create policy tenant_isolation on clinic_agreement_acceptance
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());
revoke update, delete on clinic_agreement_acceptance from ${app_role};
