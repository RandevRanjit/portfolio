// Prefix an internal path with the configured base.
// BASE_URL can be '/portfolio/' (dev) or '/portfolio' (build) — normalise both.
export const withBase = (p: string): string => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const path = String(p).replace(/^\//, '');
  return path ? `${base}/${path}` : base || '/';
};
