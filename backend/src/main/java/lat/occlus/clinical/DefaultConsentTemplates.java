package lat.occlus.clinical;

import java.util.List;

/**
 * Plantillas de ejemplo que una clínica puede cargar para empezar. Son textos genéricos redactados
 * para Occlus; cada clínica debe revisarlos y ajustarlos con su asesor legal antes de usarlos.
 */
final class DefaultConsentTemplates {

    private DefaultConsentTemplates() {}

    record Example(String title, String body) {}

    static final List<Example> EXAMPLES = List.of(
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

                    Fecha: {{fecha}}."""));
}
