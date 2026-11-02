-- Tipo de cita (primera vez, control, tratamiento, promoción y prevención) y, por clínica, el mensaje de
-- WhatsApp con el que se invita al paciente a cada tipo. Sin fila: se usa el mensaje predeterminado.
alter table appointment
    add column visit_type varchar(12) check (visit_type in ('FIRST_VISIT', 'CONTROL', 'TREATMENT', 'PREVENTION'));
alter table appointment_aud add column visit_type varchar(12);

create table appointment_message_template (
    clinic_id  uuid          not null references clinic (id),
    visit_type varchar(12)   not null check (visit_type in ('FIRST_VISIT', 'CONTROL', 'TREATMENT', 'PREVENTION')),
    body       varchar(2000) not null,
    updated_by uuid references app_user (id),
    updated_at timestamptz   not null default now(),
    primary key (clinic_id, visit_type)
);

alter table appointment_message_template enable row level security;
create policy tenant_isolation on appointment_message_template
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());
