-- Activos privados versionados; no se sobrescriben firmas usadas en documentos.
create table document_asset (
 id uuid primary key, clinic_id uuid not null references clinic(id), owner_id uuid not null references app_user(id),
 kind varchar(20) not null check(kind in ('LOGO','SIGNATURE')), png bytea not null check(octet_length(png)<=2097152),
 created_at timestamptz not null default now()
);
create table clinic_document_branding (
 clinic_id uuid primary key references clinic(id), logo_id uuid references document_asset(id),
 address varchar(300) not null default '', phone varchar(80) not null default '', email varchar(200) not null default '',
 updated_by uuid not null references app_user(id), updated_at timestamptz not null default now()
);
create table user_document_profile (
 user_id uuid primary key references app_user(id), clinic_id uuid not null references clinic(id),
 registration varchar(120) not null default '', signature_id uuid references document_asset(id), updated_at timestamptz not null default now()
);
create table clinical_note_signature (
 note_id uuid primary key references clinical_note(id), clinic_id uuid not null references clinic(id),
 author_id uuid not null references app_user(id), author_name varchar(200) not null, registration varchar(120) not null,
 signature_id uuid references document_asset(id), created_at timestamptz not null default now()
);
create table clinical_prescription (
 id uuid primary key, clinic_id uuid not null references clinic(id), patient_id uuid not null references patient(id),
 author_id uuid not null references app_user(id), operation_id uuid not null, content text not null,
 snapshot text, signed_at timestamptz, content_hash varchar(64), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(clinic_id,author_id,operation_id), check((signed_at is null)=(content_hash is null)), check((signed_at is null)=(snapshot is null))
);
create index clinical_prescription_patient on clinical_prescription(clinic_id,patient_id,created_at desc);
create table clinical_prescription_event (
 id uuid primary key, clinic_id uuid not null references clinic(id), prescription_id uuid not null references clinical_prescription(id),
 actor_id uuid not null references app_user(id), kind varchar(20) not null check(kind in ('CREATED','UPDATED','SIGNED','PDF')),
 created_at timestamptz not null default now()
);

create function document_asset_refs() returns trigger language plpgsql as $$
begin
 if not exists(select 1 from app_user where id=new.owner_id and clinic_id=new.clinic_id and active) then raise exception 'Autor de activo inválido' using errcode='23514'; end if;
 return new;
end $$;
create trigger document_asset_guard before insert on document_asset for each row execute function document_asset_refs();

create function document_profile_refs() returns trigger language plpgsql as $$
begin
 if tg_table_name='clinic_document_branding' then
  if not exists(select 1 from app_user where id=new.updated_by and clinic_id=new.clinic_id and active) or (new.logo_id is not null and not exists(select 1 from document_asset where id=new.logo_id and clinic_id=new.clinic_id and kind='LOGO')) then raise exception 'Logo o autor inválido' using errcode='23514'; end if;
 else
  if not exists(select 1 from app_user where id=new.user_id and clinic_id=new.clinic_id and active) or (new.signature_id is not null and not exists(select 1 from document_asset where id=new.signature_id and clinic_id=new.clinic_id and owner_id=new.user_id and kind='SIGNATURE')) then raise exception 'Firma o colaborador inválido' using errcode='23514'; end if;
 end if;
 return new;
end $$;
create trigger branding_guard before insert or update on clinic_document_branding for each row execute function document_profile_refs();
create trigger profile_guard before insert or update on user_document_profile for each row execute function document_profile_refs();

create function prescription_guard() returns trigger language plpgsql as $$
begin
 if tg_op='DELETE' then raise exception 'Los documentos clínicos no se eliminan' using errcode='23514'; end if;
 if tg_op='UPDATE' then
  if old.signed_at is not null then raise exception 'La fórmula firmada es inmutable' using errcode='23514'; end if;
  if new.clinic_id<>old.clinic_id or new.patient_id<>old.patient_id or new.author_id<>old.author_id or new.operation_id<>old.operation_id then raise exception 'Identidad de fórmula inmutable' using errcode='23514'; end if;
 end if;
 if not exists(select 1 from patient where id=new.patient_id and clinic_id=new.clinic_id) or not exists(select 1 from app_user where id=new.author_id and clinic_id=new.clinic_id and active and professional) then raise exception 'Referencias clínicas inválidas' using errcode='23514'; end if;
 return new;
end $$;
create trigger prescription_guard before insert or update or delete on clinical_prescription for each row execute function prescription_guard();
create function note_signature_guard() returns trigger language plpgsql as $$
begin
 if not exists(select 1 from clinical_note where id=new.note_id and clinic_id=new.clinic_id and dentist_id=new.author_id and signed_at is not null) or (new.signature_id is not null and not exists(select 1 from document_asset where id=new.signature_id and clinic_id=new.clinic_id and owner_id=new.author_id and kind='SIGNATURE')) then raise exception 'Firma clínica inválida' using errcode='23514'; end if;
 return new;
end $$;
create trigger note_signature_guard before insert on clinical_note_signature for each row execute function note_signature_guard();
create function prescription_event_guard() returns trigger language plpgsql as $$
begin
 if not exists(select 1 from clinical_prescription where id=new.prescription_id and clinic_id=new.clinic_id) or not exists(select 1 from app_user where id=new.actor_id and clinic_id=new.clinic_id and active) then raise exception 'Evento clínico inválido' using errcode='23514'; end if;
 return new;
end $$;
create trigger prescription_event_guard before insert on clinical_prescription_event for each row execute function prescription_event_guard();

alter table document_asset enable row level security;
alter table clinic_document_branding enable row level security;
alter table user_document_profile enable row level security;
alter table clinical_note_signature enable row level security;
alter table clinical_prescription enable row level security;
alter table clinical_prescription_event enable row level security;
create policy tenant_isolation on document_asset using(clinic_id=app_current_clinic()) with check(clinic_id=app_current_clinic());
create policy tenant_isolation on clinic_document_branding using(clinic_id=app_current_clinic()) with check(clinic_id=app_current_clinic());
create policy tenant_isolation on user_document_profile using(clinic_id=app_current_clinic()) with check(clinic_id=app_current_clinic());
create policy tenant_isolation on clinical_note_signature using(clinic_id=app_current_clinic()) with check(clinic_id=app_current_clinic());
create policy tenant_isolation on clinical_prescription using(clinic_id=app_current_clinic()) with check(clinic_id=app_current_clinic());
create policy tenant_isolation on clinical_prescription_event using(clinic_id=app_current_clinic()) with check(clinic_id=app_current_clinic());
grant select,insert on document_asset,clinical_note_signature,clinical_prescription_event to ${app_role};
grant select,insert,update on clinic_document_branding,user_document_profile,clinical_prescription to ${app_role};
revoke update,delete on document_asset,clinical_note_signature,clinical_prescription_event from ${app_role};
revoke delete on clinic_document_branding,user_document_profile,clinical_prescription from ${app_role};
