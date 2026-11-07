"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/** Cloudflare Turnstile. Cada token sirve una sola vez: {@code version} pide uno nuevo tras cada intento. */
export function Turnstile({ siteKey, version, onToken }: { siteKey: string; version: number; onToken: (token: string | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const notify = useRef(onToken);
  useEffect(() => {
    notify.current = onToken;
  }, [onToken]);
  const markReady = useCallback(() => setReady(true), []);

  useEffect(() => {
    if (!ready || !box.current || !window.turnstile) return;
    const api = window.turnstile;
    const id = api.render(box.current, {
      sitekey: siteKey,
      language: "es",
      callback: (token: string) => notify.current(token),
      "expired-callback": () => notify.current(null),
      "error-callback": () => notify.current(null),
    });
    return () => {
      api.remove(id);
      notify.current(null);
    };
  }, [ready, siteKey, version]);

  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={markReady} />
      <div ref={box} />
    </>
  );
}
