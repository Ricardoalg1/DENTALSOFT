-- Refuerzo independiente de V13: conserva la migración iniciada anteriormente.
alter table patient_aud add column whatsapp_consent_at timestamptz;
alter table messaging_settings add column ai_enabled boolean not null default false;
alter table message add column simulated boolean not null default true;
alter table message add column button_payload varchar(100);
alter table message add column delivery_status varchar(20);
alter table message add column provider_timestamp timestamptz;
alter table message add column reply_for uuid references message(id);
create unique index ux_message_reply on message(reply_for) where reply_for is not null;
create index ix_message_queue on message(clinic_id,created_at) where status in ('QUEUED','RECEIVED');
alter table message drop constraint message_intent_check;
alter table message add constraint message_intent_check check(intent in ('CONFIRM','CANCEL','RESCHEDULE','QUESTION','OTHER','OPT_OUT'));

create function guard_message_origin() returns trigger language plpgsql as $$
begin
 if new.patient_id is not null and not exists(select 1 from patient where id=new.patient_id and clinic_id=new.clinic_id) then raise exception 'Paciente no válido' using errcode='check_violation'; end if;
 if new.appointment_id is not null and not exists(select 1 from appointment where id=new.appointment_id and clinic_id=new.clinic_id and patient_id=new.patient_id) then raise exception 'Cita no válida' using errcode='check_violation'; end if;
 if new.reply_for is not null and not exists(select 1 from message where id=new.reply_for and clinic_id=new.clinic_id and direction='IN') then raise exception 'Respuesta no válida' using errcode='check_violation'; end if;
 if tg_op='UPDATE' and (new.id,new.clinic_id,new.patient_id,new.appointment_id,new.direction,new.kind,new.phone,new.body,new.created_at,new.simulated,new.appointment_starts_at,new.reply_for)
  is distinct from (old.id,old.clinic_id,old.patient_id,old.appointment_id,old.direction,old.kind,old.phone,old.body,old.created_at,old.simulated,old.appointment_starts_at,old.reply_for) then
  raise exception 'No se modifica el origen de un mensaje' using errcode='check_violation';
 end if;
 return new;
end $$;
create trigger tg_message_origin before insert or update on message for each row execute function guard_message_origin();
