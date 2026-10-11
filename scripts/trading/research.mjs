// Davina (Research & Fundamental): kalender ekonomi (ForexFactory, gratis), deteksi berita USD berdampak tinggi,
// ringkasan sentimen fundamental emas (opsional pakai Claude CLI 1–2×/hari, hemat token).
import { spawn } from 'node:child_process';
import { kv, setKv, kvAge, ROOT } from './store.mjs';

const FF = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const KEY_WORDS = /CPI|Non-Farm|NFP|FOMC|Federal Funds|Fed Chair|Powell|PCE|GDP|Unemployment|Retail Sales|ISM|PPI|JOLTS|Jobless/i;

export async function refreshCalendar() {
  const r = await fetch(FF, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`kalender ${r.status}`);
  const rows = await r.json();
  const ev = rows.filter((e) => e.country === 'USD' && (e.impact === 'High' || (e.impact === 'Medium' && KEY_WORDS.test(e.title))))
    .map((e) => ({ title: e.title, impact: e.impact, at: new Date(e.date).getTime(), forecast: e.forecast, previous: e.previous }));
  setKv('calendar', ev);
  return ev;
}

// rilis penting dalam ±menit dari sekarang → nama beritanya (blackout entry)
export function blackout(now = Date.now(), minutes = 45) {
  const ev = kv('calendar', []);
  const hit = ev.find((e) => e.impact === 'High' && Math.abs(e.at - now) <= minutes * 60000);
  return hit ? `${hit.title} (${new Date(hit.at).toLocaleTimeString('id-ID', { timeZone: 'Asia/Makassar', hour: '2-digit', minute: '2-digit' })} WITA)` : null;
}
export function upcoming(now = Date.now(), hours = 24) {
  return kv('calendar', []).filter((e) => e.at >= now && e.at <= now + hours * 3600000).sort((a, b) => a.at - b.at);
}

// bias fundamental emas −1 (bearish) … +1 (bullish); berlaku sampai `until`
export function fundamental(now = Date.now(), p = { newsBlackoutMin: 45 }) {
  const f = kv('fund', null);
  const valid = f && f.until > now;
  return { bias: valid ? f.bias : 0, note: valid ? f.note : 'netral (belum ada ringkasan hari ini)', blackout: blackout(now, p.newsBlackoutMin) };
}

// ringkasan sentimen lewat Claude CLI (WebSearch) — dipanggil maks 2×/hari oleh supervisor
export function aiSentiment({ bin = process.env.CLAUDE_BIN || 'claude', model = process.env.TRD_MODEL || 'haiku' } = {}) {
  if (kvAge('fund') < 300) return Promise.resolve(kv('fund'));
  const cal = upcoming(Date.now(), 36).map((e) => `- ${e.title} (${e.impact}) ${new Date(e.at).toISOString()} forecast ${e.forecast || '-'} prev ${e.previous || '-'}`).join('\n') || '- (tidak ada)';
  const prompt = `Kamu Davina, analis fundamental emas (XAUUSD) di tim trading Zataa. Cari berita 24 jam terakhir (maks 4 pencarian web):
politik/perang/geopolitik, The Fed & suku bunga, data inflasi (CPI/PCE), tenaga kerja (NFP), dan kekuatan USD (DXY).
Kalender USD 36 jam ke depan:\n${cal}
Simpulkan sentimen untuk EMAS hari ini. Balas HANYA satu baris JSON: {"bias": angka -1..1 (positif = emas naik), "note": "ringkasan ≤140 karakter bahasa Indonesia", "sources": ["url", "url"]}`;
  return new Promise((resolve) => {
    const p = spawn(bin, ['-p', '--model', model, '--allowedTools', 'WebSearch', 'WebFetch'], { cwd: ROOT, shell: process.platform === 'win32', windowsHide: true });
    let o = '';
    const timer = setTimeout(() => p.kill(), 6 * 60000);
    p.stdout.on('data', (b) => { o += b; });
    p.on('error', () => { clearTimeout(timer); resolve(null); });
    p.on('close', () => {
      clearTimeout(timer);
      const m = o.match(/\{[^{}]*"bias"[^{}]*\}/s);
      if (!m) return resolve(null);
      try {
        const j = JSON.parse(m[0]);
        const f = { bias: Math.max(-1, Math.min(1, +j.bias || 0)), note: String(j.note || '').slice(0, 160), sources: j.sources ?? [], until: Date.now() + 10 * 3600000 };
        setKv('fund', f);
        resolve(f);
      } catch { resolve(null); }
    });
    p.stdin.end(prompt);
  });
}
