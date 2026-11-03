-- Nombre con el que cada colaborador firma sus documentos (p. ej. «Dra. Camila Morales»).
-- Vacío: se usa «Dr(a). » + nombre completo para profesionales, o el nombre completo para los demás.
alter table user_document_profile add column display_name varchar(120);
