package lat.occlus.shared.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Registra solo método, estado, duración e identificador; no cuerpos, URL ni cabeceras. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
@Slf4j
public class RequestLogFilter extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
            FilterChain chain) throws ServletException, IOException {
        String id = UUID.randomUUID().toString();
        String previous = MDC.get("requestId");
        MDC.put("requestId", id);
        response.setHeader("X-Occlus-Request-Id", id);
        long start = System.nanoTime();
        boolean failed = false;
        try {
            chain.doFilter(request, response);
        } catch (ServletException | IOException | RuntimeException ex) {
            failed = true;
            throw ex;
        } finally {
            int status = failed ? 500 : response.getStatus();
            long millis = (System.nanoTime() - start) / 1_000_000;
            if (!request.getRequestURI().startsWith("/actuator/health")) {
                if (status >= 500) log.error("http requestId={} method={} status={} durationMs={}", id, request.getMethod(), status, millis);
                else if (status >= 400) log.warn("http requestId={} method={} status={} durationMs={}", id, request.getMethod(), status, millis);
                else log.info("http requestId={} method={} status={} durationMs={}", id, request.getMethod(), status, millis);
            }
            if (previous == null) MDC.remove("requestId");
            else MDC.put("requestId", previous);
        }
    }
}
