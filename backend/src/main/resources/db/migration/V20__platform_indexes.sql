-- "Última actividad" de cada cliente en el panel de plataforma: la fecha de la última revisión de
-- auditoría de su clínica. Sin este índice sería una lectura completa de la tabla por cada cliente.
create index ix_audit_revision_clinic on audit_revision (clinic_id, rev_timestamp desc);
