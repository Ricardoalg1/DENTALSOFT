package lat.occlus.clinical;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Plantillas de ejemplo que una clínica puede cargar para empezar. Son textos genéricos redactados
 * para Occlus; cada clínica debe revisarlos y ajustarlos con su asesor legal antes de usarlos.
 */
final class DefaultConsentTemplates {

    private DefaultConsentTemplates() {}

    record Example(String title, String body) {}

    /**
     * Plantillas por procedimiento en resources/consent-templates: primera línea = título, el resto = texto.
     * Marcadores: {{declarante}}, {{paciente}}, {{documento}}, {{profesional}}, {{registro_profesional}},
     * {{clinica}}, {{fecha}} y {{procedimiento}}.
     */
    private static final List<String> PROCEDURE_FILES = List.of(
            "01-protesis-total.txt", "02-obturacion.txt", "03-cirugia.txt", "04-corona-dental.txt",
            "05-endodoncia.txt", "06-fase-higienica.txt", "07-diseno-sonrisa.txt");

    private static final List<Example> GENERAL = List.of(
            new Example("Consentimiento informado general para atención odontológica", """
                    {{declarante}} declaro que el(la) profesional {{profesional}} de {{clinica}} me explicó en un \
                    lenguaje claro el diagnóstico de salud oral del paciente y el tratamiento propuesto: {{procedimiento}}.

                    Entiendo en qué consiste el tratamiento, sus beneficios esperados, las alternativas disponibles \
                    (incluida la de no tratarme) y los riesgos más frecuentes, como sensibilidad, inflamación, dolor \
                    pasajero o la necesidad de procedimientos adicionales si la situación clínica cambia durante la atención.

                    Informé de manera completa los antecedentes médicos, alergias y medicamentos del paciente. Tuve la oportunidad de \
                    hacer preguntas y fueron respondidas a mi satisfacción.

                    Sé que puedo retirar este consentimiento en cualquier momento antes o durante el tratamiento, \
                    comunicándolo al profesional.

                    Fecha: {{fecha}}."""),
            new Example("Consentimiento informado para exodoncia (extracción dental)", """
                    {{declarante}} autorizo al(a la) profesional {{profesional}} de {{clinica}} a realizar el siguiente \
                    procedimiento: {{procedimiento}}.

                    Se me explicó que la extracción está indicada por la condición actual del paciente y cuáles son \
                    las alternativas. \
                    Comprendo que después del procedimiento pueden presentarse dolor, inflamación, sangrado leve, \
                    limitación para abrir la boca o hematomas, y con menor frecuencia infección del alvéolo, \
                    alteraciones transitorias de la sensibilidad o fractura de la raíz que requiera un procedimiento adicional.

                    Me comprometo a seguir las indicaciones posoperatorias que recibí por escrito y a asistir a los \
                    controles programados. Informé los antecedentes médicos y los medicamentos del paciente.

                    Fecha: {{fecha}}."""),
            new Example("Consentimiento informado para tratamiento de endodoncia", """
                    {{declarante}} autorizo al(a la) profesional {{profesional}} de {{clinica}} a realizar el \
                    tratamiento de conductos (endodoncia): {{procedimiento}}.

                    Se me explicó que el objetivo es conservar el diente eliminando el tejido pulpar afectado, que el \
                    tratamiento puede requerir varias citas y que, una vez terminado, el diente necesita una restauración \
                    definitiva para no fracturarse.

                    Entiendo que puede haber molestias durante algunos días y que, aunque el pronóstico suele ser favorable, \
                    en algunos casos el tratamiento no es exitoso y se requiere repetirlo, una cirugía complementaria \
                    o la extracción del diente.

                    Fecha: {{fecha}}."""),
            new Example("Autorización para el tratamiento de datos personales (Ley 1581 de 2012)", """
                    {{declarante}} autorizo de manera previa, expresa e informada a {{clinica}}, como responsable del \
                    tratamiento, para recolectar, almacenar, usar y consultar los datos personales y de salud del \
                    paciente, incluida su historia clínica, con las siguientes finalidades: prestar la atención \
                    odontológica, gestionar citas, tratamientos, pagos y facturación, cumplir las obligaciones legales \
                    en materia de salud y contactar al paciente para recordatorios y seguimiento de su atención.

                    Entiendo que los datos de salud son sensibles y que no estoy obligado(a) a suministrarlos, aunque sin ellos \
                    la clínica no podrá prestar el servicio. Sé que la clínica usa la plataforma Occlus como encargado para \
                    almacenar y procesar esta información con medidas de seguridad, y que puede apoyarse en proveedores \
                    tecnológicos, incluidos algunos ubicados fuera de Colombia.

                    Como titular tengo derecho a conocer, actualizar y rectificar mis datos, a solicitar prueba de esta \
                    autorización, a ser informado sobre su uso, a presentar quejas ante la Superintendencia de Industria \
                    y Comercio y a revocar la autorización o solicitar la supresión de mis datos cuando no exista un \
                    deber legal de conservarlos (la historia clínica debe conservarse por el plazo que exige la normatividad \
                    de salud). Puedo ejercer estos derechos ante {{clinica}} por sus canales de atención.

                    Si firmo en nombre de un menor de edad o de una persona que no puede firmar, declaro que tengo la \
                    representación legal para hacerlo.

                    Fecha: {{fecha}}."""));

    static final List<Example> EXAMPLES = examples();

    private static List<Example> examples() {
        List<Example> all = new ArrayList<>(GENERAL);
        for (String file : PROCEDURE_FILES) {
            try (InputStream in = DefaultConsentTemplates.class.getResourceAsStream("/consent-templates/" + file)) {
                if (in == null) throw new IllegalStateException("Falta la plantilla de consentimiento " + file);
                String text = new String(in.readAllBytes(), StandardCharsets.UTF_8);
                int newline = text.indexOf('\n');
                all.add(new Example(text.substring(0, newline).strip(), text.substring(newline + 1).strip()));
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        }
        return List.copyOf(all);
    }
}
