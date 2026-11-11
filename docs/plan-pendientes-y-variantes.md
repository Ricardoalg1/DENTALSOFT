# Occlus: qué falta y plan de variantes (veterinaria y medicina)

Revisión del 10 de noviembre de 2026 sobre la rama `development` (v1.6.4).

## 1. Qué falta para terminar Occlus (odontología)

### Bloquean la operación con clientes reales

| # | Pendiente | Estado hoy |
|---|---|---|
| P1 | **Factura electrónica DIAN** | Solo hay borradores (`OCL-*`) y una consulta GET a Dataico. No se emite: no hay POST de emisión, XML, CUFE, notas crédito o débito, ni perfil fiscal y numeración por clínica. |
| P2 | **RIPS validado** | Se genera un JSON en borrador con `numFactura: null`. Falta validarlo contra el MUV y obtener el CUV, y faltan los escenarios de contrato y cápita. |
| P3 | **WhatsApp real** | `WHATSAPP_LIVE_ENABLED=false` en producción. Solo se admite un número de Meta por despliegue, sin onboarding por clínica (Embedded Signup). Tampoco hay cuenta de WhatsApp Business ni plantilla de recordatorio (lista de `Tasks.md`). |
| P4 | **Correos clínicos y notificaciones** | `CLINICAL_MAIL_ENABLED=false`. SES ya funciona para recuperar contraseña y para reservas. Faltan los recordatorios por correo (lista de `Tasks.md`). |
| P5 | **Pasarelas de pago** | Wompi, ePayco y Mercado Pago están implementadas, pero apagadas por defecto en el compose. Hay que confirmar cuál queda activa en producción. |

### Funciones planeadas sin construir

| # | Pendiente | Origen |
|---|---|---|
| F1 | **Sugerencias CIE-10** con motor propio: hasta 3 códigos con la frase que los originó y confirmación con un clic. | Decisión del 7 de noviembre. Solo existe el buscador `Icd10Service`. |
| F2 | **Visor DICOM 2D** de radiografías | Decisión del 7 de noviembre. Archivos solo guarda y muestra PDF e imágenes. |
| F3 | **Correos de cumpleaños** con autorización del paciente y activación por clínica | Decisión del 7 de noviembre. Hoy solo existe la lista de cumpleaños en Seguimiento. |
| F4 | **Límite de usuarios por plan** aplicado en el backend | Se repite en los pendientes de `implementacion-completa.md`. |
| F5 | **Compras y órdenes de inventario** con valorización | Fuera del alcance de la fase 7. |
| F6 | **Cliente TypeScript generado desde OpenAPI** | Deuda técnica, no la ve el usuario. |
| F7 | **Arreglo de `OnlineBookingTests`** (`nanoTime().substring`) | 5 pruebas fallan por un error de la propia prueba, no del producto. |

### Fuera de la aplicación (`Tasks.md`)

- Página de Instagram.
- Cuenta de WhatsApp Business (ligada a P3).

## 2. Cuánto está atado a odontología

- **Backend:** 73 de los archivos Java mencionan odontología.
- **Frontend:** 87 archivos.

Los puntos de acoplamiento reales son pocos y concretos:

| Pieza | Atadura a odontología | Qué cambia por variante |
|---|---|---|
| Rol `DENTIST` (`user/Role.java`) | Lo usan agenda, horarios (`DentistSchedule`), caja, reservas, informes y permisos. | Pasa a ser un rol genérico `PROFESSIONAL` con una etiqueta por vertical: Odontólogo, Médico o Veterinario. |
| Paciente | Es una persona con documento colombiano. | **Veterinaria:** el paciente es la mascota (especie, raza, sexo, esterilizado, peso, microchip), que pertenece a un **tutor** con documento. La persona que paga es el tutor. |
| Historia clínica | Los antecedentes y `Habit` son orales. La evolución tiene campos genéricos y CIE-10. | **Medicina:** signos vitales, revisión por sistemas y examen físico por sistemas. **Veterinaria:** peso, temperatura, condición corporal y anamnesis. |
| Odontograma y periodontograma | Son exclusivos de odontología. | Se ocultan en las otras verticales. Veterinaria usa vacunas y desparasitaciones. Medicina usa fórmula médica, órdenes de laboratorio e incapacidades. |
| Catálogo CUPS | 175 códigos dentales (capítulos 23 y 24, 8704, 8931 y otros). | **Medicina:** otra selección CUPS, como consultas 890 y laboratorio 90. **Veterinaria:** sin CUPS, con catálogo propio de servicios. |
| RIPS y factura del sector salud | Aplica a odontología y medicina. | **Veterinaria no es sector salud:** factura electrónica normal sin RIPS, y el módulo BILLING_RIPS se cambia por facturación simple. |
| Consentimientos (`DefaultConsentTemplates`) | Son plantillas dentales. | Plantillas propias por vertical, por ejemplo cirugía o eutanasia en veterinaria. |
| Bioseguridad | Es casi genérica (esterilización, residuos). | Se reutiliza tal cual. |
| Sitio público (`site/`) y marca | Occlus es un nombre dental. | Cada vertical necesita su marca, dominio y textos. |

**Se reutiliza sin cambios:** multi-clínica con RLS, sedes, equipo, login con 2FA, agenda, reserva en línea, caja, presupuestos y tratamientos, inventario, informes, mensajes, plataforma (planes, módulos y suscripciones), migración de datos, dictado, auditoría, documentos con membrete, despliegue y seguridad. Calculo que es entre el 70 y el 80 % del producto.

## 3. Arquitectura propuesta: una sola base de código con «vertical» por clínica

- **Un mismo repositorio y un mismo backend.** Cada clínica tiene `vertical = DENTAL | MEDICAL | VETERINARY`, que se fija al crearla desde el panel de plataforma y no se puede cambiar después.
- **El vertical decide qué se activa:**
  - qué módulos se pueden habilitar, por ejemplo ODONTOGRAM solo en DENTAL y VACCINATION solo en VETERINARY;
  - las etiquetas (paciente o mascota, odontólogo o médico);
  - el catálogo de procedimientos, las plantillas de consentimiento y los campos de la historia.
- **Marca por dominio.** Cada vertical tiene su dominio (por ejemplo occlus.lat y dos dominios nuevos) y su `site/`. La app lee el vertical de la sesión y muestra logo y textos sin compilar tres veces.
- **Ventajas:**
  - un solo despliegue en la EC2 actual, sin costo extra de AWS;
  - una corrección de seguridad llega a las tres verticales a la vez;
  - la plataforma ve a todos los clientes en un panel.
- **Descarté hacer copias (forks) del repositorio:** triplica el mantenimiento y las correcciones de seguridad como las de v1.6.3 habría que aplicarlas tres veces.

## 4. Fases

| Fase | Contenido | Tamaño |
|---|---|---|
| **V0. Base genérica** | Migración: `clinic.vertical` (por defecto DENTAL) y `Role.DENTIST`→`PROFESSIONAL` con la columna renombrada y el valor migrado. Etiquetas por vertical en el frontend. Módulos condicionados por vertical. Odontograma, periodontograma y CUPS dental pasan a ser módulos «solo DENTAL». **No cambia nada visible para las clínicas dentales actuales.** | Grande, toca casi todo; es la fase de más riesgo |
| **V1. Medicina** | Historia médica: signos vitales, sistemas, examen físico, CIE-10 completo y diagnósticos relacionados. Fórmula médica, órdenes de laboratorio e imágenes, incapacidades y remisiones. Catálogo CUPS médico. Consentimientos médicos. RIPS de consulta y procedimiento (reutiliza la fase 6). | Media |
| **V2. Veterinaria** | Modelo tutor→mascotas (tabla `pet` o paciente con `owner_id`). Especie, raza y peso con curva. Carné de vacunas y desparasitación con recordatorios. Historia veterinaria. Hospitalización básica. Catálogo de servicios propio. Facturación sin RIPS. Agenda y reserva en línea a nombre del tutor. | Media-grande |
| **V3. Marca y sitio** | Dominios, logos, `site/` por vertical y planes de precio por vertical en la plataforma. | Media |

Orden recomendado:
1. **V0 completa.**
2. Paralelamente, terminar **P1 y P2 (DIAN y RIPS)**, que también necesita medicina.
3. **V1**, que es la más cercana al producto dental.
4. **V2**.

Cada fase se publica con el flujo de siempre (development → test → production → main), con snapshot de RDS antes de las migraciones.

## 5. Decisiones tomadas (10 de noviembre de 2026)

1. **Marcas separadas** para medicina y veterinaria, cada una con su nombre, dominio y sitio público. El código y el servidor se comparten. Los nombres y dominios están por definir.
2. **Medicina:** empieza por **medicina general**.
3. **Veterinaria:** solo **perros y gatos**.

## 6. Avance

- v1.7 (en `development`): **visor DICOM**, **correos de cumpleaños** (F2 y F3) y **límite de usuarios por plan** (F4). El backend ya aplicaba el límite; se añadieron el cupo en Equipo y el aviso al reactivar a alguien.
- v1.7 también: el visor abre **series DICOM en ZIP** (hasta 90 MB; el backend guarda solo los DICOM, renombrados), las ordena por posición del corte y suma herramientas de medición (ángulos, regiones con HU, notas, calibración) y de ajuste (ventanas de TC, nitidez, ecualización, colores, lupa).
