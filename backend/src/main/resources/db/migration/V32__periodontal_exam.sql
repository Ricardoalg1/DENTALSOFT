-- El periodontograma deja de vivir dentro de una evolución: es un examen propio del paciente,
-- y un paciente puede tener varios (controles en el tiempo). Mismo ciclo que una evolución:
-- borrador editable por su autor y, al firmarlo, inmutable con un hash de su contenido.
create table periodontal_exam (
    id           uuid primary key,
    clinic_id    uuid          not null references clinic (id),
    patient_id   uuid          not null references patient (id),
    dentist_id   uuid          not null references app_user (id),
    examined_at  timestamptz   not null,
    observations varchar(1000),
    data         jsonb         not null check (jsonb_typeof(data) = 'object'),
    signed_at    timestamptz,
    -- SHA-256 calculado por periodontal_exam_hash(): permite detectar cambios hechos por fuera de la app.
    content_hash varchar(64),
    created_at   timestamptz   not null default now(),
    updated_at   timestamptz   not null default now(),
    check ((signed_at is null) = (content_hash is null))
);
create index ix_periodontal_exam_patient on periodontal_exam (patient_id, examined_at desc);
create index ix_periodontal_exam_dentist on periodontal_exam (dentist_id, signed_at);

alter table periodontal_exam enable row level security;
create policy tenant_isolation on periodontal_exam
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());

-- Contenido canónico del examen. Las fechas van como época para no depender de la zona horaria de la sesión;
-- data::text es la forma normalizada de jsonb, así que el hash se recalcula igual al leer.
create function periodontal_exam_hash(e periodontal_exam) returns varchar
    language sql immutable
as $$
    select encode(sha256(convert_to(concat_ws(chr(31),
        e.id::text, e.patient_id::text, e.dentist_id::text,
        extract(epoch from e.examined_at)::text, coalesce(e.observations, ''), e.data::text,
        extract(epoch from e.signed_at)::text), 'UTF8')), 'hex')
$$;

-- Los periodontogramas que se registraron dentro de evoluciones pasan a ser exámenes propios,
-- con la fecha, el profesional y el estado (borrador o firmado) de su evolución.
-- El hash necesita la fila completa: se inserta un marcador y se calcula justo después.
insert into periodontal_exam (id, clinic_id, patient_id, dentist_id, examined_at, data, signed_at, content_hash,
                              created_at, updated_at)
select gen_random_uuid(), pc.clinic_id, pc.patient_id, n.dentist_id, n.attended_at, pc.data, n.signed_at,
       case when n.signed_at is not null then 'pending' end, pc.created_at, pc.updated_at
from periodontal_chart pc
join clinical_note n on n.id = pc.note_id;

update periodontal_exam e set content_hash = periodontal_exam_hash(e) where e.signed_at is not null;

drop table periodontal_chart;
drop function forbid_signed_chart_change();

-- La inmutabilidad se activa después de migrar (el hash de los firmados se calcula arriba).
create function forbid_signed_exam_change() returns trigger
    language plpgsql
as $$
begin
    if old.signed_at is not null then
        raise exception 'El periodontograma % está firmado y no se puede modificar', old.id
            using errcode = 'integrity_constraint_violation';
    end if;
    return case when tg_op = 'DELETE' then old else new end;
end
$$;

create trigger tg_periodontal_exam_immutable
    before update or delete on periodontal_exam
    for each row execute function forbid_signed_exam_change();
