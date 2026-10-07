package lat.occlus.treatment;

import static lat.occlus.treatment.ProcedureCategory.DIAGNOSIS;
import static lat.occlus.treatment.ProcedureCategory.ENDODONTICS;
import static lat.occlus.treatment.ProcedureCategory.ORTHODONTICS;
import static lat.occlus.treatment.ProcedureCategory.PERIODONTICS;
import static lat.occlus.treatment.ProcedureCategory.PREVENTION;
import static lat.occlus.treatment.ProcedureCategory.PROSTHODONTICS;
import static lat.occlus.treatment.ProcedureCategory.RESTORATIVE;
import static lat.occlus.treatment.ProcedureCategory.SURGERY;

import java.math.BigDecimal;
import java.util.List;
import lat.occlus.clinical.OdontogramCondition;

/**
 * Lista de precios de ejemplo para empezar. Los precios son orientativos y no trae códigos CUPS:
 * cada clínica debe ajustar precios y completar los CUPS con la tabla oficial vigente.
 */
final class ExamplePriceList {

    private ExamplePriceList() {}

    record Example(String name, ProcedureCategory category, long price, boolean perTooth, OdontogramCondition treats) {}

    static final List<Example> EXAMPLES = List.of(
            new Example("Consulta de valoración odontológica", DIAGNOSIS, 60_000, false, null),
            new Example("Radiografía periapical", DIAGNOSIS, 25_000, true, null),
            new Example("Profilaxis y detartraje", PREVENTION, 90_000, false, null),
            new Example("Aplicación de flúor", PREVENTION, 40_000, false, null),
            new Example("Sellante de fosas y fisuras", PREVENTION, 45_000, true, null),
            new Example("Resina de fotocurado", RESTORATIVE, 120_000, true, OdontogramCondition.CARIES),
            new Example("Obturación temporal", RESTORATIVE, 40_000, true, null),
            new Example("Endodoncia", ENDODONTICS, 550_000, true, OdontogramCondition.ROOT_CANAL_INDICATED),
            new Example("Raspaje y alisado radicular (por cuadrante)", PERIODONTICS, 150_000, false, null),
            new Example("Exodoncia simple", SURGERY, 120_000, true, OdontogramCondition.EXTRACTION_INDICATED),
            new Example("Exodoncia de resto radicular", SURGERY, 150_000, true, OdontogramCondition.REMNANT_ROOT),
            new Example("Corona en metal-porcelana", PROSTHODONTICS, 900_000, true, OdontogramCondition.FRACTURE),
            new Example("Control de ortodoncia", ORTHODONTICS, 100_000, false, null));

    static BigDecimal price(Example e) {
        return BigDecimal.valueOf(e.price());
    }
}
