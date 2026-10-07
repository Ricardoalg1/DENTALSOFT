package lat.occlus.clinical;

import java.util.Set;

/**
 * Lo que se puede marcar en el odontograma. Unas condiciones van en una superficie (caries, resina…)
 * y otras en el diente completo (corona, endodoncia…).
 */
public enum OdontogramCondition {
    // Superficie
    CARIES(true),
    RESIN(true),
    AMALGAM(true),
    SEALANT(true),
    TEMPORARY_FILLING(true),
    // Diente completo
    FRACTURE(false),
    CROWN(false),
    ROOT_CANAL(false),
    ROOT_CANAL_INDICATED(false),
    EXTRACTION_INDICATED(false),
    REMNANT_ROOT(false),
    MISSING(false),
    IMPLANT(false),
    UNERUPTED(false);

    private final boolean surface;

    OdontogramCondition(boolean surface) {
        this.surface = surface;
    }

    /** true: se marca en una superficie; false: aplica al diente completo. */
    public boolean isSurface() {
        return surface;
    }

    /** Ausente, implante y sin erupcionar describen todo el diente: no conviven con otras marcas. */
    public boolean isExclusive() {
        return this == MISSING || this == IMPLANT || this == UNERUPTED;
    }

    /** Marcas que esta reemplaza al registrarse, p. ej. la endodoncia hecha reemplaza a la indicada. */
    public Set<OdontogramCondition> replaces() {
        return switch (this) {
            case ROOT_CANAL -> Set.of(ROOT_CANAL_INDICATED);
            case CROWN -> Set.of(FRACTURE);
            default -> Set.of();
        };
    }
}
