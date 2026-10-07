"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";

export type SignaturePadHandle = {
  /** PNG en base64 (data URL) o null si no se ha firmado. */
  toDataUrl: () => string | null;
};

/**
 * Recuadro para firmar con el dedo, un lápiz óptico o el mouse. Dibuja en un canvas a la
 * resolución real de la pantalla para que la firma no se vea pixelada.
 */
export function SignaturePad({ ref, label }: { ref: Ref<SignaturePadHandle>; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ratio = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
  }, []);

  useImperativeHandle(ref, () => ({
    toDataUrl: () => (hasInk ? canvasRef.current!.toDataURL("image/png") : null),
  }));

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = e.currentTarget.getContext("2d")!;
    const { x, y } = point(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.1, y + 0.1); // un toque deja un punto
    ctx.stroke();
    setHasInk(true);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext("2d")!;
    const { x, y } = point(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function clear() {
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }

  return (
    <div className="grid gap-2">
      <div className="relative rounded-lg border-2 border-dashed bg-white">
        <canvas
          ref={canvasRef}
          aria-label={label}
          className="h-44 w-full touch-none cursor-crosshair"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={() => (drawing.current = false)}
          onPointerLeave={() => (drawing.current = false)}
        />
        {!hasInk && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-gray-400">
            Firme aquí
          </span>
        )}
        <span className="pointer-events-none absolute right-4 bottom-8 left-4 border-b border-gray-300" />
      </div>
      <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={clear} disabled={!hasInk}>
        <Eraser /> Borrar firma
      </Button>
    </div>
  );
}
