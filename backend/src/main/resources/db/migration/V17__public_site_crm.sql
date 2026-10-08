-- Datos comerciales de Occlus: no pertenecen a las clínicas clientes.
create table demo_lead (
 id uuid primary key, name varchar(120) not null, email varchar(160) not null,
 phone varchar(30), clinic_name varchar(150) not null, team_size varchar(20) not null,
 plan varchar(30) not null, message varchar(800), consent_at timestamptz not null default now(),
 status varchar(20) not null default 'NEW' check(status in ('NEW','CONTACTED','DEMO_SCHEDULED','WON','LOST')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index ix_demo_lead_created on demo_lead(created_at desc);
create index ix_demo_lead_email on demo_lead(email,created_at desc);
create table lead_activity (
 id uuid primary key, lead_id uuid not null references demo_lead(id),
 status varchar(20) not null check(status in ('NEW','CONTACTED','DEMO_SCHEDULED','WON','LOST')),
 note varchar(1000) not null, created_by uuid not null references app_user(id),
 created_at timestamptz not null default now()
);
create table site_metric (
 day date not null, path varchar(100) not null, views bigint not null default 0 check(views>=0),
 primary key(day,path)
);
alter table demo_lead enable row level security;
alter table lead_activity enable row level security;
alter table site_metric enable row level security;
create policy platform_only on demo_lead using(app_rls_bypass()) with check(app_rls_bypass());
create policy platform_only on lead_activity using(app_rls_bypass()) with check(app_rls_bypass());
create policy platform_only on site_metric using(app_rls_bypass()) with check(app_rls_bypass());
revoke update,delete on lead_activity from ${app_role};
revoke delete on demo_lead,site_metric from ${app_role};
