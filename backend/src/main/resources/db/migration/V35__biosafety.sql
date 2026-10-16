-- Bioseguridad: registros de habilitación (esterilización, limpieza y desinfección, residuos RH1, temperatura y
-- humedad, mantenimiento de equipos y accidentes con riesgo biológico). Los campos propios de cada tipo van en
-- data (validados por la aplicación). Como los registros contables, no se editan ni se borran: se anulan con motivo.
create table biosafety_record (
    id             uuid primary key,
    clinic_id      uuid         not null references clinic (id),
    site_id        uuid         not null references site (id),
    kind           varchar(20)  not null check (kind in ('STERILIZATION', 'CLEANING', 'WASTE', 'ENVIRONMENT',
                                                         'MAINTENANCE', 'ACCIDENT')),
    record_date    date         not null,
    responsible_id uuid         not null references app_user (id),
    data           jsonb        not null check (jsonb_typeof(data) = 'object'),
    notes          varchar(500),
    created_by     uuid         not null references app_user (id),
    created_at     timestamptz  not null default now(),
    voided_at      timestamptz,
    voided_by      uuid references app_user (id),
    void_reason    varchar(300),
    check ((voided_at is null) = (voided_by is null)),
    check (voided_at is null or void_reason is not null)
);
create index ix_biosafety_kind_date on biosafety_record (clinic_id, kind, record_date desc);

alter table biosafety_record enable row level security;
create policy tenant_isolation on biosafety_record
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());
revoke delete on biosafety_record from ${app_role};

create function forbid_biosafety_change() returns trigger
    language plpgsql
as $$
begin
    if old.voided_at is not null then
        raise exception 'El registro % ya fue anulado', old.id using errcode = 'integrity_constraint_violation';
    end if;
    if (new.clinic_id, new.site_id, new.kind, new.record_date, new.responsible_id, new.data, new.notes,
        new.created_by, new.created_at)
       is distinct from
       (old.clinic_id, old.site_id, old.kind, old.record_date, old.responsible_id, old.data, old.notes,
        old.created_by, old.created_at) then
        raise exception 'Un registro de bioseguridad no se modifica; anúlalo y registra uno nuevo'
            using errcode = 'integrity_constraint_violation';
    end if;
    return new;
end
$$;

create trigger tg_biosafety_immutable
    before update on biosafety_record
    for each row execute function forbid_biosafety_change();
