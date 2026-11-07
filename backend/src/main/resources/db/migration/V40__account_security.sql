-- ---------- Recuperar contraseña y verificación en dos pasos ----------
-- Ningún secreto queda legible: los tokens y códigos se guardan como SHA-256 y el secreto TOTP va cifrado
-- con una llave que no vive en la base de datos.

create table password_reset_token (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid        not null references app_user (id),
    clinic_id  uuid        not null references clinic (id),
    token_hash varchar(64) not null unique,
    -- Códigos incorrectos con este enlace: al llegar al límite el enlace se invalida.
    attempts   integer     not null default 0,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null,
    used_at    timestamptz
);
create index ix_password_reset_user on password_reset_token (user_id, created_at);

-- Sin enabled_at: configuración iniciada y aún no confirmada con un primer código.
create table user_two_factor (
    user_id          uuid primary key references app_user (id),
    clinic_id        uuid         not null references clinic (id),
    secret_enc       varchar(200) not null,
    enabled_at       timestamptz,
    setup_expires_at timestamptz,
    -- Último paso de tiempo aceptado: un código no se puede usar dos veces.
    last_step        bigint       not null default 0,
    failed_attempts  integer      not null default 0,
    locked_until     timestamptz,
    updated_at       timestamptz  not null default now()
);

create table user_recovery_code (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid        not null references app_user (id),
    clinic_id  uuid        not null references clinic (id),
    code_hash  varchar(64) not null,
    created_at timestamptz not null default now(),
    used_at    timestamptz,
    unique (user_id, code_hash)
);

-- Reto entre la contraseña correcta y el código: todavía no es una sesión.
create table login_challenge (
    token_hash varchar(64) primary key,
    user_id    uuid        not null references app_user (id),
    clinic_id  uuid        not null references clinic (id),
    attempts   integer     not null default 0,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null
);
create index ix_login_challenge_user on login_challenge (user_id);

-- Bitácora de solo inserción de lo que afecta el acceso a una cuenta.
create table account_security_event (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid        not null references app_user (id),
    clinic_id  uuid        not null references clinic (id),
    event      varchar(40) not null check (event in (
        'PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_COMPLETED', 'PASSWORD_CHANGED', 'TWO_FACTOR_ENABLED',
        'TWO_FACTOR_DISABLED', 'RECOVERY_CODES_REGENERATED', 'RECOVERY_CODE_USED', 'TWO_FACTOR_LOCKED')),
    created_at timestamptz not null default now()
);
create index ix_account_security_event_user on account_security_event (user_id, created_at desc);
revoke update, delete on account_security_event from ${app_role};

alter table password_reset_token enable row level security;
create policy tenant_isolation on password_reset_token
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());

alter table user_two_factor enable row level security;
create policy tenant_isolation on user_two_factor
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());

alter table user_recovery_code enable row level security;
create policy tenant_isolation on user_recovery_code
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());

alter table login_challenge enable row level security;
create policy tenant_isolation on login_challenge
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());

alter table account_security_event enable row level security;
create policy tenant_isolation on account_security_event
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());
