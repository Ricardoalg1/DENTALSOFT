package lat.occlus.clinical;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import lat.occlus.clinical.ClinicalDtos.BackgroundRequest;
import lat.occlus.clinical.ClinicalDtos.BackgroundResponse;
import lat.occlus.shared.security.AuthUser;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ClinicalBackgroundService {

    private final ClinicalBackgroundRepository backgrounds;
    private final ClinicalAccess access;

    @Transactional(readOnly = true)
    public BackgroundResponse get(UUID clinicId, UUID patientId) {
        access.requirePatient(clinicId, patientId);
        return backgrounds.findByClinicIdAndPatientId(clinicId, patientId)
                .map(this::toResponse)
                .orElseGet(() -> new BackgroundResponse(List.of(), List.of(), null, null, null, null, null, null, null));
    }

    /** Crea o reemplaza los antecedentes. Envers guarda la versión anterior. */
    @Transactional
    public BackgroundResponse save(AuthUser me, UUID patientId, BackgroundRequest req) {
        access.requireProfessional(me);
        access.requirePatient(me.clinicId(), patientId);
        var bg = backgrounds.findByClinicIdAndPatientId(me.clinicId(), patientId).orElseGet(() -> {
            var created = new ClinicalBackground();
            created.setClinicId(me.clinicId());
            created.setPatientId(patientId);
            return created;
        });
        // Listas nuevas (no mutar las existentes) para que Hibernate detecte el cambio.
        bg.setConditions(sortedNames(req.conditions()));
        bg.setHabits(sortedNames(req.habits()));
        bg.setAllergies(clean(req.allergies()));
        bg.setMedications(clean(req.medications()));
        bg.setSurgicalHistory(clean(req.surgicalHistory()));
        bg.setFamilyHistory(clean(req.familyHistory()));
        bg.setObservations(clean(req.observations()));
        bg.setUpdatedBy(me.userId());
        return toResponse(backgrounds.saveAndFlush(bg));
    }

    /** Antecedentes traídos de otro programa (texto libre). */
    public record ImportedBackground(String allergies, String medications, String surgicalHistory,
                                     String familyHistory, String observations) {
        public boolean isEmpty() {
            return allergies == null && medications == null && surgicalHistory == null
                    && familyHistory == null && observations == null;
        }
    }

    /**
     * Migración: completa los campos vacíos con lo que traía el programa anterior, sin pisar lo que ya se
     * registró en Occlus. La llama un administrador (no escribe una atención, solo traslada datos), por eso
     * no exige ser profesional. El paciente lo valida quien llama.
     */
    @Transactional
    public void importLegacy(UUID clinicId, UUID userId, UUID patientId, ImportedBackground data) {
        if (data.isEmpty()) return;
        var bg = backgrounds.findByClinicIdAndPatientId(clinicId, patientId).orElseGet(() -> {
            var created = new ClinicalBackground();
            created.setClinicId(clinicId);
            created.setPatientId(patientId);
            return created;
        });
        boolean changed = false;
        if (bg.getAllergies() == null && data.allergies() != null) { bg.setAllergies(data.allergies()); changed = true; }
        if (bg.getMedications() == null && data.medications() != null) { bg.setMedications(data.medications()); changed = true; }
        if (bg.getSurgicalHistory() == null && data.surgicalHistory() != null) { bg.setSurgicalHistory(data.surgicalHistory()); changed = true; }
        if (bg.getFamilyHistory() == null && data.familyHistory() != null) { bg.setFamilyHistory(data.familyHistory()); changed = true; }
        if (bg.getObservations() == null && data.observations() != null) { bg.setObservations(data.observations()); changed = true; }
        if (!changed) return;
        bg.setUpdatedBy(userId);
        backgrounds.save(bg);
    }

    private BackgroundResponse toResponse(ClinicalBackground bg) {
        var updatedBy = access.userRefs(Collections.singleton(bg.getUpdatedBy())).get(bg.getUpdatedBy());
        return new BackgroundResponse(
                bg.getConditions().stream().map(MedicalCondition::valueOf).toList(),
                bg.getHabits().stream().map(Habit::valueOf).toList(),
                bg.getAllergies(), bg.getMedications(), bg.getSurgicalHistory(), bg.getFamilyHistory(),
                bg.getObservations(), bg.getUpdatedAt(), updatedBy);
    }

    private static List<String> sortedNames(Set<? extends Enum<?>> values) {
        return values.stream().sorted(Comparator.comparingInt(Enum::ordinal)).map(Enum::name)
                .collect(Collectors.toCollection(ArrayList::new));
    }

    private static String clean(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
