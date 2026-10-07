-- ---------- Archivos del paciente ----------
-- El contenido vive en S3; aquí solo los metadatos. Nunca se borran: se ocultan con removed_at
-- (la historia clínica se conserva completa). Las firmas de consentimientos también son archivos.
create table patient_file (
    id                uuid primary key,
    clinic_id         uuid         not null references clinic (id),
    patient_id        uuid         not null references patient (id),
    category          varchar(20)  not null check (category in ('RADIOGRAPH', 'PHOTO', 'DOCUMENT', 'OTHER', 'SIGNATURE')),
    title             varchar(150) not null,
    original_filename varchar(255),
    content_type      varchar(100) not null,
    size_bytes        bigint       not null check (size_bytes > 0),
    -- SHA-256 del contenido: permite verificar que el archivo en S3 no cambió.
    sha256            varchar(64)  not null,
    storage_key       varchar(300) not null unique,
    uploaded_by       uuid         not null references app_user (id),
    created_at        timestamptz  not null default now(),
    removed_at        timestamptz,
    removed_by        uuid references app_user (id),
    removal_reason    varchar(200),
    check ((removed_at is null) = (removed_by is null)),
    check (category <> 'SIGNATURE' or removed_at is null)
);
create index ix_patient_file_patient on patient_file (patient_id, created_at desc);

alter table patient_file enable row level security;
create policy tenant_isolation on patient_file
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());

revoke delete on patient_file from ${app_role};

-- ---------- Plantillas de consentimiento ----------
-- Admiten marcadores que se reemplazan al firmar: {{paciente}}, {{documento}}, {{profesional}},
-- {{clinica}}, {{fecha}}, {{procedimiento}}.
create table consent_template (
    id         uuid primary key,
    clinic_id  uuid          not null references clinic (id),
    title      varchar(150)  not null,
    body       varchar(20000) not null,
    active     boolean       not null default true,
    created_at timestamptz   not null default now(),
    updated_at timestamptz   not null default now()
);
create index ix_consent_template_clinic on consent_template (clinic_id, title);

alter table consent_template enable row level security;
create policy tenant_isolation on consent_template
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());

-- ---------- Consentimientos firmados ----------
-- Guarda una copia del texto tal como se firmó (si la plantilla cambia después, este no).
create table consent (
    id                  uuid primary key,
    clinic_id           uuid           not null references clinic (id),
    patient_id          uuid           not null references patient (id),
    template_id         uuid references consent_template (id),
    title               varchar(150)   not null,
    body                varchar(20000) not null,
    procedure_detail    varchar(1000),
    signer_name         varchar(150)   not null,
    signer_document     varchar(30)    not null,
    -- "Paciente" o el parentesco del acudiente que firma.
    signer_relationship varchar(40)    not null,
    signature_file_id   uuid           not null references patient_file (id),
    professional_id     uuid           not null references app_user (id),
    signed_at           timestamptz    not null,
    content_hash        varchar(64)    not null,
    revoked_at          timestamptz,
    revoked_by          uuid references app_user (id),
    revocation_reason   varchar(500),
    created_at          timestamptz    not null default now(),
    check ((revoked_at is null) = (revoked_by is null)),
    check (revoked_at is null or revocation_reason is not null)
);
create index ix_consent_patient on consent (patient_id, signed_at desc);

alter table consent enable row level security;
create policy tenant_isolation on consent
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());

-- Un consentimiento firmado es inmutable: lo único permitido es revocarlo una vez
-- (el paciente puede retirar su consentimiento), y nunca se borra.
create function forbid_consent_change() returns trigger
    language plpgsql
as $$
begin
    if tg_op = 'DELETE' then
        raise exception 'El consentimiento % no se puede borrar', old.id
            using errcode = 'integrity_constraint_violation';
    end if;
    if old.revoked_at is not null then
        raise exception 'El consentimiento % ya fue revocado', old.id
            using errcode = 'integrity_constraint_violation';
    end if;
    if (new.clinic_id, new.patient_id, new.template_id, new.title, new.body, new.procedure_detail,
        new.signer_name, new.signer_document, new.signer_relationship, new.signature_file_id,
        new.professional_id, new.signed_at, new.content_hash, new.created_at)
       is distinct from
       (old.clinic_id, old.patient_id, old.template_id, old.title, old.body, old.procedure_detail,
        old.signer_name, old.signer_document, old.signer_relationship, old.signature_file_id,
        old.professional_id, old.signed_at, old.content_hash, old.created_at) then
        raise exception 'El contenido del consentimiento % no se puede modificar', old.id
            using errcode = 'integrity_constraint_violation';
    end if;
    return new;
end
$$;

create trigger tg_consent_immutable
    before update or delete on consent
    for each row execute function forbid_consent_change();
