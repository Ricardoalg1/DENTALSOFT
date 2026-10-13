# Catálogo CUPS de odontología

Disponible para usuarios autenticados en **Catálogo CUPS** (`/app/cups`). Incluye búsqueda por código o descripción (ignora tildes y admite códigos con puntos), diez categorías, orden por código o descripción, detalle jerárquico y copia al portapapeles.

Los administradores con Tratamientos y caja pueden elegir **Agregar a precios**. Abre el formulario existente con nombre, categoría y CUPS; el precio lo define la clínica antes de guardar. También se puede buscar y seleccionar el CUPS al editar procedimientos. Se conservan las autorizaciones, el aislamiento por clínica y las copias históricas de tratamientos del flujo existente.

## Fuente y actualización

Selección de 175 códigos de seis dígitos del **Anexo técnico 2, sin puntos y con tildes**, de la Resolución 2706 de 2025. Las descripciones se conservan tal como aparecen en el archivo oficial; las categorías son una agrupación de Occlus.

Fuente: https://www.minsalud.gov.co/sites/rid/Lists/BibliotecaDigital/RIDE/DE/DIJ/resolucion-2706-de-2025.zip

SHA-256 del XLSX utilizado: `1e884fe89d8480ef0ad48ab59faf3a5af450737774834875f12820734b8826bd`.

La selección toma los capítulos 23 y 24, radiografías intraorales 8704, procedimientos 8931, consultas 890 que mencionan odontología, educación 990103/990112/990203/990212 y prevención 997. No representa toda la lista tabular CUPS ni una certificación automática de validez para radicación. No incluye las guías clínicas ni las recomendaciones de facturación de DentOS.

Para reproducir los datos, descarga el ZIP oficial y ejecuta desde el repositorio:

```sh
python3 scripts/import-cups-2026.py /ruta/resolucion-2706-de-2025.zip
```

Al actualizar la normativa, revisa el anexo, los criterios de selección y la documentación antes de reemplazar el catálogo. El catálogo se entrega con el frontend y no depende de consultas externas durante su uso.
