package lat.occlus.clinical;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;
import lat.occlus.clinical.ClinicalDtos.Diagnosis;
import lat.occlus.patient.Patient;
import lat.occlus.shared.web.BadRequestException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Limit;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class Icd10Service {

    private final Icd10Repository catalog;

    /** "caries dentina" o "K02.1": cada palabra debe aparecer en el código o la descripción. */
    @Transactional(readOnly = true)
    public List<Diagnosis> search(String query) {
        if (query == null || query.isBlank()) return List.of();
        Specification<Icd10> spec = Specification.unrestricted();
        for (String term : Patient.normalize(query).split("\\s+")) {
            // "k02.1" → "k021": los códigos se guardan sin punto.
            String clean = term.matches("[a-z]\\d{2}\\.\\d") ? term.replace(".", "") : term;
            String pattern = "%" + clean.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
            spec = spec.and((root, q, cb) -> cb.like(root.get("searchKey"), pattern, '\\'));
        }
        return catalog.findBy(spec, q -> q.sortBy(Sort.by("code")).limit(20).all())
                .stream().map(Icd10Service::toDiagnosis).toList();
    }

    /** Normaliza un código ("k02.1" → "K021") y verifica que exista. null o vacío → null. */
    String validCode(String code) {
        if (code == null || code.isBlank()) return null;
        String normalized = code.trim().toUpperCase().replace(".", "");
        if (!catalog.existsById(normalized)) {
            throw new BadRequestException("El diagnóstico %s no está en el catálogo CIE-10".formatted(code.trim()));
        }
        return normalized;
    }

    Map<String, Diagnosis> byCode(Collection<String> codes) {
        return catalog.findAllById(codes.stream().filter(Objects::nonNull).collect(Collectors.toSet()))
                .stream().map(Icd10Service::toDiagnosis)
                .collect(Collectors.toMap(Diagnosis::code, Function.identity()));
    }

    private static Diagnosis toDiagnosis(Icd10 d) {
        return new Diagnosis(d.getCode(), Icd10.display(d.getCode()), d.getDescription());
    }
}
