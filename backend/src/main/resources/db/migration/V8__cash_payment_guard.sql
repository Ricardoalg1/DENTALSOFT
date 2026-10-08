-- Serializa cobros y anulaciones con el cierre del turno, incluso desde SQL directo.
create function guard_payment_session() returns trigger language plpgsql as $$
declare s cash_session%rowtype;
begin
    select * into s from cash_session where id = new.cash_session_id for update;
    if not found or s.clinic_id <> new.clinic_id then
        raise exception 'Caja no válida' using errcode = 'integrity_constraint_violation';
    end if;
    if s.closed_at is not null then
        raise exception 'La caja de ese pago ya se cerró' using errcode = 'integrity_constraint_violation';
    end if;
    return new;
end $$;
create trigger tg_payment_session_guard before insert or update on payment
    for each row execute function guard_payment_session();
