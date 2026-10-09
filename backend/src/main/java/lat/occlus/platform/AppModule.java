package lat.occlus.platform;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * Módulos opcionales que se habilitan por cliente. Lo que NO está aquí (pacientes, agenda, sedes,
 * equipo) es el núcleo y siempre está disponible mientras la suscripción dé acceso.
 *
 * <p>Los nombres coinciden con los permitidos por las restricciones CHECK de la base de datos
 * (V19): agregar un módulo exige también una migración.
 */
public enum AppModule {
    CLINICAL_RECORD("Historia clínica",
            "Antecedentes, evoluciones, odontograma, archivos y consentimientos informados."),
    TREATMENTS_CASH("Tratamientos y caja",
            "Lista de precios, presupuestos, planes de tratamiento, caja y recibos."),
    BILLING_RIPS("Facturación y RIPS",
            "Borradores de factura electrónica y datos RIPS.", CLINICAL_RECORD, TREATMENTS_CASH),
    INVENTORY("Inventario", "Insumos, lotes, vencimientos y movimientos por sede."),
    REPORTS("Reportes", "Recaudo, producción, agenda y cartera.", TREATMENTS_CASH),
    MESSAGING("Mensajes (WhatsApp)", "Recordatorios de cita y bandeja de respuestas.");

    private final String label;
    private final String description;
    private final Set<AppModule> requires;

    AppModule(String label, String description, AppModule... requires) {
        this.label = label;
        this.description = description;
        this.requires = Set.of(requires);
    }

    public String label() {
        return label;
    }

    public String description() {
        return description;
    }

    /** Módulos que deben estar habilitados para poder usar este. */
    public Set<AppModule> requires() {
        return requires;
    }

    /**
     * Revisa que ningún módulo del conjunto dependa de otro que no esté. Devuelve los problemas en
     * español (lista vacía = conjunto válido).
     */
    public static List<String> dependencyProblems(Set<AppModule> modules) {
        var problems = new ArrayList<String>();
        for (AppModule m : modules) {
            for (AppModule needed : m.requires) {
                if (!modules.contains(needed)) {
                    problems.add("«%s» requiere «%s».".formatted(m.label, needed.label));
                }
            }
        }
        return problems;
    }
}
