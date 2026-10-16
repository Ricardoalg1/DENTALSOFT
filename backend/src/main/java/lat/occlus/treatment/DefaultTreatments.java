package lat.occlus.treatment;

import static lat.occlus.treatment.ProcedureCategory.DIAGNOSIS;
import static lat.occlus.treatment.ProcedureCategory.ENDODONTICS;
import static lat.occlus.treatment.ProcedureCategory.ORTHODONTICS;
import static lat.occlus.treatment.ProcedureCategory.OTHER;
import static lat.occlus.treatment.ProcedureCategory.PERIODONTICS;
import static lat.occlus.treatment.ProcedureCategory.PREVENTION;
import static lat.occlus.treatment.ProcedureCategory.PROSTHODONTICS;
import static lat.occlus.treatment.ProcedureCategory.RESTORATIVE;
import static lat.occlus.treatment.ProcedureCategory.SURGERY;

import java.util.List;

/** Tratamientos predeterminados que una clínica puede cargar para empezar (los ajusta o desactiva después). */
final class DefaultTreatments {

    private DefaultTreatments() {}

    record Preset(String name, ProcedureCategory category) {}

    static final List<Preset> PRESETS = List.of(
            new Preset("Consulta de valoración", DIAGNOSIS),
            new Preset("Radiografías e imágenes diagnósticas", DIAGNOSIS),
            new Preset("Aplicación de barniz de flúor", PREVENTION),
            new Preset("Sellantes", PREVENTION),
            new Preset("Fase higiénica + profilaxis", PREVENTION),
            new Preset("Obturación en resina de alta estética", RESTORATIVE),
            new Preset("Cambio de amalgama por resina", RESTORATIVE),
            new Preset("Bordes en resina", RESTORATIVE),
            new Preset("Diseño de sonrisa en resina estratificada", RESTORATIVE),
            new Preset("Aclaramiento dental", RESTORATIVE),
            new Preset("Placas para blanqueamiento", RESTORATIVE),
            new Preset("Endodoncia", ENDODONTICS),
            new Preset("Poste en fibra de vidrio", ENDODONTICS),
            new Preset("Raspaje y alisado radicular", PERIODONTICS),
            new Preset("Gingivectomía", PERIODONTICS),
            new Preset("Extracción simple", SURGERY),
            new Preset("Exodoncia de diente permanente multirradicular", SURGERY),
            new Preset("Exodoncia de dientes temporales", SURGERY),
            new Preset("Exodoncia de resto radicular", SURGERY),
            new Preset("Exodoncia de diente incluido", SURGERY),
            new Preset("Frenillectomía", SURGERY),
            new Preset("Corona metalcerámica", PROSTHODONTICS),
            new Preset("Corona en zirconio", PROSTHODONTICS),
            new Preset("Corona en disilicato de litio", PROSTHODONTICS),
            new Preset("Incrustación dental en zirconio", PROSTHODONTICS),
            new Preset("Prótesis parcial fija de 3 unidades en zirconio", PROSTHODONTICS),
            new Preset("Prótesis total", PROSTHODONTICS),
            new Preset("Acker flexible de 1 diente", PROSTHODONTICS),
            new Preset("Acker flexible de 2 piezas", PROSTHODONTICS),
            new Preset("Montaje de ortodoncia superior e inferior", ORTHODONTICS),
            new Preset("Control de ortodoncia", ORTHODONTICS),
            new Preset("Placa de bruxismo", OTHER));
}
