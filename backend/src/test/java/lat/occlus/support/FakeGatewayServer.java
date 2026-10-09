package lat.occlus.support;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Imita las APIs de Wompi y ePayco que usa la aplicación (solo lo necesario, sin red externa). */
public final class FakeGatewayServer {

    public static final class Tx {
        public String id;
        public volatile String status;
        public long cents;
        public String reference;
        public String message = "";
        /** Tras esta cantidad de consultas GET, pasa a {@code flipTo}. -1 = nunca. */
        public volatile int flipAfterGets = -1;
        public String flipTo;
        volatile int gets;
    }

    private final JsonMapper json = JsonMapper.builder().build();
    private final HttpServer server;
    public final Map<String, Tx> wompiTx = new ConcurrentHashMap<>();
    public final List<JsonNode> wompiPosts = new CopyOnWriteArrayList<>();
    public final Map<String, Map<String, Object>> epaycoData = new ConcurrentHashMap<>();
    /** Estado con el que nace una transacción creada por POST /transactions. */
    public volatile String postStatus = "APPROVED";
    public volatile int postFlipAfterGets = -1;
    public volatile String postFlipTo;
    private int sequence;

    public FakeGatewayServer() {
        try {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
        server.createContext("/v1/", this::wompi);
        server.createContext("/validation/", this::epayco);
        server.start();
    }

    public String baseUrl() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    public Tx putWompi(String id, String status, long cents, String reference) {
        var tx = new Tx();
        tx.id = id;
        tx.status = status;
        tx.cents = cents;
        tx.reference = reference;
        wompiTx.put(id, tx);
        return tx;
    }

    public Tx byReference(String reference) {
        return wompiTx.values().stream().filter(t -> t.reference.equals(reference)).findFirst().orElse(null);
    }

    private void wompi(HttpExchange ex) throws IOException {
        String path = ex.getRequestURI().getPath().substring("/v1".length());
        String query = ex.getRequestURI().getRawQuery();
        String method = ex.getRequestMethod();
        if (method.equals("POST") && path.equals("/transactions")) {
            JsonNode body = json.readTree(new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            wompiPosts.add(body);
            Tx tx = putWompi("tx-" + (++sequence) + "-" + System.nanoTime(), postStatus, body.path("amount_in_cents").asLong(),
                    body.path("reference").asString());
            tx.flipAfterGets = postFlipAfterGets;
            tx.flipTo = postFlipTo;
            tx.message = postStatus.equals("DECLINED") ? "Fondos insuficientes" : "";
            reply(ex, 201, Map.of("data", txJson(tx)));
        } else if (method.equals("GET") && path.startsWith("/transactions/")) {
            Tx tx = wompiTx.get(path.substring("/transactions/".length()));
            if (tx == null) {
                reply(ex, 404, Map.of("error", "not found"));
                return;
            }
            Map<String, Object> out = txJson(tx);
            if (tx.flipAfterGets >= 0 && ++tx.gets > tx.flipAfterGets) tx.status = tx.flipTo;
            reply(ex, 200, Map.of("data", out));
        } else if (method.equals("GET") && path.equals("/transactions") && query != null && query.startsWith("reference=")) {
            String ref = java.net.URLDecoder.decode(query.substring("reference=".length()), StandardCharsets.UTF_8);
            List<Object> list = new ArrayList<>();
            wompiTx.values().stream().filter(t -> t.reference.equals(ref)).forEach(t -> list.add(txJson(t)));
            reply(ex, 200, Map.of("data", list));
        } else if (method.equals("GET") && path.startsWith("/merchants/")) {
            reply(ex, 200, Map.of("data", Map.of(
                    "presigned_acceptance", Map.of("acceptance_token", "acc-tok", "permalink", "https://wompi.example/terminos"),
                    "presigned_personal_data_auth", Map.of("acceptance_token", "pda-tok", "permalink", "https://wompi.example/datos"))));
        } else if (method.equals("POST") && path.equals("/payment_sources")) {
            wompiPosts.add(json.readTree(new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8)));
            reply(ex, 201, Map.of("data", Map.of("id", 777, "status", "AVAILABLE")));
        } else {
            reply(ex, 404, Map.of("error", "unknown " + method + " " + path));
        }
    }

    private void epayco(HttpExchange ex) throws IOException {
        String ref = ex.getRequestURI().getPath().substring("/validation/".length());
        var data = epaycoData.get(ref);
        if (data == null) {
            reply(ex, 200, Map.of("success", false, "data", Map.of()));
            return;
        }
        reply(ex, 200, Map.of("success", true, "data", data));
    }

    private Map<String, Object> txJson(Tx tx) {
        var m = new LinkedHashMap<String, Object>();
        m.put("id", tx.id);
        m.put("status", tx.status);
        m.put("amount_in_cents", tx.cents);
        m.put("currency", "COP");
        m.put("reference", tx.reference);
        m.put("status_message", tx.message);
        return m;
    }

    private void reply(HttpExchange ex, int code, Object body) throws IOException {
        byte[] bytes = json.writeValueAsBytes(body);
        ex.getResponseHeaders().add("Content-Type", "application/json");
        ex.sendResponseHeaders(code, bytes.length);
        ex.getResponseBody().write(bytes);
        ex.close();
    }
}
