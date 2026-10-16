package lat.occlus.biosafety;

import java.util.List;

/**
 * Tipos de registro de bioseguridad y los campos propios de cada uno (se guardan en data y se validan con esta
 * especificación; el frontend usa la misma en lib/biosafety.ts).
 */
public enum BiosafetyKind {
    STERILIZATION(List.of(
            Field.text("equipment", true, 100),
            Field.text("cycleNumber", true, 30),
            Field.text("load", false, 300),
            Field.number("temperature", false, 0, 200),
            Field.number("pressure", false, 0, 100),
            Field.number("durationMin", false, 1, 300),
            Field.choice("chemicalIndicator", true, "PASS", "FAIL"),
            Field.choice("biologicalIndicator", true, "PASS", "FAIL", "NOT_APPLICABLE"))),
    CLEANING(List.of(
            Field.choice("area", true, "OPERATORY", "WAITING", "RESTROOM", "STERILIZATION", "LAB", "OTHER"),
            Field.choice("cleaningType", true, "ROUTINE", "TERMINAL"),
            Field.text("product", true, 100),
            Field.text("concentration", false, 50))),
    WASTE(List.of(
            Field.choice("wasteType", true, "BIOSANITARY", "SHARPS", "ANATOMOPATHOLOGICAL", "CHEMICAL", "AMALGAM",
                    "RECYCLABLE", "ORDINARY"),
            Field.number("weightKg", true, 0.001, 10000),
            Field.text("collector", false, 150),
            Field.text("certificate", false, 60))),
    ENVIRONMENT(List.of(
            Field.choice("place", true, "REFRIGERATOR", "ROOM", "STERILIZATION"),
            Field.number("temperature", true, -30, 60),
            Field.number("humidity", false, 0, 100))),
    MAINTENANCE(List.of(
            Field.text("equipment", true, 100),
            Field.choice("maintenanceType", true, "PREVENTIVE", "CORRECTIVE", "CALIBRATION"),
            Field.text("provider", false, 150),
            Field.date("nextDue", false),
            Field.number("cost", false, 0, 9_999_999_999.0))),
    ACCIDENT(List.of(
            Field.text("affectedPerson", true, 150),
            Field.choice("exposureType", true, "PUNCTURE", "CUT", "MUCOSA_SPLASH", "SKIN_SPLASH", "OTHER"),
            Field.text("description", true, 500),
            Field.text("actions", true, 500),
            Field.bool("reportedToArl", true)));

    private final List<Field> fields;

    BiosafetyKind(List<Field> fields) {
        this.fields = fields;
    }

    public List<Field> fields() {
        return fields;
    }

    public enum Type { TEXT, NUMBER, DATE, BOOL, CHOICE }

    public record Field(String name, Type type, boolean required, double min, double max, int maxLength, List<String> options) {
        static Field text(String name, boolean required, int maxLength) {
            return new Field(name, Type.TEXT, required, 0, 0, maxLength, List.of());
        }

        static Field number(String name, boolean required, double min, double max) {
            return new Field(name, Type.NUMBER, required, min, max, 0, List.of());
        }

        static Field date(String name, boolean required) {
            return new Field(name, Type.DATE, required, 0, 0, 0, List.of());
        }

        static Field bool(String name, boolean required) {
            return new Field(name, Type.BOOL, required, 0, 0, 0, List.of());
        }

        static Field choice(String name, boolean required, String... options) {
            return new Field(name, Type.CHOICE, required, 0, 0, 0, List.of(options));
        }
    }
}
