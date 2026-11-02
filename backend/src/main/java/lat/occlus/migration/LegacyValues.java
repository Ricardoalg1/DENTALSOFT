package lat.occlus.migration;

import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.Year;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import lat.occlus.patient.DocumentType;
import lat.occlus.patient.Patient;
import lat.occlus.patient.Regime;
import lat.occlus.patient.ResidenceZone;
import lat.occlus.patient.Sex;

/**
 * Interpreta los valores tal como los exportan otros programas: "Cédula de ciudadanía", "1.020.345.678",
 * "15/03/1990", "Femenino", "PEREZ GOMEZ JUAN"… Lo que no se puede interpretar lanza {@link RowException}
 * con un mensaje para mostrarle a la clínica.
 */
final class LegacyValues {

    private LegacyValues() {}

    /** Error de una fila: se reporta y la fila no se importa. */
    static final class RowException extends RuntimeException {
        RowException(String message) {
            super(message, null, false, false);
        }
    }

    static String text(String raw) {
        if (raw == null) return null;
        String s = raw.strip();
        return s.isEmpty() ? null : s;
    }

    /** Minúsculas, sin tildes ni puntos, espacios simples: "C.C." → "cc", "Cédula  de Ciudadanía" → "cedula de ciudadania". */
    static String key(String raw) {
        return Patient.normalize(raw).replace(".", "").replaceAll("[\\s_-]+", " ").trim();
    }

    // ---------- Documento ----------

    private static final Map<String, DocumentType> DOCUMENT_TYPES = Map.ofEntries(
            Map.entry("cedula", DocumentType.CC), Map.entry("cedula de ciudadania", DocumentType.CC),
            Map.entry("cedula ciudadania", DocumentType.CC), Map.entry("c", DocumentType.CC),
            Map.entry("tarjeta de identidad", DocumentType.TI), Map.entry("tarjeta identidad", DocumentType.TI),
            Map.entry("registro civil", DocumentType.RC), Map.entry("registro civil de nacimiento", DocumentType.RC),
            Map.entry("cedula de extranjeria", DocumentType.CE), Map.entry("cedula extranjeria", DocumentType.CE),
            Map.entry("pasaporte", DocumentType.PA), Map.entry("pep", DocumentType.PE),
            Map.entry("permiso especial de permanencia", DocumentType.PE), Map.entry("ppt", DocumentType.PT),
            Map.entry("permiso por proteccion temporal", DocumentType.PT),
            Map.entry("certificado de nacido vivo", DocumentType.CN), Map.entry("salvoconducto", DocumentType.SC),
            Map.entry("carne diplomatico", DocumentType.CD), Map.entry("documento extranjero", DocumentType.DE),
            Map.entry("adulto sin identificacion", DocumentType.AS),
            Map.entry("menor sin identificacion", DocumentType.MS));

    /** null si viene vacío. */
    static DocumentType documentType(String raw) {
        String k = text(raw) == null ? null : key(raw);
        if (k == null || k.isEmpty()) return null;
        String code = k.replace(" ", "").toUpperCase(Locale.ROOT);
        for (DocumentType t : DocumentType.values()) if (t.name().equals(code)) return t;
        DocumentType known = DOCUMENT_TYPES.get(k);
        if (known != null) return known;
        throw new RowException("Tipo de documento no reconocido: «%s»".formatted(raw.strip()));
    }

    private static final Pattern EXCEL_FLOAT = Pattern.compile("(\\d+)[.,]0+");
    private static final Pattern SCIENTIFIC = Pattern.compile("\\d+([.,]\\d+)?[eE]\\+?\\d+");
    private static final Pattern DOCUMENT = Pattern.compile("[A-Z0-9-]{3,20}");

    /** "1.020.345.678" → "1020345678". null si viene vacío. */
    static String documentNumber(String raw) {
        String s = text(raw);
        if (s == null) return null;
        if (SCIENTIFIC.matcher(s).matches()) {
            throw new RowException("El documento «%s» quedó en notación científica: en Excel dale formato de texto a esa columna y exporta de nuevo".formatted(s));
        }
        Matcher m = EXCEL_FLOAT.matcher(s);
        if (m.matches()) s = m.group(1);
        s = s.replaceAll("[\\s.,]", "").toUpperCase(Locale.ROOT);
        if (!DOCUMENT.matcher(s).matches()) {
            throw new RowException("Número de documento no válido: «%s» (solo letras, números y guiones, de 3 a 20)".formatted(raw.strip()));
        }
        return s;
    }

    // ---------- Fechas ----------

    record ParsedDate(LocalDateTime value, boolean dateOnly) {}

    private static final Pattern ISO = Pattern.compile(
            "(\\d{4})[-/.](\\d{1,2})[-/.](\\d{1,2})(?:[ t]+(\\d{1,2}):(\\d{2})(?::(\\d{2})(?:\\.\\d+)?)?)?\\s*(am|pm)?(?:z|[+-]\\d{2}:?\\d{2})?");
    private static final Pattern DMY = Pattern.compile(
            "(\\d{1,2})[-/.](\\d{1,2})[-/.](\\d{4}|\\d{2})(?:[ t]+(\\d{1,2}):(\\d{2})(?::(\\d{2}))?)?\\s*(am|pm)?");
    private static final Pattern TEXT_MONTH = Pattern.compile(
            "(\\d{1,2})(?:\\s*de)?[\\s/.-]*([a-z]{3,10})(?:\\s*de)?[\\s/.,-]*(\\d{4}|\\d{2})(?:[ t]+(\\d{1,2}):(\\d{2})(?::(\\d{2}))?)?\\s*(am|pm)?");
    private static final Pattern EXCEL_SERIAL = Pattern.compile("\\d{4,5}(\\.\\d+)?");
    private static final Map<String, Integer> MONTHS = Map.ofEntries(
            Map.entry("ene", 1), Map.entry("jan", 1), Map.entry("feb", 2), Map.entry("mar", 3),
            Map.entry("abr", 4), Map.entry("apr", 4), Map.entry("may", 5), Map.entry("jun", 6),
            Map.entry("jul", 7), Map.entry("ago", 8), Map.entry("aug", 8), Map.entry("sep", 9),
            Map.entry("set", 9), Map.entry("oct", 10), Map.entry("nov", 11), Map.entry("dic", 12),
            Map.entry("dec", 12));

    /**
     * Acepta 1990-03-15, 15/03/1990, 15-03-90, 15 de marzo de 1990, 15-mar-1990, con hora opcional
     * (14:30, 2:30 pm) y fechas seriales de Excel. Día/mes: si el primero pasa de 12 es el día; si el
     * segundo pasa de 12, el archivo está en formato de EE. UU. (mes/día). Si ambos caben, día/mes.
     * null si viene vacío.
     */
    static ParsedDate dateTime(String raw, String field) {
        String s = text(raw);
        if (s == null) return null;
        String k = Patient.normalize(s).replace("a. m.", "am").replace("p. m.", "pm")
                .replace("a.m.", "am").replace("p.m.", "pm").replaceAll("\\s+", " ");
        try {
            Matcher m;
            if ((m = ISO.matcher(k)).matches()) {
                return build(Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2)), Integer.parseInt(m.group(3)), m, 4);
            }
            if ((m = DMY.matcher(k)).matches()) {
                int a = Integer.parseInt(m.group(1)), b = Integer.parseInt(m.group(2));
                int year = year(m.group(3));
                return a <= 12 && b > 12 ? build(year, a, b, m, 4) : build(year, b, a, m, 4);
            }
            if ((m = TEXT_MONTH.matcher(k)).matches()) {
                Integer month = MONTHS.get(m.group(2).substring(0, 3));
                if (month != null) return build(year(m.group(3)), month, Integer.parseInt(m.group(1)), m, 4);
            }
            if (EXCEL_SERIAL.matcher(k).matches()) {
                double serial = Double.parseDouble(k);
                if (serial > 1 && serial < 80_000) {
                    var date = LocalDate.of(1899, 12, 30).plusDays((long) serial);
                    long minutes = Math.round((serial - Math.floor(serial)) * 24 * 60);
                    return new ParsedDate(date.atStartOfDay().plusMinutes(minutes), minutes == 0);
                }
            }
        } catch (DateTimeException | NumberFormatException e) {
            // cae al error de abajo
        }
        throw new RowException("%s no válida: «%s» (usa, por ejemplo, 15/03/1990)".formatted(field, s));
    }

    private static ParsedDate build(int year, int month, int day, Matcher m, int timeGroup) {
        var date = LocalDate.of(year, month, day);
        if (m.group(timeGroup) == null) return new ParsedDate(date.atStartOfDay(), true);
        int hour = Integer.parseInt(m.group(timeGroup));
        int minute = Integer.parseInt(m.group(timeGroup + 1));
        String ampm = m.group(timeGroup + 3);
        if ("pm".equals(ampm) && hour < 12) hour += 12;
        if ("am".equals(ampm) && hour == 12) hour = 0;
        return new ParsedDate(date.atTime(LocalTime.of(hour, minute)), false);
    }

    /** "90" → 1990, "05" → 2005 (si no queda en el futuro). */
    private static int year(String raw) {
        int y = Integer.parseInt(raw);
        if (raw.length() == 4) return y;
        int current = Year.now().getValue() % 100;
        return y <= current ? 2000 + y : 1900 + y;
    }

    // ---------- Sexo, régimen, zona ----------

    /** null si viene vacío. "M" es ambiguo (masculino o mujer): lo decide la clínica para todo el archivo. */
    static Sex sex(String raw, boolean letterMIsMale) {
        String k = text(raw) == null ? null : key(raw);
        if (k == null || k.isEmpty()) return null;
        if (k.equals("m")) return letterMIsMale ? Sex.H : Sex.M;
        if (Set.of("h", "hombre", "masculino", "masc", "male", "varon", "1").contains(k)) return Sex.H;
        if (Set.of("f", "mujer", "femenino", "fem", "female", "2").contains(k)) return Sex.M;
        if (Set.of("i", "indeterminado", "intersexual", "3").contains(k)) return Sex.I;
        throw new RowException("Sexo no reconocido: «%s» (usa Masculino, Femenino o Indeterminado)".formatted(raw.strip()));
    }

    /** Vacío o no reconocido → empty (se usa el régimen predeterminado). */
    static Optional<Regime> regime(String raw) {
        String k = text(raw) == null ? "" : key(raw);
        if (k.isEmpty()) return Optional.empty();
        if (k.equals("c") || k.startsWith("contributivo") || k.startsWith("cotizante") || k.startsWith("beneficiario"))
            return Optional.of(Regime.CONTRIBUTIVO);
        if (k.equals("s") || k.startsWith("subsidiado")) return Optional.of(Regime.SUBSIDIADO);
        if (k.equals("e") || k.startsWith("especial") || k.startsWith("excepcion") || k.contains("magisterio")
                || k.contains("fuerzas militares") || k.contains("policia") || k.contains("ecopetrol"))
            return Optional.of(Regime.ESPECIAL);
        if (k.equals("n") || k.equals("p") || k.startsWith("particular") || k.startsWith("no afiliado")
                || k.startsWith("vinculado") || k.startsWith("ninguno") || k.startsWith("sin "))
            return Optional.of(Regime.NO_AFILIADO);
        for (Regime r : Regime.values()) if (r.name().equalsIgnoreCase(k.replace(" ", "_"))) return Optional.of(r);
        return Optional.empty();
    }

    static ResidenceZone zone(String raw) {
        String k = text(raw) == null ? "" : key(raw);
        if (k.equals("u") || k.startsWith("urban")) return ResidenceZone.U;
        if (k.equals("r") || k.startsWith("rural")) return ResidenceZone.R;
        return null;
    }

    // ---------- Nombres ----------

    private static final Set<String> PARTICLES = Set.of("de", "del", "la", "las", "los", "san", "santa", "van", "von", "da", "di", "y");

    /** Palabras de un nombre, con las partículas pegadas a la siguiente: "de la Torre" queda como una sola. */
    static List<String> nameGroups(String raw) {
        var groups = new ArrayList<String>();
        var pending = new StringBuilder();
        for (String word : raw.strip().split("\\s+")) {
            if (word.isEmpty()) continue;
            if (PARTICLES.contains(Patient.normalize(word))) {
                pending.append(word).append(' ');
            } else {
                groups.add(pending + word);
                pending.setLength(0);
            }
        }
        if (!pending.isEmpty()) {
            String rest = pending.toString().strip();
            if (groups.isEmpty()) groups.add(rest);
            else groups.set(groups.size() - 1, groups.getLast() + " " + rest);
        }
        return groups;
    }

    /** [primer, segundo (o null)]: "Juan Carlos" → [Juan, Carlos]; "Pérez Gómez" → [Pérez, Gómez]. */
    static String[] splitTwo(String raw) {
        var g = nameGroups(raw);
        if (g.isEmpty()) return new String[] {null, null};
        return new String[] {g.getFirst(), g.size() == 1 ? null : String.join(" ", g.subList(1, g.size()))};
    }

    /**
     * Nombre completo → [primer nombre, segundo nombre, primer apellido, segundo apellido]. Con tres
     * palabras se asume un nombre y dos apellidos (lo más común en Colombia).
     */
    static String[] splitFullName(String raw, boolean surnameFirst) {
        var g = nameGroups(raw);
        if (g.size() < 2) throw new RowException("El nombre «%s» necesita al menos un nombre y un apellido".formatted(raw.strip()));
        List<String> given, surnames;
        if (g.size() == 2) {
            given = surnameFirst ? g.subList(1, 2) : g.subList(0, 1);
            surnames = surnameFirst ? g.subList(0, 1) : g.subList(1, 2);
        } else if (surnameFirst) {
            surnames = g.subList(0, 2);
            given = g.subList(2, g.size());
        } else {
            given = g.subList(0, g.size() == 3 ? 1 : g.size() - 2);
            surnames = g.subList(given.size(), g.size());
        }
        return new String[] {
                given.getFirst(), given.size() > 1 ? String.join(" ", given.subList(1, given.size())) : null,
                surnames.getFirst(), surnames.size() > 1 ? String.join(" ", surnames.subList(1, surnames.size())) : null};
    }

    /** "PÉREZ DE LA TORRE" → "Pérez de la Torre". Solo cambia textos escritos todo en mayúsculas. */
    static String fixUppercase(String s) {
        if (s == null || !s.equals(s.toUpperCase(Locale.ROOT)) || s.equals(s.toLowerCase(Locale.ROOT))) return s;
        var out = new StringBuilder();
        String[] words = s.toLowerCase(Locale.ROOT).split(" ");
        for (int i = 0; i < words.length; i++) {
            String w = words[i];
            if (i > 0) out.append(' ');
            if (w.isEmpty() || (i > 0 && PARTICLES.contains(Patient.normalize(w)))) out.append(w);
            else out.append(Character.toUpperCase(w.charAt(0))).append(w.substring(1));
        }
        return out.toString();
    }
}
