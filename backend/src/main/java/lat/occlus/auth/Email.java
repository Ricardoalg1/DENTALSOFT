package lat.occlus.auth;

import java.util.ArrayList;
import java.util.List;

/**
 * Un correo de Occlus, en HTML con los colores de la aplicación y en texto plano para quien no ve HTML.
 * Todo lo que llega aquí se escapa al armar el HTML: el nombre de una clínica o un motivo no pueden inyectar marcado.
 * Va con tablas y estilos en línea porque es lo único que los clientes de correo respetan.
 */
public final class Email {

    private static final String PRIMARY = "#246c78";
    private static final String INK = "#0d2c48";
    private static final String MUTED = "#526675";
    private static final String ACCENT = "#dcecea";
    private static final String BORDER = "#ccd8d2";
    private static final String PAGE = "#f9f7f0";
    private static final String CARD = "#ffffff";
    private static final String FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

    private record Detail(String label, String value) {}

    private final String heading;
    private String eyebrow;
    private final List<String> lines = new ArrayList<>();
    private String code;
    private String codeNote;
    private final List<Detail> details = new ArrayList<>();
    private String buttonLabel;
    private String buttonUrl;
    private final List<String> notes = new ArrayList<>();
    private String footer = "Este es un mensaje automático de Occlus.";

    private Email(String heading) {
        this.heading = heading;
    }

    public static Email titled(String heading) {
        return new Email(heading);
    }

    /** Texto pequeño sobre el título; por ejemplo, el nombre de la clínica. */
    public Email eyebrow(String text) {
        eyebrow = text;
        return this;
    }

    public Email line(String text) {
        lines.add(text);
        return this;
    }

    public Email code(String value, String note) {
        code = value;
        codeNote = note;
        return this;
    }

    public Email detail(String label, String value) {
        if (value != null && !value.isBlank()) details.add(new Detail(label, value));
        return this;
    }

    public Email button(String label, String url) {
        buttonLabel = label;
        buttonUrl = url;
        return this;
    }

    public Email note(String text) {
        notes.add(text);
        return this;
    }

    public Email footer(String text) {
        footer = text;
        return this;
    }

    public String text() {
        var out = new StringBuilder();
        if (eyebrow != null) out.append(eyebrow).append("\n\n");
        out.append(heading).append("\n\n");
        lines.forEach(l -> out.append(l).append("\n\n"));
        if (code != null) out.append("Tu código es ").append(code).append(". ").append(codeNote).append("\n\n");
        details.forEach(d -> out.append(d.label()).append(": ").append(d.value()).append('\n'));
        if (!details.isEmpty()) out.append('\n');
        if (buttonUrl != null) out.append(buttonLabel).append(":\n").append(buttonUrl).append("\n\n");
        notes.forEach(n -> out.append(n).append("\n\n"));
        return out.append("— ").append(footer).toString();
    }

    /** Una sola línea, para las plantillas de WhatsApp: Meta no admite saltos de línea en sus parámetros. */
    public String oneLine() {
        var parts = new ArrayList<>(lines);
        details.forEach(d -> parts.add(d.label() + ": " + d.value() + "."));
        if (buttonUrl != null) parts.add(buttonLabel + ": " + buttonUrl);
        return String.join(" ", parts).replaceAll("\\s+", " ").strip();
    }

    public String html(String logoUrl) {
        var body = new StringBuilder();
        if (eyebrow != null) {
            body.append("<p style=\"margin:0 0 6px;font-size:13px;font-weight:600;letter-spacing:.3px;color:").append(PRIMARY).append("\">")
                    .append(esc(eyebrow)).append("</p>");
        }
        body.append("<h1 style=\"margin:0 0 18px;font-size:23px;line-height:1.25;font-weight:700;color:").append(INK).append("\">").append(esc(heading)).append("</h1>");
        for (String l : lines) {
            body.append("<p style=\"margin:0 0 14px;font-size:15px;line-height:1.55;color:").append(INK).append("\">").append(esc(l)).append("</p>");
        }
        if (code != null) {
            body.append("<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin:6px 0 18px\"><tr><td align=\"center\" style=\"background:").append(ACCENT)
                    .append(";border-radius:12px;padding:20px 12px\"><p style=\"margin:0 0 6px;font-size:13px;color:").append(MUTED).append("\">Tu código de verificación</p>")
                    .append("<p style=\"margin:0;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:8px;color:").append(PRIMARY).append("\">").append(esc(code)).append("</p>")
                    .append("<p style=\"margin:8px 0 0;font-size:13px;color:").append(MUTED).append("\">").append(esc(codeNote)).append("</p></td></tr></table>");
        }
        if (!details.isEmpty()) {
            body.append("<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin:6px 0 20px;border:1px solid ").append(BORDER).append(";border-radius:12px;border-collapse:separate\">");
            for (int i = 0; i < details.size(); i++) {
                var d = details.get(i);
                String divider = i == 0 ? "" : "border-top:1px solid " + BORDER + ";";
                body.append("<tr><td style=\"").append(divider).append("padding:11px 14px;font-size:13px;color:").append(MUTED).append(";width:34%;vertical-align:top\">").append(esc(d.label()))
                        .append("</td><td style=\"").append(divider).append("padding:11px 14px;font-size:14px;font-weight:600;color:").append(INK).append("\">").append(esc(d.value())).append("</td></tr>");
            }
            body.append("</table>");
        }
        if (buttonUrl != null) {
            body.append("<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin:6px 0 20px\"><tr><td style=\"background:").append(PRIMARY).append(";border-radius:10px\"><a href=\"").append(esc(buttonUrl))
                    .append("\" style=\"display:inline-block;padding:13px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none\">").append(esc(buttonLabel)).append("</a></td></tr></table>");
        }
        for (String n : notes) {
            body.append("<p style=\"margin:0 0 10px;font-size:13px;line-height:1.5;color:").append(MUTED).append("\">").append(esc(n)).append("</p>");
        }
        String brand = logoUrl != null && logoUrl.startsWith("https://")
                ? "<img src=\"" + esc(logoUrl) + "\" width=\"120\" alt=\"Occlus\" style=\"display:block;width:120px;height:auto;border:0\">"
                : "<span style=\"font-size:22px;font-weight:700;color:" + INK + "\">Occlus</span>";
        return "<!doctype html><html lang=\"es\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
                + "<meta name=\"color-scheme\" content=\"light\"><title>" + esc(heading) + "</title></head>"
                + "<body style=\"margin:0;padding:0;background:" + PAGE + ";font-family:" + FONT + "\">"
                + "<div style=\"display:none;max-height:0;overflow:hidden\">" + esc(lines.isEmpty() ? heading : lines.getFirst()) + "</div>"
                + "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:" + PAGE + "\"><tr><td align=\"center\" style=\"padding:28px 14px\">"
                + "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"max-width:560px;background:" + CARD + ";border:1px solid " + BORDER + ";border-radius:16px;overflow:hidden\">"
                + "<tr><td style=\"height:6px;background:" + PRIMARY + ";font-size:0;line-height:0\">&nbsp;</td></tr>"
                + "<tr><td align=\"center\" style=\"padding:26px 28px 6px\">" + brand + "</td></tr>"
                + "<tr><td style=\"padding:18px 28px 14px\">" + body + "</td></tr>"
                + "<tr><td style=\"padding:16px 28px 22px;background:" + PAGE + ";border-top:1px solid " + BORDER + ";font-size:12px;line-height:1.5;color:" + MUTED + "\">" + esc(footer) + "</td></tr>"
                + "</table></td></tr></table></body></html>";
    }

    private static String esc(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#39;");
    }
}
