-- Periodontograma ligado a una evolución: sondaje, recesión, sangrado y placa por sitio.
-- Vive y muere con su evolución: editable mientras es borrador, inmutable cuando se firma.
create table periodontal_chart (
    note_id    uuid primary key references clinical_note (id) on delete cascade,
    clinic_id  uuid        not null references clinic (id),
    patient_id uuid        not null references patient (id),
    data       jsonb       not null check (jsonb_typeof(data) = 'object'),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index ix_periodontal_chart_patient on periodontal_chart (patient_id, created_at desc);

alter table periodontal_chart enable row level security;
create policy tenant_isolation on periodontal_chart
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());

-- Igual que la evolución: con la evolución firmada, el periodontograma no se toca,
-- aunque el código tenga un error o alguien use SQL directo con el rol de la app.
-- Al borrar un borrador la evolución ya no existe cuando se borra el periodontograma (cascade) y se permite.
create function forbid_signed_chart_change() returns trigger
    language plpgsql
as $$
declare
    target uuid := case when tg_op = 'DELETE' then old.note_id else new.note_id end;
begin
    if exists (select 1 from clinical_note where id = target and signed_at is not null) then
        raise exception 'La evolución % está firmada y su periodontograma no se puede modificar', target
            using errcode = 'integrity_constraint_violation';
    end if;
    return case when tg_op = 'DELETE' then old else new end;
end
$$;

create trigger tg_periodontal_chart_immutable
    before insert or update or delete on periodontal_chart
    for each row execute function forbid_signed_chart_change();
