package lat.occlus.appointment;

/** Tipo de cita. Define, entre otras cosas, qué mensaje de invitación por WhatsApp se le envía al paciente. */
public enum VisitType {
    FIRST_VISIT("Primera vez"),
    CONTROL("Control"),
    TREATMENT("Tratamiento"),
    PREVENTION("Promoción y prevención (P&P)");

    private final String label;

    VisitType(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }
}
