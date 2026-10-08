create table inventory_item (
 id uuid primary key, clinic_id uuid not null references clinic(id),
 code varchar(40) not null, name varchar(150) not null, unit varchar(30) not null,
 minimum numeric(14,3) not null default 0 check(minimum >= 0),
 track_lots boolean not null default false, active boolean not null default true,
 created_at timestamptz not null default now(), unique(clinic_id,code)
);
create table inventory_batch (
 id uuid primary key, clinic_id uuid not null references clinic(id),
 item_id uuid not null references inventory_item(id), site_id uuid not null references site(id),
 lot varchar(80) not null default '', expires_on date,
 quantity numeric(14,3) not null default 0 check(quantity >= 0),
 unique(item_id,site_id,lot)
);
create table inventory_movement (
 id uuid primary key, clinic_id uuid not null references clinic(id),
 batch_id uuid not null references inventory_batch(id),
 kind varchar(20) not null check(kind in ('ENTRY','CONSUMPTION','DISCARD','ADJUSTMENT','TRANSFER_OUT','TRANSFER_IN')),
 delta numeric(14,3) not null check(delta <> 0), balance numeric(14,3) not null check(balance >= 0),
 reason varchar(300) not null check(length(trim(reason)) >= 3),
 reference varchar(100), operation_id uuid not null,
 created_by uuid not null references app_user(id), created_at timestamptz not null default now(),
 unique(operation_id,batch_id)
);
create index ix_inventory_movement_history on inventory_movement(clinic_id,created_at desc);
create index ix_inventory_batch_site on inventory_batch(clinic_id,site_id,item_id);
alter table inventory_item enable row level security;
alter table inventory_batch enable row level security;
alter table inventory_movement enable row level security;
create policy tenant_isolation on inventory_item using(app_rls_bypass() or clinic_id=app_current_clinic()) with check(app_rls_bypass() or clinic_id=app_current_clinic());
create policy tenant_isolation on inventory_batch using(app_rls_bypass() or clinic_id=app_current_clinic()) with check(app_rls_bypass() or clinic_id=app_current_clinic());
create policy tenant_isolation on inventory_movement using(app_rls_bypass() or clinic_id=app_current_clinic()) with check(app_rls_bypass() or clinic_id=app_current_clinic());
revoke delete on inventory_item,inventory_batch from ${app_role};
revoke update,delete on inventory_movement from ${app_role};

create function guard_inventory_batch() returns trigger language plpgsql as $$
begin
 if tg_op='INSERT' then
  if new.quantity <> 0 then raise exception 'El saldo inicial se registra mediante una entrada'; end if;
  if not exists(select 1 from inventory_item where id=new.item_id and clinic_id=new.clinic_id)
   or not exists(select 1 from site where id=new.site_id and clinic_id=new.clinic_id) then
   raise exception 'El insumo o la sede no pertenece a la clínica';
  end if;
 elsif (new.id,new.clinic_id,new.item_id,new.site_id,new.lot,new.expires_on)
   is distinct from (old.id,old.clinic_id,old.item_id,old.site_id,old.lot,old.expires_on)
   or (new.quantity is distinct from old.quantity and pg_trigger_depth()<2) then
  raise exception 'El lote y su saldo solo se modifican mediante movimientos';
 end if;
 return new;
end $$;
create trigger tg_inventory_batch_guard before insert or update on inventory_batch for each row execute function guard_inventory_batch();

create function apply_inventory_movement() returns trigger language plpgsql as $$
declare b inventory_batch%rowtype;
begin
 select * into b from inventory_batch where id=new.batch_id and clinic_id=new.clinic_id for update;
 if not found then raise exception 'Lote no encontrado'; end if;
 if not exists(select 1 from app_user where id=new.created_by and clinic_id=new.clinic_id and active) then raise exception 'Usuario no válido'; end if;
 if new.kind in ('ENTRY','TRANSFER_IN') and new.delta<0
  or new.kind in ('CONSUMPTION','DISCARD','TRANSFER_OUT') and new.delta>0 then raise exception 'Signo incorrecto del movimiento'; end if;
 if new.kind='CONSUMPTION' and b.expires_on < (now() at time zone 'America/Bogota')::date then raise exception 'No se puede consumir un lote vencido'; end if;
 new.balance := b.quantity+new.delta;
 if new.balance<0 then raise exception 'Existencias insuficientes'; end if;
 update inventory_batch set quantity=new.balance where id=b.id;
 return new;
end $$;
create trigger tg_inventory_movement_apply before insert on inventory_movement for each row execute function apply_inventory_movement();
create function immutable_inventory_movement() returns trigger language plpgsql as $$
begin raise exception 'Los movimientos no se modifican ni se borran'; end $$;
create trigger tg_inventory_movement_immutable before update or delete on inventory_movement for each row execute function immutable_inventory_movement();
