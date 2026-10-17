// Live-Werte fürs Status-Panel der Startseite (BL-012). Läuft im Browser.
// Quelle: /api/stats – der Portfolio-nginx reicht intern an den Sammler auf dem Status-Dashboard
// weiter. Fehlt die Antwort, ist sie kaputt oder älter als MAX_AGE, bleiben die Live-Zeilen
// verborgen und das Panel zeigt nur die Build-Werte.

export interface LiveStats {
  version: 1;
  generated_at: string;
  services?: { up: number; total: number };
  guests?: { running: number; total: number };
  storage?: { used_bytes: number; total_bytes: number };
  uptime_seconds?: number;
}

const MAX_AGE_MS = 2 * 60 * 60 * 1000;
const TIMEOUT_MS = 4000;

const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;

/** Prüft die Antwort und gibt nur die Felder zurück, die formal stimmen. */
export function parseStats(data: unknown, now = Date.now()): LiveStats | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, any>;
  if (d.version !== 1 || typeof d.generated_at !== 'string') return null;
  const at = Date.parse(d.generated_at);
  if (!Number.isFinite(at) || now - at > MAX_AGE_MS) return null;

  const out: LiveStats = { version: 1, generated_at: d.generated_at };
  if (isCount(d.services?.up) && isCount(d.services?.total) && d.services.total > 0 && d.services.up <= d.services.total)
    out.services = { up: d.services.up, total: d.services.total };
  if (isCount(d.guests?.running) && isCount(d.guests?.total) && d.guests.running <= d.guests.total)
    out.guests = { running: d.guests.running, total: d.guests.total };
  if (isCount(d.storage?.used_bytes) && isCount(d.storage?.total_bytes) && d.storage.total_bytes > 0)
    out.storage = { used_bytes: d.storage.used_bytes, total_bytes: d.storage.total_bytes };
  if (isCount(d.uptime_seconds)) out.uptime_seconds = d.uptime_seconds;
  return out;
}

export function formatStats(s: LiveStats, lang: 'de' | 'en'): Record<string, string> {
  const locale = lang === 'en' ? 'en-GB' : 'de-DE';
  const tb = (b: number) => (b / 1e12).toLocaleString(locale, { maximumFractionDigits: 1 });
  const out: Record<string, string> = {};
  if (s.services) out.services = `${s.services.up}/${s.services.total} online`;
  if (s.guests) out.guests = `${s.guests.running} / ${s.guests.total}`;
  if (s.storage) out.storage = `${tb(s.storage.used_bytes)} / ${tb(s.storage.total_bytes)} TB`;
  if (s.uptime_seconds !== undefined) {
    const days = Math.floor(s.uptime_seconds / 86400);
    out.uptime = days >= 1 ? `${days} d` : `${Math.floor(s.uptime_seconds / 3600)} h`;
  }
  return out;
}

export async function fillLiveStats(url = '/api/stats'): Promise<void> {
  const panel = document.querySelector<HTMLElement>('[data-status-panel]');
  if (!panel) return;
  const lang = panel.dataset.lang === 'en' ? 'en' : 'de';
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return;
    const stats = parseStats(await res.json());
    if (!stats) return;
    const values = formatStats(stats, lang);
    for (const [key, value] of Object.entries(values)) {
      const row = panel.querySelector<HTMLElement>(`[data-stat="${key}"]`);
      const cell = row?.querySelector<HTMLElement>('[data-stat-value]');
      if (!row || !cell) continue;
      cell.textContent = value;
      row.hidden = false;
    }
    const system = panel.querySelector<HTMLElement>('[data-stat-system]');
    if (system && Object.keys(values).length) {
      system.textContent = 'live';
      system.title = new Date(stats.generated_at).toLocaleString(lang === 'en' ? 'en-GB' : 'de-DE');
    }
  } catch {
    // Netzfehler, Zeitüberschreitung, kein JSON: still bei den Build-Werten bleiben.
  }
}
