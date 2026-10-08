-- Extiende V17 sin alterar migraciones existentes.
alter table demo_lead add column follow_up_on date;
create index ix_demo_lead_follow_up on demo_lead(follow_up_on) where status in ('NEW','CONTACTED','DEMO_SCHEDULED');
create index ix_lead_activity_created on lead_activity(lead_id,created_at desc);
alter table lead_activity drop constraint lead_activity_lead_id_fkey;
alter table lead_activity add constraint lead_activity_lead_id_fkey foreign key(lead_id) references demo_lead(id) on delete cascade;

-- Registro mínimo de eliminaciones: sin datos de contacto ni notas.
create table lead_erasure (
 id uuid primary key, lead_id uuid not null, actor_id uuid,
 reason varchar(30) not null check(reason in ('PRIVACY_REQUEST','RETENTION')),
 erased_at timestamptz not null default now()
);
alter table lead_erasure enable row level security;
create policy platform_only on lead_erasure using(app_rls_bypass()) with check(app_rls_bypass());
revoke insert,update,delete on lead_erasure from ${app_role};

-- Única vía de borrado para el rol de aplicación. Elimina también todas las notas.
create function erase_demo_lead(p_id uuid,p_actor uuid,p_reason text) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if not public.app_rls_bypass() then raise exception 'Platform context required' using errcode='42501'; end if;
 if p_reason not in ('PRIVACY_REQUEST','RETENTION') or p_reason is null then raise exception 'Invalid erasure reason'; end if;
 delete from public.demo_lead where id=p_id;
 if not found then return false; end if;
 insert into public.lead_erasure(id,lead_id,actor_id,reason) values(gen_random_uuid(),p_id,p_actor,p_reason);
 return true;
end;
$$;
revoke all on function erase_demo_lead(uuid,uuid,text) from public;
grant execute on function erase_demo_lead(uuid,uuid,text) to ${app_role};

grant delete on site_metric to ${app_role};
