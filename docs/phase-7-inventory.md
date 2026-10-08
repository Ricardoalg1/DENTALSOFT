# Fase 7 — Inventario

## Uso

1. Un administrador crea el insumo en **Inventario → Agregar insumo**, con código único,
   nombre, unidad, stock mínimo y si requiere lote y vencimiento.
2. Seleccionar sede y registrar una **Entrada** por compra o inventario inicial.
3. Registrar **Consumo** cuando se utilice material y **Baja / descarte** si se pierde o vence.
4. Un **Traslado** mueve exactamente el mismo insumo, lote y fecha entre dos sedes activas.
5. Un administrador registra **Ajuste** tras un conteo físico: diferencia positiva o negativa,
   nunca el saldo total. El motivo documenta la corrección.

## Alcance

- Catálogo por clínica: código, nombre, unidad, mínimo y activación/desactivación.
- Existencias por sede y lote. Insumos sin control de lote tienen un saldo por sede.
- Cantidades con hasta tres decimales; la unidad es explícita y no se convierte automáticamente.
- El mínimo del insumo se aplica a cada sede.
- Disponible = saldo físico menos saldo en lotes vencidos. Las alertas de mínimo usan disponible.
- Vencido = fecha anterior a hoy en Colombia. Próximo a vencer = hoy a hoy + 30 días.
- Historial visible de los últimos 200 movimientos de la clínica, con filtro por sede y búsqueda.
- Entrada, consumo, baja, ajuste y traslado. Cada traslado genera dos registros con igual operation_id.
- Motivo obligatorio; referencia opcional para compra/remisión. Usuario y fecha guardados en servidor.
- Movimientos inmutables; los errores se corrigen con un movimiento compensatorio y motivo.
- Detección de reenvíos mediante operation_id: una operación registrada devuelve conflicto para
   evitar volver a aplicar la cantidad. Revisar historial antes de iniciar una operación distinta.
- Unidad y control de lotes no cambian una vez registrado un lote/saldo. Desactivar conserva historial.

## Permisos

| Acción | Administrador | Auxiliar | Odontólogo / Recepción |
|---|---|---|---|
| Consultar inventario e historial | Sí | Sí | Sí |
| Crear/editar/reactivar insumos | Sí | No | No |
| Entradas, consumos, bajas y traslados | Sí | Sí | No |
| Ajustes | Sí | No | No |

## Protección de datos y concurrencia

- El tenant se toma del JWT; todas las consultas filtran clinic_id y las tablas aplican RLS.
- Sedes y usuarios deben pertenecer a la clínica; los movimientos exigen sedes activas.
- Los movimientos se serializan mediante bloqueo por insumo; el trigger bloquea también el saldo.
- Un traslado es una sola transacción: se confirman ambos movimientos o ninguno.
- La BD aplica el saldo, impide negativos y evita consumos de lotes vencidos.
- Un lote conserva su vencimiento y no se puede editar su identidad ni modificar el saldo directamente.
- No se eliminan insumos, lotes ni movimientos desde el rol de aplicación.

## API y archivos

- `GET /api/inventory`: catálogo, saldos e historial reciente.
- `POST /api/inventory/items`: crear insumo.
- `PUT /api/inventory/items/{id}`: modificar catálogo.
- `POST /api/inventory/movements`: registrar movimiento (204).
- Migraciones: `V11__inventory.sql` y `V12__inventory_item_guard.sql`. Flyway las aplica al iniciar el backend.
- UI: `/app/inventario`.

El consumo se registra manualmente: no se descuenta material automáticamente al realizar tratamientos.
Compras a proveedores, órdenes de compra, valorización contable y alertas por WhatsApp quedan fuera
de este alcance. Los reportes agregados corresponden a la fase 8.

## Comprobaciones realizadas

Compilación del backend Java y build de producción del frontend; lint de los archivos modificados.
No se ejecutó la suite de pruebas en esta implementación.
