package lat.occlus.reports;

import lat.occlus.platform.AppModule;
import lat.occlus.platform.RequiresModule;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.UUID;
import lat.occlus.reports.ReportDtos.Receivables;
import lat.occlus.reports.ReportDtos.Report;
import lat.occlus.shared.security.AuthUser;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Reportes de gestión: información financiera, solo para administradores. */
@RequiresModule(AppModule.REPORTS)
@RestController
@RequestMapping("/api/reports")
@PreAuthorize("hasRole('ADMIN')")
@RequiredArgsConstructor
public class ReportController {

    private final ReportService service;

    @GetMapping
    Report report(@AuthenticationPrincipal Jwt jwt,
                  @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                  @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                  @RequestParam(required = false) UUID siteId) {
        return service.report(AuthUser.from(jwt).clinicId(), from, to, siteId);
    }

    @GetMapping("/receivables")
    Receivables receivables(@AuthenticationPrincipal Jwt jwt) {
        return service.receivables(AuthUser.from(jwt).clinicId());
    }

    @GetMapping("/payments.csv")
    ResponseEntity<byte[]> paymentsCsv(@AuthenticationPrincipal Jwt jwt,
                                       @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                       @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        byte[] body = service.paymentsCsv(AuthUser.from(jwt).clinicId(), from, to).getBytes(StandardCharsets.UTF_8);
        return ResponseEntity.ok()
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename("pagos_%s_%s.csv".formatted(from, to)).build().toString())
                .body(body);
    }
}
