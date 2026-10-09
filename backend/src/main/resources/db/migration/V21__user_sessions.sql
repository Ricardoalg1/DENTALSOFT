-- ---------- Sesiones revocables ----------
-- Cada JWT lleva un "sid" que apunta a una fila de esta tabla. Se valida en CADA petición:
-- cerrar sesión, cambiar la contraseña, desactivar al usuario o cambiarle el rol cortan el acceso
-- al instante, sin esperar a que el token venza. Los tokens emitidos antes de esta migración no
-- traen "sid" y dejan de valer: todos deben iniciar sesión de nuevo una vez.
create table user_session (
    id             uuid primary key,
    user_id        uuid        not null references app_user (id),
    clinic_id      uuid        not null references clinic (id),
    created_at     timestamptz not null default now(),
    expires_at     timestamptz not null,
    revoked_at     timestamptz,
    revoked_reason varchar(30),
    -- Solo para que la persona reconozca el dispositivo en su lista de sesiones.
    user_agent     varchar(200)
);
create index ix_user_session_user on user_session (user_id) where revoked_at is null;
create index ix_user_session_expiry on user_session (expires_at);

alter table user_session enable row level security;
create policy tenant_isolation on user_session
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());
