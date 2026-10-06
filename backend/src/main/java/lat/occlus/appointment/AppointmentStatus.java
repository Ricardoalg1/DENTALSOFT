package lat.occlus.appointment;

public enum AppointmentStatus {
    SCHEDULED,
    CONFIRMED,
    ATTENDED,
    NO_SHOW,
    CANCELLED;

    /** Programada o confirmada: aún se puede reprogramar o cambiar de estado. */
    public boolean isOpen() {
        return this == SCHEDULED || this == CONFIRMED;
    }

    /** Atendida, no asistió y cancelada son estados finales. */
    public boolean canMoveTo(AppointmentStatus next) {
        return isOpen() && next != this;
    }
}
