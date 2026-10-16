-- Documentos que el profesional emite y firma en un solo paso: incapacidades, remisiones, órdenes y constancias.
-- Quedan fijos (no se editan ni se borran) con copia del membrete, del paciente y de la firma, y una huella de integridad.
create table issued_document (
    id                   uuid primary key,
    clinic_id            uuid          not null references clinic (id),
    patient_id           uuid          not null references patient (id),
    kind                 varchar(16)   not null check (kind in ('DISABILITY', 'REFERRAL', 'ORDER', 'CERTIFICATE')),
    title                varchar(150)  not null,
    body                 varchar(10000) not null,
    author_id            uuid          not null references app_user (id),
    professional_name    varchar(150)  not null,
    registration         varchar(120)  not null,
    signature_id         uuid          not null references document_asset (id),
    patient_name         varchar(250)  not null,
    patient_identification varchar(40) not null,
    patient_birth_date   date          not null,
    clinic_snapshot      text          not null,
    issued_at            timestamptz   not null,
    content_hash         varchar(64)   not null,
    created_at           timestamptz   not null default now()
);
create index ix_issued_document_patient on issued_document (patient_id, issued_at desc);

alter table issued_document enable row level security;
create policy tenant_isolation on issued_document
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());
revoke update, delete on issued_document from ${app_role};
