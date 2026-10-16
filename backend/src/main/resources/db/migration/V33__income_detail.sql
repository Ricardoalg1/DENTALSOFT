-- Recaudos: un ingreso es un abono a la cuenta del paciente (como hasta ahora) o un recibo de venta con el
-- detalle de los procedimientos cobrados. El recibo de venta no afecta el estado de cuenta: se cobra y se paga
-- en el mismo acto.
alter table payment
    add column kind           varchar(10) not null default 'ACCOUNT' check (kind in ('ACCOUNT', 'SALE')),
    add column income_date    date,
    add column dentist_id     uuid references app_user (id),
    add column payer_name     varchar(200),
    add column payer_document varchar(40),
    add column concept        varchar(200),
    add column payment_term   varchar(10) not null default 'CASH' check (payment_term in ('CASH', 'CREDIT')),
    add check ((payer_name is null) = (payer_document is null));

-- Fecha del ingreso (día en Colombia) para informes y cuadres. Los pagos anteriores toman la de su registro;
-- el trigger de inmutabilidad se desactiva solo para este relleno.
alter table payment disable trigger tg_payment_immutable;
update payment set income_date = (received_at at time zone 'America/Bogota')::date;
alter table payment enable trigger tg_payment_immutable;
alter table payment alter column income_date set not null;
create index ix_payment_income_date on payment (clinic_id, income_date);

-- La inmutabilidad cubre también los campos nuevos: un pago solo se puede anular.
create or replace function forbid_payment_change() returns trigger
    language plpgsql
as $$
begin
    if old.voided_at is not null then
        raise exception 'El pago % ya fue anulado', old.id using errcode = 'integrity_constraint_violation';
    end if;
    if (new.clinic_id, new.patient_id, new.plan_id, new.cash_session_id, new.receipt_number, new.amount,
        new.method, new.reference, new.notes, new.received_by, new.received_at,
        new.kind, new.income_date, new.dentist_id, new.payer_name, new.payer_document, new.concept, new.payment_term)
       is distinct from
       (old.clinic_id, old.patient_id, old.plan_id, old.cash_session_id, old.receipt_number, old.amount,
        old.method, old.reference, old.notes, old.received_by, old.received_at,
        old.kind, old.income_date, old.dentist_id, old.payer_name, old.payer_document, old.concept, old.payment_term) then
        raise exception 'Un pago registrado no se modifica; anúlalo y registra uno nuevo'
            using errcode = 'integrity_constraint_violation';
    end if;
    return new;
end
$$;

-- Detalle del ingreso: procedimientos cobrados, con los datos que luego necesitan los RIPS
-- (CUPS, finalidad y diagnósticos). No se edita ni se borra: se anula el pago completo.
create table payment_item (
    id                uuid primary key,
    clinic_id         uuid           not null references clinic (id),
    payment_id        uuid           not null references payment (id),
    position          smallint       not null check (position between 1 and 100),
    procedure_id      uuid references service_catalog (id),
    description       varchar(200)   not null,
    cups_code         varchar(10),
    quantity          integer        not null check (quantity between 1 and 999),
    purpose           varchar(2) check (purpose ~ '^[0-9]{2}$'),
    unit_price        numeric(14, 2) not null check (unit_price >= 0),
    discount_type     varchar(10) check (discount_type in ('PERCENT', 'AMOUNT')),
    discount_value    numeric(14, 2) not null default 0 check (discount_value >= 0),
    total             numeric(14, 2) not null check (total >= 0),
    diagnosis_main    varchar(4) references icd10 (code),
    diagnosis_related varchar(4) references icd10 (code),
    constraint uq_payment_item_position unique (payment_id, position),
    check (discount_type is not null or discount_value = 0),
    check (discount_type <> 'PERCENT' or discount_value <= 100)
);
create index ix_payment_item_procedure on payment_item (procedure_id);

alter table payment_item enable row level security;
create policy tenant_isolation on payment_item
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());
revoke update, delete on payment_item from ${app_role};
