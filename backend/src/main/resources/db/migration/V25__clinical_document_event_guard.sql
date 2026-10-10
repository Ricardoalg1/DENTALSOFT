-- Pertenencia a la misma clínica para pacientes y operadores de exportación.

create function guard_clinical_document_event() returns trigger language plpgsql as $$
begin
    if not exists(select 1 from patient where id=new.patient_id and clinic_id=new.clinic_id)
       or not exists(select 1 from app_user where id=new.actor_id and clinic_id=new.clinic_id and active) then
        raise exception 'Referencias de documento clínico inválidas' using errcode='23514';
    end if;
    return new;
end $$;
create trigger clinical_document_event_refs before insert on clinical_document_event
for each row execute function guard_clinical_document_event();
