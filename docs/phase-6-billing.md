# Facturación y RIPS — alcance actual

## Fase 5 verificada

- Lista de precios, presupuestos, aceptación y realización de procedimientos.
- Estado de cuenta, pagos, recibos y anulaciones por administrador.
- Apertura y cierre de caja, conciliación de efectivo y protección de sesiones cerradas.
- Bloqueo de sesión compartido por cobros, anulaciones y cierres. Una prueba concurrente comprueba
  que un cobro rechazado queda fuera del cierre y uno aceptado queda incluido.
- El listado incluye todas las cajas abiertas, aunque su apertura no esté entre los 30 turnos recientes.
- Entradas de dinero con validación numérica y presentación de centavos sin transformar el importe.

## Fase 6 implementada en esta entrega

1. Perfil fiscal por clínica: razón social, NIT sin DV, código de prestador REPS, dirección, municipio y correo.
2. Creación de borradores desde ítems realizados de planes aceptados, completados o cancelados que
   conservan procedimientos realizados. Los importes se copian del presupuesto.
3. Reserva de cada ítem en un único documento activo, protegida con un índice único y bloqueos.
4. Copia del paciente al crear el documento. Nacionalidad, residencia y cobertura se diligencian
   explícitamente; no se infieren de la aseguradora ni de la cédula.
5. Vinculación de cada servicio a una evolución firmada del mismo paciente, comprobando su hash.
6. Clasificación de consultas y procedimientos. Fecha y diagnósticos provienen de la evolución;
   los códigos administrativos provienen de lo que registra el administrador.
7. Revisión local, preparación con datos fijos, cancelación con motivo, vista previa y descarga de borrador.
8. Aislamiento por clínica y RLS para los documentos, perfiles y reservas. Acceso inicial solo de ADMIN,
   para conservar las restricciones existentes sobre datos clínicos.

`PREPARED` significa que los datos superaron la revisión local y se fijó su copia. No representa aceptación
de DIAN ni del Ministerio. El puerto `ElectronicInvoiceProvider` informa que aún falta el proveedor;
esta entrega no contiene un adaptador HTTP de emisión.

La exportación se denomina `RIPS_BORRADOR_OCL-*.json`, incluye `numFactura: null` y solo se ofrece
para un documento preparado. No se generan CUFE, XML firmado ni CUV. El borrador está limitado a
un paciente que también actúa como adquiriente y a servicios de consulta/procedimiento por evento.

## Comprobaciones y límites

Las pruebas de integración comprueban importes y descuentos, bloqueo de preparación con datos
faltantes, estructura de consultas y procedimientos, fechas en Colombia, copias preparadas inmutables,
reservas concurrentes, cancelación, roles y aislamiento entre clínicas.

La revisión local verifica la presencia y el formato de los campos implementados, referencias a
evoluciones firmadas, residencia en Colombia, SIRAS cuando corresponde y coherencia básica de los
pagos moderadores. Los importes RIPS que requieren enteros se rechazan si tienen centavos; no se
redondean. Una cantidad mayor que uno requiere registrar cada atención individualmente antes de
preparar sus RIPS.

No se valida aún la pertenencia de todos los códigos a los catálogos oficiales ni todas las reglas
cruzadas del MUV. Tampoco se soportan facturas a ERP, contratos, cápita, notas crédito/débito,
otros tipos de servicios o la extensión completa de salud del XML. Estos puntos siguen pendientes.

## Siguiente integración

1. Seleccionar proveedor y obtener acceso de pruebas. Configurar credenciales en servidor sin
   exponerlas al navegador, con aislamiento por clínica.
2. Implementar su contrato real: datos tributarios y de salud, rangos autorizados, impuestos,
   solicitudes con idempotencia, consulta de estados y reintentos que no dupliquen facturas.
3. Persistir identificadores, número de FEV, XML, CUFE y las respuestas verificables del proveedor.
4. Actualizar el RIPS con el número emitido y comprobar catálogos y reglas oficiales.
5. Conectar el mecanismo de validación FEV-RIPS, conservar rechazos y almacenar el CUV real.
6. Completar correcciones por notas crédito/débito y los escenarios adicionales de facturación.

## Fuentes técnicas oficiales consultadas

- [Resolución 0948 de 2026](https://www.minsalud.gov.co/sites/rid/Lists/BibliotecaDigital/RIDE/DE/DIJ/resolucion-0948-de-2026.pdf)
- [Documento técnico 1 v003, julio 15 de 2026](https://www.minsalud.gov.co/sites/rid/Lists/BibliotecaDigital/RIDE/DE/OT/doc-tec1-tecnicas-datos-validacion-rips-fev-salud.pdf)
- [Ejemplos oficiales de estructura RIPS](https://www.minsalud.gov.co/sites/rid/Lists/BibliotecaDigital/RIDE/DE/OT/ejemplificaciones-estructura-resolucion-948-de-2026.zip)
- [Documentación y acceso al MUV](https://contenidos.sispro.gov.co/central-financiamiento/Pages/facturacion-electronica.aspx)
- [Habilitación como facturador electrónico DIAN](https://micrositios.dian.gov.co/sistema-de-facturacion-electronica/proceso-de-registro-y-habilitacion-como-facturador-electronico/)
