-- Documentos internos previos a la emisión por un proveedor DIAN.
-- draft_number NO es un consecutivo de factura electrónica autorizado.
create table billing_profile (
    clinic_id uuid primary key references clinic(id),
    legal_name varchar(150) not null,
    nit varchar(15) not null,
    provider_code varchar(12) not null,
    address varchar(200) not null,
    municipality varchar(5) not null,
    email varchar(160) not null,
    updated_by uuid not null references app_user(id),
    updated_at timestamptz not null default now()
);

create table billing_invoice (
    id uuid primary key,
    clinic_id uuid not null references clinic(id),
    patient_id uuid not null references patient(id),
    plan_id uuid not null references treatment_plan(id),
    draft_number bigint not null,
    status varchar(12) not null check (status in ('DRAFT','PREPARED','CANCELLED')),
    snapshot_json text not null check (jsonb_typeof(snapshot_json::jsonb) = 'object'),
    total numeric(14,2) not null check (total >= 0),
    created_by uuid not null references app_user(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    prepared_at timestamptz,
    prepared_by uuid references app_user(id),
    cancelled_at timestamptz,
    cancelled_by uuid references app_user(id),
    cancel_reason varchar(300),
    version bigint not null default 0,
    unique(clinic_id, draft_number)
);
create index ix_billing_invoice_patient on billing_invoice(clinic_id, patient_id, created_at desc);

create table invoice_reservation (
    id uuid primary key,
    clinic_id uuid not null references clinic(id),
    invoice_id uuid not null references billing_invoice(id),
    source_item_id uuid not null references treatment_item(id),
    active boolean not null default true
);
create unique index ux_invoice_reserved_item on invoice_reservation(source_item_id) where active;
create index ix_invoice_reservation_invoice on invoice_reservation(invoice_id);

alter table billing_profile enable row level security;
alter table billing_invoice enable row level security;
alter table invoice_reservation enable row level security;
create policy tenant_isolation on billing_profile using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());
create policy tenant_isolation on billing_invoice using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());
create policy tenant_isolation on invoice_reservation using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());
revoke delete on billing_invoice, invoice_reservation from ${app_role};

create function guard_billing_invoice_change() returns trigger language plpgsql as $$
begin
    if old.status = 'CANCELLED' then
        raise exception 'El borrador está cancelado' using errcode = 'integrity_constraint_violation';
    end if;
    if old.status = 'PREPARED' and new.snapshot_json is distinct from old.snapshot_json then
        raise exception 'El documento preparado no se modifica' using errcode = 'integrity_constraint_violation';
    end if;
    if (new.clinic_id,new.patient_id,new.plan_id,new.draft_number,new.total,new.created_by,new.created_at)
       is distinct from (old.clinic_id,old.patient_id,old.plan_id,old.draft_number,old.total,old.created_by,old.created_at) then
        raise exception 'El origen y los importes del borrador no se modifican' using errcode = 'integrity_constraint_violation';
    end if;
    return new;
end $$;
create trigger tg_billing_invoice_guard before update on billing_invoice
    for each row execute function guard_billing_invoice_change();

-- Un tratamiento reservado en un documento activo no puede volver a pendiente.
create function guard_reserved_treatment_item() returns trigger language plpgsql as $$
begin
    if exists(select 1 from invoice_reservation where source_item_id=old.id and active) then
        if tg_op = 'DELETE' then
            raise exception 'El procedimiento está reservado para facturación' using errcode = 'integrity_constraint_violation';
        end if;
        if (new.status,new.quantity,new.unit_price,new.discount,new.cups_code,new.done_at,new.done_by)
           is distinct from (old.status,old.quantity,old.unit_price,old.discount,old.cups_code,old.done_at,old.done_by) then
            raise exception 'El procedimiento está reservado para facturación; cancela primero su borrador'
                using errcode = 'integrity_constraint_violation';
        end if;
    end if;
    if tg_op = 'DELETE' then return old; end if;
    return new;
end $$;
create trigger tg_reserved_treatment before update or delete on treatment_item
    for each row execute function guard_reserved_treatment_item();

