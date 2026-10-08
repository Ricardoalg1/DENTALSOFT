-- Refuerzo de las reservas para instalaciones que ya aplicaron V9.
create function guard_invoice_reservation() returns trigger language plpgsql as $$
declare source treatment_item%rowtype; document billing_invoice%rowtype;
begin
    if new.active then
        select * into source from treatment_item where id=new.source_item_id for update;
        if not found or source.clinic_id<>new.clinic_id or source.status<>'DONE' then
            raise exception 'Solo se reservan procedimientos realizados de la clínica' using errcode='integrity_constraint_violation';
        end if;
        select * into document from billing_invoice where id=new.invoice_id;
        if not found or document.clinic_id<>new.clinic_id or document.plan_id<>source.plan_id or document.status='CANCELLED' then
            raise exception 'El documento no corresponde al procedimiento' using errcode='integrity_constraint_violation';
        end if;
    end if;
    return new;
end $$;
create trigger tg_invoice_reservation before insert or update on invoice_reservation
    for each row execute function guard_invoice_reservation();
