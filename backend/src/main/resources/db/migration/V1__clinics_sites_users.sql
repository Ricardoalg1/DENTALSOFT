-- Clínica = tenant. Todo dato de negocio cuelga de una clínica.
create table clinic (
    id         uuid primary key,
    name       varchar(150) not null,
    nit        varchar(20),
    created_at timestamptz  not null default now()
);

-- Sede física de una clínica.
create table site (
    id         uuid primary key,
    clinic_id  uuid         not null references clinic (id),
    name       varchar(120) not null,
    address    varchar(200),
    city       varchar(80),
    phone      varchar(30),
    active     boolean      not null default true,
    created_at timestamptz  not null default now()
);
create index ix_site_clinic on site (clinic_id);

create table app_user (
    id            uuid primary key,
    clinic_id     uuid         not null references clinic (id),
    email         varchar(160) not null,
    password_hash varchar(100) not null,
    full_name     varchar(150) not null,
    role          varchar(20)  not null check (role in ('ADMIN', 'DENTIST', 'RECEPTION', 'ASSISTANT')),
    active        boolean      not null default true,
    created_at    timestamptz  not null default now()
);
create unique index ux_app_user_email on app_user (email);
create index ix_app_user_clinic on app_user (clinic_id);
