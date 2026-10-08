create function guard_inventory_item() returns trigger language plpgsql as $$
begin
 if (new.id,new.clinic_id,new.created_at) is distinct from (old.id,old.clinic_id,old.created_at) then
  raise exception 'No se modifica el origen del insumo' using errcode='check_violation';
 end if;
 if (new.unit,new.track_lots) is distinct from (old.unit,old.track_lots)
  and exists(select 1 from inventory_batch where item_id=old.id) then
  raise exception 'No se modifica la unidad o el control de lotes con existencias registradas' using errcode='check_violation';
 end if;
 return new;
end $$;
create trigger tg_inventory_item_guard before update on inventory_item for each row execute function guard_inventory_item();

