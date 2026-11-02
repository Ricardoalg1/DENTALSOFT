-- Migración desde otros programas odontológicos: pacientes, historia clínica anterior y documentos.

-- ---------- Lotes de importación ----------
-- Cada importación (un archivo de Excel/CSV o una carpeta de documentos) es un lote: deja constancia de
-- quién importó qué, desde qué programa y con qué resultado.
create table migration_batch (
    id            uuid primary key,
    clinic_id     uuid         not null references clinic (id),
    kind          varchar(20)  not null check (kind in ('PATIENTS', 'CLINICAL_RECORDS', 'DOCUMENTS')),
    source_system varchar(80)  not null,
    file_name     varchar(255),
    created_by    uuid         not null references app_user (id),
    created_at    timestamptz  not null default now(),
    created_count integer      not null default 0,
    updated_count integer      not null default 0,
    skipped_count integer      not null default 0,
    error_count   integer      not null default 0,
    -- Anulación (solo historia clínica anterior): los registros quedan guardados pero ocultos.
    voided_at     timestamptz,
    voided_by     uuid references app_user (id),
    void_reason   varchar(300),
    check ((voided_at is null) = (voided_by is null))
);
create index ix_migration_batch_clinic on migration_batch (clinic_id, created_at desc);

alter table migration_batch enable row level security;
create policy tenant_isolation on migration_batch
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());

revoke delete on migration_batch from ${app_role};

-- ---------- Historia clínica anterior ----------
-- Registros traídos del programa anterior, tal como venían: no son evoluciones de Occlus (no las firmó
-- un usuario de aquí), por eso viven aparte y conservan el nombre del profesional original como texto.
-- Son de solo lectura: la app solo puede insertarlas y anularlas (columnas voided_*), nunca editarlas.
create table legacy_clinical_record (
    id                    uuid primary key,
    clinic_id             uuid          not null references clinic (id),
    patient_id            uuid          not null references patient (id),
    batch_id              uuid          not null references migration_batch (id),
    source_system         varchar(80)   not null,
    attended_at           timestamptz   not null,
    -- El archivo traía solo la fecha (sin hora).
    date_only             boolean       not null,
    record_type           varchar(80),
    professional_name     varchar(150),
    reason                varchar(2000),
    diagnosis_code        varchar(10),
    diagnosis_description varchar(500),
    description           text check (char_length(description) <= 20000),
    procedures            varchar(4000),
    plan                  varchar(4000),
    -- SHA-256 del contenido: detecta alteraciones y evita importar dos veces el mismo registro.
    content_hash          varchar(64)   not null,
    imported_by           uuid          not null references app_user (id),
    imported_at           timestamptz   not null default now(),
    voided_at             timestamptz,
    voided_by             uuid references app_user (id),
    void_reason           varchar(300),
    check ((voided_at is null) = (voided_by is null))
);
create index ix_legacy_record_patient on legacy_clinical_record (patient_id, attended_at desc);
create index ix_legacy_record_batch on legacy_clinical_record (batch_id);
create unique index ux_legacy_record_content on legacy_clinical_record (patient_id, content_hash)
    where voided_at is null;

alter table legacy_clinical_record enable row level security;
create policy tenant_isolation on legacy_clinical_record
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());

revoke update, delete on legacy_clinical_record from ${app_role};
grant update (voided_at, voided_by, void_reason) on legacy_clinical_record to ${app_role};

-- Archivos importados: buscar duplicados por contenido al volver a cargar la misma carpeta.
create index ix_patient_file_sha on patient_file (patient_id, sha256);
