"use client";

import { useEffect, useRef } from "react";

const FRAME_MS = 1000 / 30;
/** Segundos que tarda el brillo en dar la vuelta al panel. */
const BORDER_LAP_SECONDS = 22;
/** Qué tan rápido la luz alcanza al cursor: bajo para que se sienta orgánica. */
const POINTER_EASE = 3;

const PALETTE = {
  light: { a: "#246c78", b: "#4665ff", wash: 0.03, glow: 0.055, border: 0.32 },
  dark: { a: "#36b7c3", b: "#6f8dff", wash: 0.045, glow: 0.075, border: 0.42 },
};

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  precision mediump float;
  uniform float uTime;
  uniform float uMotion;
  uniform float uRadius;
  uniform vec2 uRes;
  uniform vec2 uPointer;
  uniform float uPresence;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uWash;
  uniform float uGlow;
  uniform float uBorder;
  varying vec2 vUv;

  // Distancia al borde del panel, negativa por dentro.
  float boxDistance(vec2 q, vec2 half_, float r) {
    vec2 d = abs(q) - half_ + r;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
  }

  // Posición en píxeles a lo largo del perímetro, en el sentido de las manecillas.
  float perimeterPosition(vec2 q, vec2 half_) {
    vec2 toEdge = half_ - abs(q);
    if (toEdge.y < toEdge.x) {
      return q.y > 0.0 ? q.x + half_.x : 2.0 * half_.x + 2.0 * half_.y + (half_.x - q.x);
    }
    return q.x > 0.0 ? 2.0 * half_.x + (half_.y - q.y) : 4.0 * half_.x + 2.0 * half_.y + (q.y + half_.y);
  }

  void main() {
    vec2 px = vUv * uRes;
    vec2 half_ = uRes * 0.5;
    vec2 q = px - half_;
    float t = uTime;

    // Velo de color que respira muy despacio.
    vec2 p = px / 760.0;
    float wave = sin(p.x * 1.7 + t * 0.09 + sin(p.y * 2.1 - t * 0.07) * 1.3);
    vec3 color = mix(uColorA, uColorB, smoothstep(-1.0, 1.0, wave));
    float alpha = uWash * smoothstep(-0.4, 1.0, wave);

    // Luz difusa que acompaña al cursor; su tamaño respira para que no se sienta mecánica.
    float toPointer = length(px - uPointer);
    float reach = 230.0 + sin(t * 0.6) * 18.0;
    float near = exp(-toPointer * toPointer / (reach * reach)) * uPresence;
    alpha += near * uGlow;
    color = mix(color, uColorA, near);

    // Línea del borde: un brillo con cola que recorre el panel y se aviva cerca del cursor.
    float dist = boxDistance(q, half_, uRadius);
    float line = smoothstep(-2.2, -0.4, dist);
    float perimeter = 4.0 * (half_.x + half_.y);
    float behind = mod(fract(t / ${BORDER_LAP_SECONDS.toFixed(1)}) * perimeter - perimeterPosition(q, half_), perimeter);
    float head = smoothstep(0.0, 24.0, behind);
    float sweep = head * exp(-behind / 190.0) * uMotion;
    float borderNear = exp(-toPointer * toPointer / 32400.0) * uPresence * 0.45;
    alpha += line * (sweep + borderNear) * uBorder;

    gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.6));
  }
`;

/**
 * Fondo de la agenda con three.js: un velo de color casi imperceptible, un brillo que recorre el borde
 * del panel y una luz suave que sigue al cursor con retardo. Es decorativo: sin WebGL no se dibuja nada,
 * con «reducir movimiento» queda solo el velo fijo y se detiene cuando no está en pantalla.
 */
export function AgendaBackdrop() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const panel = host?.parentElement;
    if (!host || !panel) return;
    let cleanup: (() => void) | undefined;
    let cancelled = false;

    void import("three").then((THREE) => {
      if (cancelled) return;

      let renderer: import("three").WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: "low-power" });
      } catch {
        return;
      }
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.domElement.style.cssText = "display:block;width:100%;height:100%";
      host.appendChild(renderer.domElement);

      const uniforms = {
        uTime: { value: 0 },
        uMotion: { value: reducedMotion ? 0 : 1 },
        uRadius: { value: Math.max(parseFloat(getComputedStyle(host).borderTopLeftRadius) - 1, 0) || 0 },
        uRes: { value: new THREE.Vector2(1, 1) },
        uPointer: { value: new THREE.Vector2(0, 0) },
        uPresence: { value: 0 },
        uColorA: { value: new THREE.Color() },
        uColorB: { value: new THREE.Color() },
        uWash: { value: 0 },
        uGlow: { value: 0 },
        uBorder: { value: 0 },
      };

      const scene = new THREE.Scene();
      const camera = new THREE.Camera();
      const geometry = new THREE.PlaneGeometry(2, 2);
      const material = new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        uniforms,
      });
      const quad = new THREE.Mesh(geometry, material);
      quad.frustumCulled = false;
      scene.add(quad);

      const applyTheme = () => {
        const palette = document.documentElement.classList.contains("dark") ? PALETTE.dark : PALETTE.light;
        uniforms.uColorA.value.set(palette.a);
        uniforms.uColorB.value.set(palette.b);
        uniforms.uWash.value = palette.wash;
        uniforms.uGlow.value = palette.glow;
        uniforms.uBorder.value = palette.border;
      };

      const pointerTarget = new THREE.Vector2(0, 0);
      let presenceTarget = 0;
      const startedAt = performance.now();
      let lastDraw = startedAt;

      const draw = () => {
        const now = performance.now();
        const dt = Math.min((now - lastDraw) / 1000, 0.1);
        lastDraw = now;
        // Con movimiento reducido el fondo queda quieto.
        uniforms.uTime.value = reducedMotion ? 12 : (now - startedAt) / 1000;
        const ease = 1 - Math.exp(-dt * POINTER_EASE);
        uniforms.uPointer.value.lerp(pointerTarget, ease);
        uniforms.uPresence.value += (presenceTarget - uniforms.uPresence.value) * ease;
        renderer.render(scene, camera);
      };

      const resize = () => {
        const { clientWidth: w, clientHeight: h } = host;
        if (w === 0 || h === 0) return;
        renderer.setSize(w, h, false);
        uniforms.uRes.value.set(w, h);
        draw();
      };

      let frame = 0;
      let lastFrame = 0;
      let onScreen = true;
      const loop = (now: number) => {
        frame = requestAnimationFrame(loop);
        if (now - lastFrame < FRAME_MS) return;
        lastFrame = now;
        draw();
      };
      const syncLoop = () => {
        const shouldRun = !reducedMotion && onScreen && !document.hidden;
        if (shouldRun && frame === 0) {
          lastDraw = performance.now();
          frame = requestAnimationFrame(loop);
        } else if (!shouldRun && frame !== 0) {
          cancelAnimationFrame(frame);
          frame = 0;
        }
      };

      const onPointerMove = (e: PointerEvent) => {
        if (e.pointerType !== "mouse" || reducedMotion) return;
        const box = host.getBoundingClientRect();
        pointerTarget.set(e.clientX - box.left, box.bottom - e.clientY);
        // Al entrar la luz nace donde está el cursor, en vez de cruzar el panel.
        if (uniforms.uPresence.value < 0.02) uniforms.uPointer.value.copy(pointerTarget);
        presenceTarget = 1;
      };
      const onPointerLeave = () => {
        presenceTarget = 0;
      };
      panel.addEventListener("pointermove", onPointerMove);
      panel.addEventListener("pointerleave", onPointerLeave);

      const themeObserver = new MutationObserver(() => {
        applyTheme();
        draw();
      });
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      const sizeObserver = new ResizeObserver(resize);
      sizeObserver.observe(host);
      const screenObserver = new IntersectionObserver(([entry]) => {
        onScreen = entry.isIntersecting;
        syncLoop();
      });
      screenObserver.observe(host);
      document.addEventListener("visibilitychange", syncLoop);

      applyTheme();
      resize();
      syncLoop();

      cleanup = () => {
        cancelAnimationFrame(frame);
        panel.removeEventListener("pointermove", onPointerMove);
        panel.removeEventListener("pointerleave", onPointerLeave);
        themeObserver.disconnect();
        sizeObserver.disconnect();
        screenObserver.disconnect();
        document.removeEventListener("visibilitychange", syncLoop);
        geometry.dispose();
        material.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return <div ref={hostRef} aria-hidden="true" className="agenda-backdrop" />;
}
