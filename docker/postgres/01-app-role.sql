-- Rol con el que se conecta la aplicación. NO es superusuario ni dueño de las tablas,
-- así que las políticas de Row-Level Security sí le aplican.
-- Flyway usa el rol dueño (occlus) para migrar; los permisos se otorgan en las migraciones.
create role occlus_app login password 'occlus_app' nosuperuser nocreatedb nocreaterole nobypassrls;
