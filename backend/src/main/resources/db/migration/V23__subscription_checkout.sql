-- ---------- Pagos de la suscripción hechos por la propia clínica (checkout alojado) ----------
-- Cada intento de pago es una fila con una referencia única que viaja a la pasarela. La referencia
-- es lo que une el pago con el cobro: el resultado se confirma consultando a la pasarela.
create table subscription_checkout (
    id             uuid primary key,
    clinic_id      uuid           not null references clinic (id),
    charge_id      uuid           not null references subscription_charge (id),
    provider       varchar(20)    not null,
    reference      varchar(60)    not null unique,
    amount         numeric(14, 2) not null check (amount > 0),
    status         varchar(10)    not null default 'CREATED' check (status in ('CREATED', 'APPROVED', 'DECLINED')),
    provider_ref   varchar(120),
    failure_reason varchar(300),
    created_by     uuid references app_user (id),
    created_at     timestamptz    not null default now(),
    updated_at     timestamptz    not null default now()
);
create index ix_subscription_checkout_charge on subscription_checkout (charge_id);
create index ix_subscription_checkout_clinic on subscription_checkout (clinic_id, created_at desc);

alter table subscription_checkout enable row level security;
-- La clínica solo ve los suyos; todo lo escribe el backend en modo sistema.
create policy checkout_read on subscription_checkout for select
    using (app_rls_bypass() or clinic_id = app_current_clinic());
create policy checkout_write on subscription_checkout for all
    using (app_rls_bypass()) with check (app_rls_bypass());
-- Un pago aprobado es un hecho contable: no se borra.
revoke delete on subscription_checkout from ${app_role};
