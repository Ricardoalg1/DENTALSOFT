package lat.occlus.billing;

import static lat.occlus.billing.BillingDtos.*;
import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Límites del documento técnico 1 v003: importes enteros y una atención por registro. */
class RipsContractTests {
    final RipsDraftService rips=new RipsDraftService();

    @Test
    void fractionalAmountIsPreservedButCannotBePreparedAsRips() {
        var s=snapshot("120000.50",1,"05","0");
        assertThat(rips.validate(s).dataReady()).isFalse();
        assertThat(rips.validate(s).errors()).anyMatch(e -> e.contains("entero"));
        assertThat(s.lines().getFirst().total()).isEqualByComparingTo("120000.50");
    }

    @Test
    void multipleAttendancesMustBeRecordedIndividually() {
        assertThat(rips.validate(snapshot("120000",2,"05","0")).errors())
                .anyMatch(e -> e.contains("cada atención"));
    }

    @Test
    void noCollectionCannotHideAModeratingPayment() {
        assertThat(rips.validate(snapshot("120000",1,"05","5000")).errors())
                .anyMatch(e -> e.contains("sin recaudo"));
    }

    private Snapshot snapshot(String amount,int quantity,String concept,String payment) {
        var service=new ServiceRips(UUID.randomUUID(),"232101",ServiceKind.PROCEDURE,"01","01",334,
                "44","01",null,null,null,concept,new BigDecimal(payment),null,null);
        var line=new Line(UUID.randomUUID(),"Resina","232101",quantity,new BigDecimal(amount),BigDecimal.ZERO,
                new BigDecimal(amount),service,Instant.now().minusSeconds(3600),"K021","02",List.of());
        return new Snapshot(new Issuer("Clínica","900123456","110010000001","Calle 10","11001","a@example.test"),
                new Buyer("CC","12345678","Paciente",null,null),"Paciente","CC","12345678",LocalDate.of(1991,1,1),"F",
                new RipsUser("01","170","170","11001","01","NO",null),List.of(line));
    }
}
