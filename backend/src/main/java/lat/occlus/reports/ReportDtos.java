package lat.occlus.reports;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lat.occlus.shared.web.Ref;

public final class ReportDtos {

    private ReportDtos() {}

    /** Reporte de un periodo [from, to] (fechas de Colombia, ambas incluidas). */
    public record Report(LocalDate from, LocalDate to, Ref site, Revenue revenue, Production production,
                         Appointments appointments, Patients patients) {}

    // ---------- Recaudo ----------

    public record Revenue(BigDecimal total, long count, BigDecimal voidedTotal, long voidedCount,
                          List<MethodTotal> byMethod, List<DayTotal> byDay, List<SiteTotal> bySite) {}

    public record MethodTotal(String method, long count, BigDecimal total) {}

    /** Un registro por cada día del periodo, también los días sin recaudo (total 0). */
    public record DayTotal(LocalDate date, BigDecimal total) {}

    public record SiteTotal(Ref site, BigDecimal total) {}

    // ---------- Producción (procedimientos realizados) ----------

    public record Production(BigDecimal total, long items, List<ProfessionalTotal> byProfessional,
                             List<CategoryTotal> byCategory, List<ProcedureTotal> topProcedures) {}

    public record ProfessionalTotal(Ref professional, long items, BigDecimal total) {}

    public record CategoryTotal(String category, long items, BigDecimal total) {}

    public record ProcedureTotal(String name, long count, BigDecimal total) {}

    // ---------- Agenda ----------

    /**
     * {@code attendanceRate} y {@code noShowRate} se calculan sobre las citas ya resueltas
     * (atendidas + inasistencias); son null si no hay ninguna.
     */
    public record Appointments(long total, Map<String, Long> byStatus, Double attendanceRate, Double noShowRate,
                               List<ProfessionalAgenda> byProfessional) {}

    public record ProfessionalAgenda(Ref professional, long total, long attended, long noShow, long cancelled) {}

    // ---------- Pacientes ----------

    public record Patients(long newPatients, long attended) {}

    // ---------- Cartera ----------

    /** Saldos por cobrar (realizado − pagado > 0) y anticipos (saldo a favor de pacientes). */
    public record Receivables(BigDecimal totalOwed, long debtorCount, BigDecimal totalAdvances, List<Debtor> debtors) {}

    public record Debtor(UUID patientId, String fullName, String document, String phone, BigDecimal done,
                         BigDecimal paid, BigDecimal balance, Instant lastPaymentAt) {}
}
