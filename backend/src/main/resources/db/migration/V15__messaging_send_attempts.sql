-- Persistir el intento antes de contactar a Meta evita reenvíos tras un reinicio.
alter table message drop constraint message_status_check;
alter table message add constraint message_status_check check(status in ('QUEUED','SENDING','SENT','SIMULATED','FAILED','RECEIVED','PROCESSED'));
alter table message add column attempt_started_at timestamptz;
