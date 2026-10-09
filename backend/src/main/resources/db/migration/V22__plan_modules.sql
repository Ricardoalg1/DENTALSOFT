-- Módulos por plan (decisión de producto, editable desde el panel de plataforma).
--
-- Criterio: lo que el sitio ya promete en cada plan, y los módulos con costo variable o carga
-- regulatoria fuera de las tarifas fijas:
--   · Mensajes (WhatsApp): cada conversación tiene costo con el proveedor y crece con el uso.
--   · Facturación y RIPS: exige facturador autorizado ante la DIAN (Dataico) y soporte regulatorio.
-- Ambos van en el plan Global (precio pactado) y se pueden agregar a cualquier cliente como adicional.
--
-- Solo cambia el catálogo: las clínicas que ya tienen plan conservan los módulos que tienen.
update subscription_plan set modules = array['CLINICAL_RECORD', 'TREATMENTS_CASH']::varchar[] where code = 'ESENCIAL';
update subscription_plan set modules = array['CLINICAL_RECORD', 'TREATMENTS_CASH', 'REPORTS']::varchar[] where code = 'EQUIPO';
update subscription_plan set modules = array['CLINICAL_RECORD', 'TREATMENTS_CASH', 'REPORTS', 'INVENTORY']::varchar[] where code = 'INTEGRAL';
update subscription_plan set modules = array['CLINICAL_RECORD', 'TREATMENTS_CASH', 'REPORTS', 'INVENTORY', 'BILLING_RIPS', 'MESSAGING']::varchar[] where code = 'GLOBAL';
