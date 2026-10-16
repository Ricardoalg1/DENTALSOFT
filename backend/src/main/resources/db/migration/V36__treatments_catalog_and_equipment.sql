-- ---------- Tratamientos ----------
-- Catálogo de tratamientos de la clínica (creados a mano o cargados de una lista predeterminada). Agrupa los
-- procedimientos de la lista de precios: cada procedimiento lleva su código CUPS, su precio y su tratamiento.
create table treatment_type (
    id          uuid primary key,
    clinic_id   uuid         not null references clinic (id),
    name        varchar(150) not null,
    category    varchar(20)  not null check (category in (
        'DIAGNOSIS', 'PREVENTION', 'RESTORATIVE', 'ENDODONTICS', 'PERIODONTICS', 'SURGERY',
        'PROSTHODONTICS', 'ORTHODONTICS', 'OTHER')),
    description varchar(300),
    active      boolean      not null default true,
    created_at  timestamptz  not null default now(),
    updated_at  timestamptz  not null default now(),
    constraint uq_treatment_type_name unique (clinic_id, name)
);

alter table treatment_type enable row level security;
create policy tenant_isolation on treatment_type
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());

alter table service_catalog add column treatment_id uuid references treatment_type (id);
create index ix_service_catalog_treatment on service_catalog (treatment_id);

-- ---------- Inventario: insumos y materiales ----------
-- Categoría del artículo y costo unitario (para el inventario valorizado).
alter table inventory_item
    add column category  varchar(10) not null default 'SUPPLY' check (category in ('SUPPLY', 'MATERIAL')),
    add column unit_cost numeric(14, 2) check (unit_cost >= 0);

-- ---------- Equipos ----------
-- Equipos de la clínica (biomédicos y generales), uno por fila: no se manejan como existencias sino como activos,
-- con su hoja de vida (marca, serie, registro INVIMA, clase de riesgo) y periodicidad de mantenimiento. Los
-- mantenimientos se registran en Bioseguridad y referencian el equipo. No se borran: se dan de baja (RETIRED).
create table equipment (
    id                 uuid primary key,
    clinic_id          uuid           not null references clinic (id),
    site_id            uuid           not null references site (id),
    code               varchar(40)    not null,
    name               varchar(150)   not null,
    kind               varchar(12)    not null check (kind in ('BIOMEDICAL', 'GENERAL')),
    brand              varchar(80),
    model              varchar(80),
    serial             varchar(80),
    invima_registry    varchar(60),
    risk_class         varchar(4) check (risk_class in ('I', 'IIA', 'IIB', 'III')),
    location           varchar(120),
    acquired_on        date,
    cost               numeric(14, 2) check (cost >= 0),
    warranty_until     date,
    maintenance_months smallint check (maintenance_months between 1 and 60),
    status             varchar(15)    not null default 'ACTIVE'
        check (status in ('ACTIVE', 'MAINTENANCE', 'OUT_OF_SERVICE', 'RETIRED')),
    notes              varchar(500),
    created_at         timestamptz    not null default now(),
    updated_at         timestamptz    not null default now(),
    constraint uq_equipment_code unique (clinic_id, code)
);
create index ix_equipment_site on equipment (clinic_id, site_id);

alter table equipment enable row level security;
create policy tenant_isolation on equipment
    using (app_rls_bypass() or clinic_id = app_current_clinic())
    with check (app_rls_bypass() or clinic_id = app_current_clinic());
revoke delete on equipment from ${app_role};
