/** Ejecutado antes de pintar en Astro y Next. No contiene datos del servidor. */
export const THEME_INIT_SCRIPT = `(() => {
  const root = document.documentElement;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const read = () => { try { return localStorage.getItem('occlus-theme'); } catch { return null; } };
  const apply = (choice) => {
    const explicit = choice === 'light' || choice === 'dark';
    root.dataset.themeChoice = explicit ? choice : 'system';
    root.classList.toggle('dark', explicit ? choice === 'dark' : media.matches);
    window.dispatchEvent(new Event('occlus-theme-change'));
  };
  apply(read());
  media.addEventListener('change', () => { if (root.dataset.themeChoice === 'system') apply(null); });
  window.addEventListener('storage', (event) => { if (event.key === 'occlus-theme' || event.key === null) apply(read()); });
})();`;
