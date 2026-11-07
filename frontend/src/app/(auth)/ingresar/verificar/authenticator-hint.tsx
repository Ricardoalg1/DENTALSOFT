const DIGITS = [0, 1, 2, 3, 4, 5];

/** Animación que muestra dónde está el código: en la cuenta Occlus de la app autenticadora del teléfono. */
export function AuthenticatorHint() {
  return (
    <div className="flex items-center gap-4 rounded-xl border bg-muted/40 p-3">
      <svg viewBox="0 0 84 132" className="auth-hint-phone h-28 w-auto shrink-0 text-primary" role="img" aria-label="Teléfono con una app autenticadora mostrando el código de Occlus">
        <rect x="2" y="2" width="80" height="128" rx="13" fill="var(--card)" stroke="currentColor" strokeWidth="2.5" />
        <rect x="32" y="8" width="20" height="3.5" rx="1.75" fill="currentColor" opacity="0.35" />
        <rect x="10" y="20" width="36" height="4" rx="2" fill="currentColor" opacity="0.25" />
        <rect x="8" y="34" width="68" height="40" rx="7" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeOpacity="0.4" />
        <path d="M18 40.5l6 2.2v4.4c0 3.7-2.4 6-6 7.4-3.6-1.4-6-3.7-6-7.4v-4.4z" fill="currentColor" />
        <text x="29" y="50" fontSize="10" fontWeight="600" fill="var(--foreground)">Occlus</text>
        {DIGITS.map((i) => (
          <rect key={i} x={13 + i * 10} y="60" width="8" height="9" rx="2" fill="currentColor" className="auth-hint-digit" style={{ animationDelay: `${i * 0.3}s` }} />
        ))}
        <circle cx="69" cy="20" r="5" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
        <circle cx="69" cy="20" r="5" fill="none" stroke="currentColor" strokeWidth="2.5" pathLength="100" transform="rotate(-90 69 20)" className="auth-hint-timer" />
        <rect x="8" y="82" width="68" height="16" rx="5" fill="currentColor" opacity="0.08" />
        <rect x="8" y="104" width="68" height="16" rx="5" fill="currentColor" opacity="0.08" />
      </svg>
      <ol className="grid gap-1.5 text-sm">
        <li><strong className="font-semibold">1.</strong> Abre tu app autenticadora en el teléfono.</li>
        <li><strong className="font-semibold">2.</strong> Busca la cuenta <strong className="font-semibold">Occlus</strong>.</li>
        <li><strong className="font-semibold">3.</strong> Escribe aquí sus 6 dígitos. Cambian cada 30 segundos.</li>
      </ol>
    </div>
  );
}
