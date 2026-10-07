-- ---------- Lista de precios (procedimientos de la clínica) ----------
create table service_catalog (
    id               uuid primary key,
    clinic_id        uuid          not null references clinic (id),
    code             varchar(20),
    name             varchar(150)  not null,
    category         varchar(20)   not null check (category in (
        'DIAGNOSIS', 'PREVENTION', 'RESTORATIVE', 'ENDODONTICS', 'PERIODONTICS', 'SURGERY',
        'PROSTHODONTICS', 'ORTHODONTICS', 'OTHER')),
    -- Código CUPS del procedimiento: lo exige RIPS (Fase 6).
    cups_code        varchar(10),
    price            numeric(14, 2) not null check (price >= 0),
    -- Se cobra por diente (resina, endodoncia…) o por atención (profilaxis, consulta…).
    per_tooth        boolean       not null default false,
    -- Hallazgo del odontograma que resuelve (p. ej. CARIES → resina): sirve para sugerir planes.
    treats_condition varchar(30),
    active           boolean       not null default true,
    created_at       timestamptz   not null default now(),
    updated_at       timestamptz   not null default now(),
    constraint uq_service_catalog_name unique (clinic_id, name)
);

alter table service_catalog enable row level security;
create policy tenant_isolation on service_catalog
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());

-- ---------- Planes de tratamiento (presupuestos) ----------
-- DRAFT: se edita libremente · ACCEPTED: el paciente lo aprobó, los precios quedan fijos ·
-- COMPLETED: todo realizado · REJECTED / CANCELLED: cerrados.
create table treatment_plan (
    id          uuid primary key,
    clinic_id   uuid         not null references clinic (id),
    patient_id  uuid         not null references patient (id),
    dentist_id  uuid         not null references app_user (id),
    title       varchar(150) not null,
    status      varchar(10)  not null check (status in ('DRAFT', 'ACCEPTED', 'COMPLETED', 'REJECTED', 'CANCELLED')),
    notes       varchar(2000),
    valid_until date,
    accepted_at timestamptz,
    accepted_by uuid references app_user (id),
    closed_at   timestamptz,
    created_at  timestamptz  not null default now(),
    updated_at  timestamptz  not null default now(),
    check ((accepted_at is null) = (accepted_by is null)),
    check (status not in ('ACCEPTED', 'COMPLETED') or accepted_at is not null)
);
create index ix_treatment_plan_patient on treatment_plan (patient_id, created_at desc);

alter table treatment_plan enable row level security;
create policy tenant_isolation on treatment_plan
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());

create table treatment_item (
    id          uuid primary key,
    clinic_id   uuid           not null references clinic (id),
    plan_id     uuid           not null references treatment_plan (id),
    service_id  uuid           not null references service_catalog (id),
    -- Copia del nombre, el código CUPS y el precio al momento de presupuestar.
    description varchar(200)   not null,
    cups_code   varchar(10),
    tooth       smallint check (tooth is null or
        (tooth / 10 between 1 and 4 and tooth % 10 between 1 and 8) or
        (tooth / 10 between 5 and 8 and tooth % 10 between 1 and 5)),
    surfaces    varchar(5),
    quantity    integer        not null check (quantity between 1 and 99),
    unit_price  numeric(14, 2) not null check (unit_price >= 0),
    discount    numeric(14, 2) not null default 0 check (discount >= 0),
    status      varchar(10)    not null check (status in ('PENDING', 'DONE', 'CANCELLED')),
    done_at     timestamptz,
    done_by     uuid references app_user (id),
    sort_order  integer        not null default 0,
    created_at  timestamptz    not null default now(),
    check (discount <= unit_price * quantity),
    check ((status = 'DONE') = (done_at is not null)),
    check ((done_at is null) = (done_by is null))
);
create index ix_treatment_item_plan on treatment_item (plan_id, sort_order);

alter table treatment_item enable row level security;
create policy tenant_isolation on treatment_item
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());

-- Auditoría (Envers): quién cambió precios, descuentos o estados.
create table treatment_plan_aud (
    id          uuid   not null,
    rev         bigint not null references audit_revision (id),
    revtype     smallint,
    clinic_id   uuid,
    patient_id  uuid,
    dentist_id  uuid,
    title       varchar(150),
    status      varchar(10),
    notes       varchar(2000),
    valid_until date,
    accepted_at timestamptz,
    accepted_by uuid,
    closed_at   timestamptz,
    primary key (id, rev)
);

create table treatment_item_aud (
    id          uuid   not null,
    rev         bigint not null references audit_revision (id),
    revtype     smallint,
    clinic_id   uuid,
    plan_id     uuid,
    service_id  uuid,
    description varchar(200),
    cups_code   varchar(10),
    tooth       smallint,
    surfaces    varchar(5),
    quantity    integer,
    unit_price  numeric(14, 2),
    discount    numeric(14, 2),
    status      varchar(10),
    done_at     timestamptz,
    done_by     uuid,
    sort_order  integer,
    primary key (id, rev)
);

alter table treatment_plan_aud enable row level security;
create policy tenant_isolation on treatment_plan_aud
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());
alter table treatment_item_aud enable row level security;
create policy tenant_isolation on treatment_item_aud
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());
revoke update, delete on treatment_plan_aud, treatment_item_aud from ${app_role};

-- ---------- Caja ----------
-- Una caja abierta por sede. Al cerrarla se guarda el efectivo esperado y el contado.
create table cash_session (
    id             uuid primary key,
    clinic_id      uuid           not null references clinic (id),
    site_id        uuid           not null references site (id),
    opened_by      uuid           not null references app_user (id),
    opened_at      timestamptz    not null default now(),
    opening_amount numeric(14, 2) not null check (opening_amount >= 0),
    closed_by      uuid references app_user (id),
    closed_at      timestamptz,
    expected_cash  numeric(14, 2),
    counted_cash   numeric(14, 2) check (counted_cash >= 0),
    notes          varchar(500),
    check ((closed_at is null) = (closed_by is null)),
    check (closed_at is null or (expected_cash is not null and counted_cash is not null))
);
create unique index ux_cash_session_open on cash_session (site_id) where closed_at is null;
create index ix_cash_session_clinic on cash_session (clinic_id, opened_at desc);

alter table cash_session enable row level security;
create policy tenant_isolation on cash_session
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());
revoke delete on cash_session from ${app_role};

-- Una caja cerrada no se vuelve a tocar.
create function forbid_closed_cash_session_change() returns trigger
    language plpgsql
as $$
begin
    if old.closed_at is not null then
        raise exception 'La caja % ya está cerrada', old.id using errcode = 'integrity_constraint_violation';
    end if;
    return new;
end
$$;

create trigger tg_cash_session_closed
    before update on cash_session
    for each row execute function forbid_closed_cash_session_change();

-- Consecutivos por clínica (recibos de caja; luego facturas).
create table clinic_counter (
    clinic_id uuid        not null references clinic (id),
    name      varchar(30) not null,
    value     bigint      not null,
    primary key (clinic_id, name)
);

alter table clinic_counter enable row level security;
create policy tenant_isolation on clinic_counter
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());

-- ---------- Pagos (recibos de caja) ----------
-- No se borran ni se editan: un pago equivocado se anula, con motivo.
create table payment (
    id              uuid primary key,
    clinic_id       uuid           not null references clinic (id),
    patient_id      uuid           not null references patient (id),
    plan_id         uuid references treatment_plan (id),
    cash_session_id uuid           not null references cash_session (id),
    receipt_number  bigint         not null,
    amount          numeric(14, 2) not null check (amount > 0),
    method          varchar(15)    not null check (method in ('CASH', 'DEBIT_CARD', 'CREDIT_CARD', 'TRANSFER', 'OTHER')),
    reference       varchar(100),
    notes           varchar(300),
    received_by     uuid           not null references app_user (id),
    received_at     timestamptz    not null default now(),
    voided_at       timestamptz,
    voided_by       uuid references app_user (id),
    void_reason     varchar(300),
    constraint uq_payment_receipt unique (clinic_id, receipt_number),
    check ((voided_at is null) = (voided_by is null)),
    check (voided_at is null or void_reason is not null)
);
create index ix_payment_patient on payment (patient_id, received_at desc);
create index ix_payment_session on payment (cash_session_id);

alter table payment enable row level security;
create policy tenant_isolation on payment
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());
revoke delete on payment from ${app_role};

create function forbid_payment_change() returns trigger
    language plpgsql
as $$
begin
    if old.voided_at is not null then
        raise exception 'El pago % ya fue anulado', old.id using errcode = 'integrity_constraint_violation';
    end if;
    if (new.clinic_id, new.patient_id, new.plan_id, new.cash_session_id, new.receipt_number, new.amount,
        new.method, new.reference, new.notes, new.received_by, new.received_at)
       is distinct from
       (old.clinic_id, old.patient_id, old.plan_id, old.cash_session_id, old.receipt_number, old.amount,
        old.method, old.reference, old.notes, old.received_by, old.received_at) then
        raise exception 'Un pago registrado no se modifica; anúlalo y registra uno nuevo'
            using errcode = 'integrity_constraint_violation';
    end if;
    return new;
end
$$;

create trigger tg_payment_immutable
    before update on payment
    for each row execute function forbid_payment_change();
