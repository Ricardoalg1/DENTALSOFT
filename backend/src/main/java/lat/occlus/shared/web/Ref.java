package lat.occlus.shared.web;

import java.util.UUID;

/** Referencia mínima a otra entidad en las respuestas: id y nombre para mostrar. */
public record Ref(UUID id, String name) {}
