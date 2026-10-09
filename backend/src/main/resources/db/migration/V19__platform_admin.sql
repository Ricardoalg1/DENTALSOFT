-- =====================================================================================
-- Administración de plataforma: planes, suscripciones, cobros, auditoría, eventos y avisos.
--
-- Reglas de este archivo:
--  * Las tablas de plataforma SOLO se escriben en modo sistema (app.bypass_rls = on), que fija
--    únicamente código del servidor autorizado. Ninguna política deja escribir a una clínica.
--  * Una clínica puede LEER su propia suscripción (el backend la consulta en cada petición para
--    decidir acceso y módulos), pero nunca modificarla.
--  * Los datos comerciales internos (notas, contacto, cobros) no son visibles para la clínica.
-- =====================================================================================

-- ---------- Catálogo de planes (global: no contiene datos de clínicas) ----------
create table subscription_plan (
    code          varchar(20)  primary key,
    name          varchar(60)  not null,
    -- null = sin límite de usuarios.
    max_users     integer check (max_users is null or max_users > 0),
    -- null = precio por cotización: se pacta por cliente.
    price_monthly numeric(14, 2) check (price_monthly is null or price_monthly >= 0),
    price_annual  numeric(14, 2) check (price_annual is null or price_annual >= 0),
    -- Módulos que incluye por defecto (el administrador puede ajustarlos por cliente).
    modules       varchar(30)[] not null,
    active        boolean      not null default true,
    sort_order    integer      not null default 0,
    updated_at    timestamptz  not null default now(),
    constraint ck_plan_modules check (modules::varchar[] <@ array['CLINICAL_RECORD', 'TREATMENTS_CASH',
        'BILLING_RIPS', 'INVENTORY', 'REPORTS', 'MESSAGING']::varchar[])
);

alter table subscription_plan enable row level security;
create policy plan_read on subscription_plan for select using (true);
create policy plan_write on subscription_plan for all using (app_rls_bypass()) with check (app_rls_bypass());
revoke delete on subscription_plan from ${app_role};

-- Precios y tamaños tomados de lo publicado en el sitio (shared/site-content.ts).
-- Qué módulos trae cada plan es una decisión comercial: se ajusta desde el panel.
insert into subscription_plan (code, name, max_users, price_monthly, price_annual, modules, sort_order) values
    ('ESENCIAL', 'Esencial', 5, 99000, 990000,
        array['CLINICAL_RECORD', 'TREATMENTS_CASH']::varchar[], 1),
    ('EQUIPO', 'Equipo', 10, 179000, 1788000,
        array['CLINICAL_RECORD', 'TREATMENTS_CASH', 'REPORTS']::varchar[], 2),
    ('INTEGRAL', 'Integral', 15, 239000, 2388000,
        array['CLINICAL_RECORD', 'TREATMENTS_CASH', 'REPORTS', 'INVENTORY', 'BILLING_RIPS', 'MESSAGING']::varchar[], 3),
    ('GLOBAL', 'Global', null, null, null,
        array['CLINICAL_RECORD', 'TREATMENTS_CASH', 'REPORTS', 'INVENTORY', 'BILLING_RIPS', 'MESSAGING']::varchar[], 4),
    -- Cuentas propias, socios y cortesías: acceso completo, sin cobro ni vencimiento.
    ('INTERNAL', 'Interno / cortesía', null, 0, 0,
        array['CLINICAL_RECORD', 'TREATMENTS_CASH', 'REPORTS', 'INVENTORY', 'BILLING_RIPS', 'MESSAGING']::varchar[], 9);

-- ---------- Suscripción de cada clínica ----------
create table clinic_subscription (
    clinic_id            uuid primary key references clinic (id),
    plan_code            varchar(20)    not null references subscription_plan (code),
    status               varchar(10)    not null check (status in ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED')),
    billing_cycle        varchar(8)     not null check (billing_cycle in ('MONTHLY', 'ANNUAL')),
    -- Precio pactado por ciclo (puede diferir del plan: descuentos, cotizaciones).
    price                numeric(14, 2) not null check (price >= 0),
    max_users            integer check (max_users is null or max_users > 0),
    modules              varchar(30)[]  not null,
    trial_ends_at        timestamptz,
    -- null en ambas = sin vencimiento (cuentas internas).
    current_period_start timestamptz,
    current_period_end   timestamptz,
    cancel_at_period_end boolean        not null default false,
    past_due_since       timestamptz,
    suspended_at         timestamptz,
    cancelled_at         timestamptz,
    created_at           timestamptz    not null default now(),
    updated_at           timestamptz    not null default now(),
    constraint ck_subscription_modules check (modules::varchar[] <@ array['CLINICAL_RECORD', 'TREATMENTS_CASH',
        'BILLING_RIPS', 'INVENTORY', 'REPORTS', 'MESSAGING']::varchar[]),
    check (status <> 'TRIAL' or trial_ends_at is not null),
    check (status <> 'PAST_DUE' or past_due_since is not null),
    check ((current_period_start is null) = (current_period_end is null))
);
create index ix_clinic_subscription_status on clinic_subscription (status);

alter table clinic_subscription enable row level security;
create policy subscription_read on clinic_subscription for select
    using (app_rls_bypass() or clinic_id = app_current_clinic());
create policy subscription_write on clinic_subscription for all
    using (app_rls_bypass()) with check (app_rls_bypass());
revoke delete on clinic_subscription from ${app_role};

-- ---------- Medio de pago para el cobro automático ----------
-- Solo se guarda una referencia (token) emitida por la pasarela; nunca datos de tarjeta.
create table subscription_payment_method (
    clinic_id  uuid primary key references clinic (id),
    provider   varchar(20)  not null,
    token_ref  varchar(200) not null,
    label      varchar(80)  not null,
    created_by uuid references app_user (id),
    created_at timestamptz  not null default now()
);
alter table subscription_payment_method enable row level security;
create policy platform_only on subscription_payment_method for all
    using (app_rls_bypass()) with check (app_rls_bypass());

-- ---------- Cobros de la suscripción (no son las facturas a pacientes) ----------
create table subscription_charge (
    id              uuid primary key,
    clinic_id       uuid           not null references clinic (id),
    period_start    timestamptz    not null,
    period_end      timestamptz    not null,
    amount          numeric(14, 2) not null check (amount >= 0),
    status          varchar(8)     not null check (status in ('PENDING', 'PAID', 'FAILED', 'VOID')),
    method          varchar(8) check (method in ('GATEWAY', 'MANUAL')),
    attempts        integer        not null default 0,
    next_attempt_at timestamptz,
    provider_ref    varchar(200),
    -- Referencia del pago manual (transferencia, consignación…).
    reference       varchar(200),
    failure_reason  varchar(300),
    paid_at         timestamptz,
    created_by      uuid references app_user (id),
    created_at      timestamptz    not null default now(),
    -- Idempotencia: un solo cobro por clínica y periodo, aunque el proceso corra dos veces.
    constraint uq_subscription_charge_period unique (clinic_id, period_start),
    check (period_end > period_start),
    check ((status = 'PAID') = (paid_at is not null))
);
create index ix_subscription_charge_due on subscription_charge (next_attempt_at) where status = 'PENDING';

alter table subscription_charge enable row level security;
create policy charge_read on subscription_charge for select
    using (app_rls_bypass() or clinic_id = app_current_clinic());
create policy charge_write on subscription_charge for all
    using (app_rls_bypass()) with check (app_rls_bypass());
revoke delete on subscription_charge from ${app_role};

-- ---------- Datos comerciales del cliente (solo plataforma) ----------
create table platform_client (
    clinic_id      uuid primary key references clinic (id),
    legal_name     varchar(150),
    contact_name   varchar(150),
    contact_email  varchar(160),
    contact_phone  varchar(30),
    city           varchar(80),
    internal_notes varchar(2000),
    source         varchar(12) not null default 'MANUAL' check (source in ('MANUAL', 'SELF_SERVICE', 'LEAD')),
    created_by     uuid references app_user (id),
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);
alter table platform_client enable row level security;
create policy platform_only on platform_client for all using (app_rls_bypass()) with check (app_rls_bypass());

-- ---------- Auditoría de plataforma: quién hizo qué sobre qué cliente ----------
create table platform_audit (
    id          uuid primary key,
    at          timestamptz  not null default now(),
    actor_id    uuid         not null references app_user (id),
    -- Copias de los nombres: el historial debe seguir leyéndose igual aunque se renombre algo.
    actor_name  varchar(150) not null,
    action      varchar(50)  not null,
    clinic_id   uuid references clinic (id),
    clinic_name varchar(150),
    summary     varchar(300) not null,
    details     jsonb        not null default '{}'::jsonb,
    request_id  varchar(40)
);
create index ix_platform_audit_at on platform_audit (at desc);
create index ix_platform_audit_clinic on platform_audit (clinic_id, at desc);

alter table platform_audit enable row level security;
create policy platform_only on platform_audit for all using (app_rls_bypass()) with check (app_rls_bypass());
-- Solo se agrega: la aplicación no puede corregir ni borrar el historial.
revoke update, delete on platform_audit from ${app_role};

-- ---------- Eventos del sistema y de los clientes ----------
create table platform_event (
    id          uuid primary key,
    at          timestamptz  not null default now(),
    clinic_id   uuid references clinic (id),
    clinic_name varchar(150),
    kind        varchar(40)  not null,
    severity    varchar(8)   not null check (severity in ('INFO', 'WARNING', 'CRITICAL')),
    title       varchar(200) not null,
    detail      jsonb        not null default '{}'::jsonb,
    -- Evita repetir el mismo aviso (p. ej. "la prueba termina pronto") en cada ciclo del proceso.
    dedupe_key  varchar(120)
);
create unique index ux_platform_event_dedupe on platform_event (kind, dedupe_key) where dedupe_key is not null;
create index ix_platform_event_at on platform_event (at desc);
create index ix_platform_event_clinic on platform_event (clinic_id, at desc);

alter table platform_event enable row level security;
create policy platform_only on platform_event for all using (app_rls_bypass()) with check (app_rls_bypass());
revoke update, delete on platform_event from ${app_role};

-- ---------- Bandeja de notificaciones del equipo de plataforma ----------
create table platform_notification (
    id         uuid primary key,
    event_id   uuid        not null unique references platform_event (id),
    created_at timestamptz not null default now(),
    read_at    timestamptz,
    read_by    uuid references app_user (id),
    check ((read_at is null) = (read_by is null))
);
create index ix_platform_notification_unread on platform_notification (created_at desc) where read_at is null;

alter table platform_notification enable row level security;
create policy platform_only on platform_notification for all using (app_rls_bypass()) with check (app_rls_bypass());
revoke delete on platform_notification from ${app_role};

-- ---------- Avisos para las clínicas (banner dentro de la aplicación) ----------
create table platform_announcement (
    id          uuid primary key,
    -- null = para todas las clínicas.
    clinic_id   uuid references clinic (id),
    title       varchar(120)  not null,
    body        varchar(1000) not null,
    level       varchar(8)    not null check (level in ('INFO', 'WARNING')),
    starts_at   timestamptz   not null default now(),
    ends_at     timestamptz,
    created_by  uuid          not null references app_user (id),
    created_at  timestamptz   not null default now(),
    archived_at timestamptz,
    check (ends_at is null or ends_at > starts_at)
);
alter table platform_announcement enable row level security;
-- Cada clínica ve los avisos generales y los suyos.
create policy announcement_read on platform_announcement for select
    using (app_rls_bypass() or clinic_id is null or clinic_id = app_current_clinic());
create policy announcement_write on platform_announcement for all
    using (app_rls_bypass()) with check (app_rls_bypass());
revoke delete on platform_announcement from ${app_role};

-- ---------- Contraseña temporal: obliga a cambiarla en el primer ingreso ----------
alter table app_user add column password_change_required boolean not null default false;

-- ---------- Clínicas existentes: acceso completo, sin cobro ni vencimiento ----------
-- (No se les quita nada al activar el control de módulos; el administrador las reclasifica desde el panel.)
insert into clinic_subscription (clinic_id, plan_code, status, billing_cycle, price, max_users, modules)
select c.id, 'INTERNAL', 'ACTIVE', 'MONTHLY', 0, null, p.modules
from clinic c cross join subscription_plan p where p.code = 'INTERNAL';

insert into platform_client (clinic_id, source) select id, 'MANUAL' from clinic;
