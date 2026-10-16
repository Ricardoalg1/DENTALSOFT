-- ---------- Gastos ----------
-- Egresos de la clínica. Como los pagos, no se editan ni se borran: un gasto equivocado se anula, con motivo.
-- Si se paga en efectivo desde la caja abierta de la sede, queda ligado a ese turno y se descuenta del cuadre.
create table expense (
    id                uuid primary key,
    clinic_id         uuid           not null references clinic (id),
    site_id           uuid           not null references site (id),
    cash_session_id   uuid references cash_session (id),
    expense_date      date           not null,
    category          varchar(20)    not null check (category in ('SUPPLIES', 'LAB', 'PAYROLL', 'RENT', 'UTILITIES',
                                                                 'MAINTENANCE', 'EQUIPMENT', 'MARKETING', 'TAXES',
                                                                 'BIOSAFETY', 'OTHER')),
    description       varchar(300)   not null,
    supplier_name     varchar(200),
    supplier_document varchar(40),
    invoice_number    varchar(60),
    amount            numeric(14, 2) not null check (amount > 0),
    method            varchar(15)    not null check (method in ('CASH', 'DEBIT_CARD', 'CREDIT_CARD', 'TRANSFER', 'OTHER')),
    reference         varchar(100),
    created_by        uuid           not null references app_user (id),
    created_at        timestamptz    not null default now(),
    voided_at         timestamptz,
    voided_by         uuid references app_user (id),
    void_reason       varchar(300),
    check ((voided_at is null) = (voided_by is null)),
    check (voided_at is null or void_reason is not null),
    -- Solo el efectivo sale de la caja.
    check (cash_session_id is null or method = 'CASH')
);
create index ix_expense_date on expense (clinic_id, expense_date desc);
create index ix_expense_session on expense (cash_session_id);

alter table expense enable row level security;
create policy tenant_isolation on expense
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());
revoke delete on expense from ${app_role};

create function forbid_expense_change() returns trigger
    language plpgsql
as $$
begin
    if old.voided_at is not null then
        raise exception 'El gasto % ya fue anulado', old.id using errcode = 'integrity_constraint_violation';
    end if;
    if (new.clinic_id, new.site_id, new.cash_session_id, new.expense_date, new.category, new.description,
        new.supplier_name, new.supplier_document, new.invoice_number, new.amount, new.method, new.reference,
        new.created_by, new.created_at)
       is distinct from
       (old.clinic_id, old.site_id, old.cash_session_id, old.expense_date, old.category, old.description,
        old.supplier_name, old.supplier_document, old.invoice_number, old.amount, old.method, old.reference,
        old.created_by, old.created_at) then
        raise exception 'Un gasto registrado no se modifica; anúlalo y registra uno nuevo'
            using errcode = 'integrity_constraint_violation';
    end if;
    return new;
end
$$;

create trigger tg_expense_immutable
    before update on expense
    for each row execute function forbid_expense_change();

-- ---------- Financiamiento ----------
-- Acuerdo de pago a cuotas de un paciente (sin intereses). Las cuotas se pagan con abonos (payment.financing_id):
-- lo pagado se aplica a las cuotas en orden de vencimiento. No se borra: se cancela, con motivo.
create table financing (
    id            uuid primary key,
    clinic_id     uuid           not null references clinic (id),
    patient_id    uuid           not null references patient (id),
    plan_id       uuid references treatment_plan (id),
    concept       varchar(200)   not null,
    total_amount  numeric(14, 2) not null check (total_amount > 0),
    down_payment  numeric(14, 2) not null default 0 check (down_payment >= 0),
    installments  smallint       not null check (installments between 1 and 60),
    frequency     varchar(10)    not null check (frequency in ('WEEKLY', 'BIWEEKLY', 'MONTHLY')),
    first_due     date           not null,
    notes         varchar(500),
    created_by    uuid           not null references app_user (id),
    created_at    timestamptz    not null default now(),
    cancelled_at  timestamptz,
    cancelled_by  uuid references app_user (id),
    cancel_reason varchar(300),
    check (down_payment < total_amount),
    check ((cancelled_at is null) = (cancelled_by is null)),
    check (cancelled_at is null or cancel_reason is not null)
);
create index ix_financing_patient on financing (patient_id, created_at desc);

alter table financing enable row level security;
create policy tenant_isolation on financing
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());
revoke delete on financing from ${app_role};

-- Cuotas: se generan al crear el acuerdo y no cambian (la suma es total − cuota inicial).
create table financing_installment (
    id           uuid primary key,
    clinic_id    uuid           not null references clinic (id),
    financing_id uuid           not null references financing (id),
    number       smallint       not null check (number between 1 and 60),
    due_date     date           not null,
    amount       numeric(14, 2) not null check (amount > 0),
    constraint uq_financing_installment unique (financing_id, number)
);
create index ix_financing_installment_due on financing_installment (clinic_id, due_date);

alter table financing_installment enable row level security;
create policy tenant_isolation on financing_installment
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());
revoke update, delete on financing_installment from ${app_role};

alter table payment add column financing_id uuid references financing (id);
create index ix_payment_financing on payment (financing_id) where financing_id is not null;

create or replace function forbid_payment_change() returns trigger
    language plpgsql
as $$
begin
    if old.voided_at is not null then
        raise exception 'El pago % ya fue anulado', old.id using errcode = 'integrity_constraint_violation';
    end if;
    if (new.clinic_id, new.patient_id, new.plan_id, new.cash_session_id, new.receipt_number, new.amount,
        new.method, new.reference, new.notes, new.received_by, new.received_at,
        new.kind, new.income_date, new.dentist_id, new.payer_name, new.payer_document, new.concept, new.payment_term,
        new.financing_id)
       is distinct from
       (old.clinic_id, old.patient_id, old.plan_id, old.cash_session_id, old.receipt_number, old.amount,
        old.method, old.reference, old.notes, old.received_by, old.received_at,
        old.kind, old.income_date, old.dentist_id, old.payer_name, old.payer_document, old.concept, old.payment_term,
        old.financing_id) then
        raise exception 'Un pago registrado no se modifica; anúlalo y registra uno nuevo'
            using errcode = 'integrity_constraint_violation';
    end if;
    return new;
end
$$;
