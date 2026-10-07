-- Historia clínica odontológica (Res. 1995 de 1999): antecedentes, evoluciones firmadas y odontograma.
-- Regla central: lo que se firma o registra no se edita ni se borra; se corrige agregando.

-- ---------- Catálogo CIE-10 ----------
-- Global (igual para todas las clínicas): sin clinic_id ni RLS, y la app solo lo lee.
-- Código sin punto, como lo pide RIPS (K021 = K02.1). Catálogo inicial odontológico;
-- en la Fase 6 se carga la tabla oficial completa de SISPRO.
create table icd10 (
    code        varchar(4)   primary key,
    description varchar(250) not null,
    -- Minúsculas y sin tildes para buscar "erupcion" y encontrar "erupción".
    search_key  varchar(260) generated always as (
        translate(lower(code || ' ' || description), 'áéíóúüñ', 'aeiouun')) stored
);
revoke insert, update, delete on icd10 from ${app_role};

insert into icd10 (code, description) values
    ('K000', 'Anodoncia'),
    ('K001', 'Dientes supernumerarios'),
    ('K002', 'Anomalías del tamaño y de la forma del diente'),
    ('K003', 'Dientes moteados'),
    ('K004', 'Alteraciones en la formación dentaria'),
    ('K005', 'Alteraciones hereditarias de la estructura dentaria, no clasificadas en otra parte'),
    ('K006', 'Alteraciones en la erupción dentaria'),
    ('K007', 'Síndrome de la erupción dentaria'),
    ('K008', 'Otros trastornos del desarrollo de los dientes'),
    ('K009', 'Trastorno del desarrollo de los dientes, no especificado'),
    ('K010', 'Dientes incluidos'),
    ('K011', 'Dientes impactados'),
    ('K020', 'Caries limitada al esmalte'),
    ('K021', 'Caries de la dentina'),
    ('K022', 'Caries del cemento'),
    ('K023', 'Caries dentaria detenida'),
    ('K024', 'Odontoclasia'),
    ('K028', 'Otras caries dentales'),
    ('K029', 'Caries dental, no especificada'),
    ('K030', 'Atrición excesiva de los dientes'),
    ('K031', 'Abrasión de los dientes'),
    ('K032', 'Erosión de los dientes'),
    ('K033', 'Reabsorción patológica de los dientes'),
    ('K034', 'Hipercementosis'),
    ('K035', 'Anquilosis dental'),
    ('K036', 'Depósitos [acreciones] en los dientes'),
    ('K037', 'Cambios posteruptivos del color de los tejidos dentales duros'),
    ('K038', 'Otras enfermedades especificadas de los tejidos duros de los dientes'),
    ('K039', 'Enfermedad no especificada de los tejidos duros de los dientes'),
    ('K040', 'Pulpitis'),
    ('K041', 'Necrosis de la pulpa'),
    ('K042', 'Degeneración de la pulpa'),
    ('K043', 'Formación anormal de tejido duro en la pulpa'),
    ('K044', 'Periodontitis apical aguda originada en la pulpa'),
    ('K045', 'Periodontitis apical crónica'),
    ('K046', 'Absceso periapical con fístula'),
    ('K047', 'Absceso periapical sin fístula'),
    ('K048', 'Quiste radicular'),
    ('K049', 'Otras enfermedades y las no especificadas de la pulpa y del tejido periapical'),
    ('K050', 'Gingivitis aguda'),
    ('K051', 'Gingivitis crónica'),
    ('K052', 'Periodontitis aguda'),
    ('K053', 'Periodontitis crónica'),
    ('K054', 'Periodontosis'),
    ('K055', 'Otras enfermedades periodontales'),
    ('K056', 'Enfermedad del periodonto, no especificada'),
    ('K060', 'Retracción gingival'),
    ('K061', 'Hiperplasia gingival'),
    ('K062', 'Lesiones de la encía y de la zona edéntula del reborde alveolar asociadas con traumatismo'),
    ('K068', 'Otros trastornos especificados de la encía y de la zona edéntula del reborde alveolar'),
    ('K070', 'Anomalías evidentes del tamaño de los maxilares'),
    ('K071', 'Anomalías de la relación maxilobasilar'),
    ('K072', 'Anomalías de la relación entre los arcos dentarios'),
    ('K073', 'Anomalías de la posición del diente'),
    ('K074', 'Maloclusión de tipo no especificado'),
    ('K076', 'Trastornos de la articulación temporomaxilar'),
    ('K080', 'Exfoliación de los dientes debida a causas sistémicas'),
    ('K081', 'Pérdida de dientes debida a accidente, extracción o enfermedad periodontal local'),
    ('K082', 'Atrofia del reborde alveolar desdentado'),
    ('K083', 'Raíz dental retenida'),
    ('K088', 'Otras afecciones especificadas de los dientes y de sus estructuras de sostén'),
    ('K089', 'Trastorno de los dientes y de sus estructuras de sostén, no especificado'),
    ('K090', 'Quistes originados por el desarrollo de los dientes'),
    ('K102', 'Afecciones inflamatorias de los maxilares'),
    ('K103', 'Alveolitis del maxilar'),
    ('K115', 'Sialolitiasis'),
    ('K120', 'Estomatitis aftosa recurrente'),
    ('K121', 'Otras formas de estomatitis'),
    ('K122', 'Celulitis y absceso de boca'),
    ('K130', 'Enfermedades de los labios'),
    ('K132', 'Leucoplasia y otras alteraciones del epitelio bucal, incluyendo la lengua'),
    ('K137', 'Otras lesiones y las no especificadas de la mucosa bucal'),
    ('K140', 'Glositis'),
    ('K146', 'Glosodinia'),
    ('S025', 'Fractura de los dientes'),
    ('S032', 'Luxación de diente'),
    ('Z012', 'Examen odontológico'),
    ('Z463', 'Prueba y ajuste de prótesis dental'),
    ('Z464', 'Prueba y ajuste de dispositivo ortodóntico');

-- ---------- Antecedentes (anamnesis) ----------
-- Uno por paciente; se edita, y Envers guarda cada versión.
create table clinical_background (
    id               uuid primary key,
    clinic_id        uuid          not null references clinic (id),
    patient_id       uuid          not null unique references patient (id),
    -- Valores de los enums MedicalCondition y Habit.
    conditions       varchar(30)[] not null default '{}',
    habits           varchar(30)[] not null default '{}',
    allergies        varchar(500),
    medications      varchar(500),
    surgical_history varchar(500),
    family_history   varchar(500),
    observations     varchar(1000),
    updated_by       uuid references app_user (id),
    created_at       timestamptz   not null default now(),
    updated_at       timestamptz   not null default now()
);

alter table clinical_background enable row level security;
create policy tenant_isolation on clinical_background
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());

create table clinical_background_aud (
    id               uuid   not null,
    rev              bigint not null references audit_revision (id),
    revtype          smallint,
    clinic_id        uuid,
    patient_id       uuid,
    conditions       varchar(30)[],
    habits           varchar(30)[],
    allergies        varchar(500),
    medications      varchar(500),
    surgical_history varchar(500),
    family_history   varchar(500),
    observations     varchar(1000),
    updated_by       uuid,
    primary key (id, rev)
);

alter table clinical_background_aud enable row level security;
create policy tenant_isolation on clinical_background_aud
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());

revoke update, delete on clinical_background_aud from ${app_role};

-- ---------- Evoluciones ----------
-- Una atención: borrador mientras se escribe; al firmarla queda inmutable.
-- Los diagnósticos siguen la estructura de RIPS: uno principal (con su tipo) y hasta tres relacionados.
create table clinical_note (
    id                  uuid primary key,
    clinic_id           uuid        not null references clinic (id),
    patient_id          uuid        not null references patient (id),
    dentist_id          uuid        not null references app_user (id),
    appointment_id      uuid references appointment (id),
    attended_at         timestamptz not null,
    reason              varchar(500),
    current_illness     varchar(2000),
    examination         varchar(4000),
    diagnosis_main      varchar(4) references icd10 (code),
    diagnosis_type      varchar(20) check (diagnosis_type in ('IMPRESSION', 'CONFIRMED_NEW', 'CONFIRMED_REPEAT')),
    diagnosis_related1  varchar(4) references icd10 (code),
    diagnosis_related2  varchar(4) references icd10 (code),
    diagnosis_related3  varchar(4) references icd10 (code),
    procedures          varchar(4000),
    plan                varchar(2000),
    signed_at           timestamptz,
    -- SHA-256 del contenido al firmar: permite detectar si alguien lo alteró por fuera de la app.
    content_hash        varchar(64),
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    check ((signed_at is null) = (content_hash is null)),
    -- Para firmar hace falta al menos el motivo y el diagnóstico principal.
    check (signed_at is null or (reason is not null and diagnosis_main is not null and diagnosis_type is not null))
);
create index ix_clinical_note_patient on clinical_note (patient_id, attended_at desc);
create index ix_clinical_note_dentist on clinical_note (dentist_id, signed_at);
-- Una cita tiene como máximo una evolución.
create unique index ux_clinical_note_appointment on clinical_note (appointment_id) where appointment_id is not null;

alter table clinical_note enable row level security;
create policy tenant_isolation on clinical_note
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());

-- La BD garantiza la inmutabilidad: una evolución firmada no se puede modificar ni borrar,
-- aunque el código tenga un error o alguien use SQL directo con el rol de la app.
create function forbid_signed_note_change() returns trigger
    language plpgsql
as $$
begin
    if old.signed_at is not null then
        raise exception 'La evolución % está firmada y no se puede modificar', old.id
            using errcode = 'integrity_constraint_violation';
    end if;
    return case when tg_op = 'DELETE' then old else new end;
end
$$;

create trigger tg_clinical_note_immutable
    before update or delete on clinical_note
    for each row execute function forbid_signed_note_change();

create table clinical_note_aud (
    id                 uuid   not null,
    rev                bigint not null references audit_revision (id),
    revtype            smallint,
    clinic_id          uuid,
    patient_id         uuid,
    dentist_id         uuid,
    appointment_id     uuid,
    attended_at        timestamptz,
    reason             varchar(500),
    current_illness    varchar(2000),
    examination        varchar(4000),
    diagnosis_main     varchar(4),
    diagnosis_type     varchar(20),
    diagnosis_related1 varchar(4),
    diagnosis_related2 varchar(4),
    diagnosis_related3 varchar(4),
    procedures         varchar(4000),
    plan               varchar(2000),
    signed_at          timestamptz,
    content_hash       varchar(64),
    primary key (id, rev)
);

alter table clinical_note_aud enable row level security;
create policy tenant_isolation on clinical_note_aud
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());

revoke update, delete on clinical_note_aud from ${app_role};

-- Notas aclaratorias: la única forma de corregir o complementar una evolución firmada.
create table clinical_note_addendum (
    id         uuid primary key,
    clinic_id  uuid          not null references clinic (id),
    note_id    uuid          not null references clinical_note (id),
    author_id  uuid          not null references app_user (id),
    text       varchar(2000) not null,
    created_at timestamptz   not null default now()
);
create index ix_clinical_note_addendum_note on clinical_note_addendum (note_id, created_at);

alter table clinical_note_addendum enable row level security;
create policy tenant_isolation on clinical_note_addendum
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());

revoke update, delete on clinical_note_addendum from ${app_role};

-- ---------- Odontograma ----------
-- Cada hallazgo o tratamiento es una fila. Nunca se borra: al quitarlo se marca removed_at,
-- así se puede reconstruir el odontograma de cualquier fecha.
-- Dientes en notación FDI: permanentes 11–48, temporales 51–85.
-- Superficies: O oclusal/incisal, M mesial, D distal, V vestibular, L lingual/palatino; null = todo el diente.
create table odontogram_entry (
    id               uuid primary key,
    clinic_id        uuid        not null references clinic (id),
    patient_id       uuid        not null references patient (id),
    tooth            smallint    not null check (
        (tooth / 10 between 1 and 4 and tooth % 10 between 1 and 8)
        or (tooth / 10 between 5 and 8 and tooth % 10 between 1 and 5)),
    surface          varchar(1) check (surface in ('O', 'M', 'D', 'V', 'L')),
    condition        varchar(30) not null,
    note             varchar(200),
    created_by       uuid        not null references app_user (id),
    created_at       timestamptz not null default now(),
    removed_at       timestamptz,
    removed_by       uuid references app_user (id),
    check ((removed_at is null) = (removed_by is null))
);
create index ix_odontogram_patient on odontogram_entry (patient_id, created_at);
-- Una superficie tiene un solo estado vigente…
create unique index ux_odontogram_surface on odontogram_entry (patient_id, tooth, surface)
    where removed_at is null and surface is not null;
-- …y una condición de diente completo no se repite en el mismo diente.
create unique index ux_odontogram_tooth on odontogram_entry (patient_id, tooth, condition)
    where removed_at is null and surface is null;

alter table odontogram_entry enable row level security;
create policy tenant_isolation on odontogram_entry
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());

revoke delete on odontogram_entry from ${app_role};
