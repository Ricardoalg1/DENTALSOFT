package lat.occlus.booking;

import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import lat.occlus.booking.BookingDtos.BookingInfo;
import lat.occlus.booking.BookingDtos.DetailsRequest;
import lat.occlus.booking.BookingDtos.HoldRequest;
import lat.occlus.booking.BookingDtos.HoldResponse;
import lat.occlus.booking.BookingDtos.ManageSlotsRequest;
import lat.occlus.booking.BookingDtos.ManageView;
import lat.occlus.booking.BookingDtos.RescheduleRequest;
import lat.occlus.booking.BookingDtos.Slot;
import lat.occlus.booking.BookingDtos.TokenRequest;
import lat.occlus.booking.BookingDtos.VerifyRequest;
import lat.occlus.booking.BookingDtos.VerifyResponse;
import lat.occlus.platform.SkipEntitlements;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Público y sin sesión. La suscripción se revisa en el servicio. Nginx no publica /api: esto solo se alcanza a
 * través de las páginas /reservar y /mi-cita, por eso la cabecera con la IP viene de Next y no del visitante.
 */
@SkipEntitlements
@RestController
@RequestMapping("/api/public/booking")
@RequiredArgsConstructor
public class PublicBookingController {

    private final PublicBookingService service;

    @GetMapping("/{slug}")
    BookingInfo info(@PathVariable String slug) {
        return service.info(slug);
    }

    @GetMapping("/{slug}/slots")
    List<Slot> slots(@PathVariable String slug, @RequestParam UUID dentistId,
                     @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from) {
        return service.slots(slug, dentistId, from);
    }

    @PostMapping("/{slug}/hold")
    HoldResponse hold(@PathVariable String slug, @Valid @RequestBody HoldRequest req,
                      @RequestHeader(value = "X-Occlus-Client-Ip", required = false) String clientIp) {
        return service.hold(slug, req, clientIp);
    }

    @PostMapping("/{slug}/details")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void details(@PathVariable String slug, @Valid @RequestBody DetailsRequest req) {
        service.details(slug, req);
    }

    @PostMapping("/{slug}/verify")
    VerifyResponse verify(@PathVariable String slug, @Valid @RequestBody VerifyRequest req) {
        return service.verify(slug, req.holdToken(), req.code());
    }

    // El token va siempre en el cuerpo: nunca en una URL que pueda quedar en un registro.
    @PostMapping("/manage/inspect")
    ManageView inspect(@Valid @RequestBody TokenRequest req) {
        return service.inspect(req.token());
    }

    @PostMapping("/manage/slots")
    List<Slot> manageSlots(@Valid @RequestBody ManageSlotsRequest req) {
        return service.manageSlots(req.token(), req.from());
    }

    @PostMapping("/manage/cancel")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void cancel(@Valid @RequestBody TokenRequest req) {
        service.cancel(req.token());
    }

    @PostMapping("/manage/reschedule")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void reschedule(@Valid @RequestBody RescheduleRequest req) {
        service.reschedule(req.token(), req.siteId(), req.startsAt());
    }
}
