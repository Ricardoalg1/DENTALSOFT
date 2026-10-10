package lat.occlus.clinical;

import java.io.*;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import lat.occlus.clinic.ClinicRepository;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.web.*;
import lombok.RequiredArgsConstructor;
import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service @RequiredArgsConstructor
public class ClinicalDocumentService {
    private final ClinicalAccess access;
    private final ClinicalNoteService notes;
    private final ClinicalBackgroundService backgrounds;
    private final ClinicRepository clinics;
    public record Document(String clinic, UUID patientId, String patient, String identification, LocalDate birthDate,
                           Instant generatedAt, ClinicalDtos.BackgroundResponse background, List<ClinicalDtos.NoteResponse> notes) {}

    @Transactional(readOnly=true)
    public Document document(AuthUser me, UUID patientId, UUID noteId) {
        var patient = access.requirePatient(me.clinicId(), patientId);
        var clinic = clinics.findById(me.clinicId()).orElseThrow();
        List<ClinicalDtos.NoteResponse> content;
        if (noteId == null) content = notes.signedForExport(me.clinicId(), patientId);
        else {
            var note = notes.get(me.clinicId(), noteId);
            if (!note.patient().id().equals(patientId)) throw new NotFoundException("Evolución no encontrada");
            if (note.status() != ClinicalDtos.NoteStatus.SIGNED) throw new ConflictException("Solo se exportan evoluciones firmadas");
            if (!Boolean.TRUE.equals(note.integrityOk())) throw new ConflictException("La evolución no supera la comprobación de integridad");
            content = List.of(note);
        }
        return new Document(clinic.getName(), patientId, patient.fullName(), patient.getDocumentType()+" "+patient.getDocumentNumber(), patient.getBirthDate(), Instant.now(), backgrounds.get(me.clinicId(), patientId), content);
    }

    public byte[] pdf(Document data) {
        try (var pdf = new PDDocument(); var out = new ByteArrayOutputStream();
             var fontData = getClass().getResourceAsStream("/fonts/NotoSans-Regular.ttf")) {
            if (fontData == null) throw new IOException("Font unavailable");
            var font = PDType0Font.load(pdf, fontData);
            pdf.getDocumentInformation().setTitle("Historia clínica odontológica");
            pdf.getDocumentInformation().setAuthor(data.clinic());
            var lines = new ArrayList<String>();
            lines.add("OCCLUS | " + data.clinic());
            lines.add("HISTORIA CLÍNICA ODONTOLÓGICA");
            lines.add(data.patient()); lines.add(data.identification());
            lines.add("Nacimiento: " + data.birthDate());
            lines.add("Copia generada: " + time(data.generatedAt()));
            lines.add("Documento confidencial. Incluye evoluciones firmadas y antecedentes actuales.");
            lines.add("No incluye imágenes, odontograma ni consentimientos adjuntos.");
            lines.add(""); lines.add("ANTECEDENTES ACTUALES");
            var b = data.background();
            if (b.updatedAt() == null) lines.add("Antecedentes aún no registrados.");
            else lines.add("Actualizados: " + time(b.updatedAt()));
            lines.add("Condiciones registradas: " + b.conditions().stream().map(ClinicalDocumentService::conditionLabel).collect(java.util.stream.Collectors.joining(", ")));
            lines.add("Hábitos registrados: " + b.habits().stream().map(ClinicalDocumentService::habitLabel).collect(java.util.stream.Collectors.joining(", ")));
            field(lines,"Alergias",b.allergies()); field(lines,"Medicamentos",b.medications());
            field(lines,"Quirúrgicos",b.surgicalHistory()); field(lines,"Familiares",b.familyHistory());
            field(lines,"Observaciones",b.observations());
            for (var note : data.notes()) {
                lines.add(""); lines.add("EVOLUCIÓN | " + time(note.attendedAt().toInstant()));
                lines.add("Profesional: " + note.dentist().name());
                field(lines,"Motivo",note.reason()); field(lines,"Enfermedad actual",note.currentIllness());
                field(lines,"Examen y hallazgos",note.examination());
                if (note.diagnosisMain()!=null) field(lines,"Diagnóstico",note.diagnosisMain().display()+" "+note.diagnosisMain().description());
                if(note.diagnosisType()!=null) lines.add("Tipo diagnóstico: " + diagnosisLabel(note.diagnosisType()));
                for(var dx:note.diagnosisRelated()) lines.add("Relacionado: " + dx.display()+" "+dx.description());
                field(lines,"Procedimientos",note.procedures()); field(lines,"Plan e indicaciones",note.plan());
                lines.add("Firmada: " + time(note.signedAt())); lines.add("Integridad SHA-256: " + note.contentHash());
                for(var addendum:note.addenda()) {
                    lines.add("NOTA ACLARATORIA | " + addendum.author().name()+" | "+time(addendum.createdAt()));
                    lines.add(addendum.text());
                }
            }
            if(data.notes().isEmpty()) lines.add("Sin evoluciones firmadas registradas.");
            float y = 0;
            PDPageContentStream stream = null;
            int number = 0;
            try {
                for (String text : lines) {
                    for (String line : wrap(text, font, 499)) {
                        if (stream == null || y < 58) {
                            if(stream!=null) stream.close();
                            var page = new PDPage(PDRectangle.A4); pdf.addPage(page);
                            stream = new PDPageContentStream(pdf,page); y=790; number++;
                            stream.setNonStrokingColor(0.05f,0.17f,0.28f);
                            write(stream,font,8,48,30,"OCCLUS · Documento confidencial · Página "+number);
                            stream.setStrokingColor(0.15f,0.43f,0.47f); stream.moveTo(48,808); stream.lineTo(547,808); stream.stroke();
                        }
                        write(stream,font,10,48,y,line); y-=15;
                    }
                }
            } finally { if(stream!=null) stream.close(); }
            pdf.save(out); return out.toByteArray();
        } catch (IOException | IllegalArgumentException e) {
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,"No se pudo generar el documento PDF; no se modificó la historia.");
        }
    }
    private static String conditionLabel(MedicalCondition value) { return switch(value) {
        case HYPERTENSION -> "Hipertensión arterial";
        case DIABETES -> "Diabetes";
        case HEART_DISEASE -> "Enfermedad cardiaca";
        case BLEEDING_DISORDER -> "Trastorno de coagulación";
        case ANTICOAGULANTS -> "Toma anticoagulantes";
        case HEPATITIS -> "Hepatitis";
        case HIV -> "VIH";
        case ASTHMA -> "Asma u otra enfermedad respiratoria";
        case EPILEPSY -> "Epilepsia";
        case KIDNEY_DISEASE -> "Enfermedad renal";
        case THYROID_DISEASE -> "Enfermedad de tiroides";
        case CANCER_TREATMENT -> "Tratamiento oncológico (quimio/radioterapia)";
        case BISPHOSPHONATES -> "Toma bifosfonatos";
        case PREGNANCY -> "Embarazo";
        case ANESTHESIA_ALLERGY -> "Alergia a anestésicos locales";
    }; }
    private static String habitLabel(Habit value) { return switch(value) {
        case BRUXISM -> "Bruxismo";
        case SMOKING -> "Tabaquismo";
        case ALCOHOL -> "Consumo de alcohol";
        case ONYCHOPHAGIA -> "Onicofagia (morderse las uñas)";
        case MOUTH_BREATHING -> "Respiración bucal";
        case THUMB_SUCKING -> "Succión digital";
        case LIP_BITING -> "Morderse el labio";
        case OBJECT_BITING -> "Morder objetos";
    }; }
    private static String diagnosisLabel(DiagnosisType value) { return switch(value) {
        case IMPRESSION -> "Impresión diagnóstica";
        case CONFIRMED_NEW -> "Confirmado nuevo";
        case CONFIRMED_REPEAT -> "Confirmado repetido";
    }; }
    private static void field(List<String> lines,String title,String text) { if(text!=null && !text.isBlank()) { lines.add(title+":"); lines.add(text); } }
    private static String time(Instant value) { return value==null?"—":DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm").withZone(ZoneId.of("America/Bogota")).format(value); }
    private static void write(PDPageContentStream stream, PDType0Font font, int size,float x,float y,String text) throws IOException {
        stream.beginText(); stream.setFont(font,size); stream.newLineAtOffset(x,y); stream.showText(text); stream.endText();
    }
    private static List<String> wrap(String text,PDType0Font font,float width) throws IOException {
        var output=new ArrayList<String>();
        for(String paragraph:text.replace("\t","    ").split("\\R",-1)) {
            var clean=new StringBuilder();
            paragraph.codePoints().filter(c->!Character.isISOControl(c)).forEach(clean::appendCodePoint);
            var line=new StringBuilder();
            for(String word:clean.toString().split("(?<=\\s)")) {
                if(line.length()>0 && font.getStringWidth(line+word)/1000*10>width) {
                    output.add(line.toString().stripTrailing()); line.setLength(0);
                }
                for(int code:word.codePoints().toArray()) {
                    var character=new String(Character.toChars(code));
                    if(line.length()>0 && font.getStringWidth(line+character)/1000*10>width) {
                        output.add(line.toString()); line.setLength(0);
                    }
                    line.append(character);
                }
            }
            output.add(line.toString().stripTrailing());
        }
        return output;
    }
}
