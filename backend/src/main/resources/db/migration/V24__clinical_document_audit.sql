-- Eventos de exportación/correo sin almacenar contenido clínico ni destinatario en logs.
create table clinical_document_event (
    id uuid primary key,
    clinic_id uuid not null references clinic(id),
    patient_id uuid not null references patient(id),
    actor_id uuid not null references app_user(id),
    operation_id uuid not null,
    kind varchar(20) not null check (kind in ('PDF','JSON','PRINT','EMAIL')),
    status varchar(20) not null check (status in ('GENERATED','ATTEMPTED','ACCEPTED','UNCERTAIN')),
    created_at timestamptz not null default now()
);
create index clinical_document_event_patient on clinical_document_event(clinic_id,patient_id,created_at desc);
create unique index clinical_document_email_once on clinical_document_event(clinic_id,operation_id) where kind='EMAIL' and status='ATTEMPTED';
alter table clinical_document_event enable row level security;
create policy tenant_isolation on clinical_document_event using (clinic_id=app_current_clinic()) with check(clinic_id=app_current_clinic());
grant select,insert on clinical_document_event to ${app_role};
revoke update,delete on clinical_document_event from ${app_role};
