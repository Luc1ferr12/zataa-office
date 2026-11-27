// Tab 🎯 KPI: progres target YouTube per divisi. Target = docs/data/kpi.json (ringkasan alasan: office/kpi.md),
// angka asli = socials.json (subscriber), trend.json (laju 7 hari), state.json (Shorts tayang & persen ditonton).
// kpiModel() = hitungan murni; kpiHtml() = tampilan.
import { change } from './trend.js';

const DAY = 86400_000;
const days = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
const witaDay = (iso) => new Date(Date.parse(iso) + 8 * 3600_000).toISOString().slice(0, 10);

// target yang "seharusnya sudah tercapai" hari ini: garis lurus antar pos cek (pos tanpa angka dilewati)
export function expectedAt(base, targets, checkpoints, start, today) {
  const pts = [[start, base], ...checkpoints.map((d, i) => [d, targets[i]]).filter(([, v]) => v != null)];
  if (today <= start) return base;
  for (let i = 1; i < pts.length; i++) {
    const [d0, v0] = pts[i - 1], [d1, v1] = pts[i];
    if (today <= d1) return v0 + (v1 - v0) * (days(d0, today) / days(d0, d1));
  }
  return pts.at(-1)[1];
}

export function statusOf(actual, expected, base, today, start) {
  if (actual == null) return 'nodata';
  if (days(start, today) < 3) return 'new';
  if (actual >= Math.floor(expected)) return 'ok';
  // toleransi 15% dari kenaikan yang diharapkan (minimal 2 subscriber)
  return expected - actual <= Math.max(2, 0.15 * (expected - base)) ? 'near' : 'behind';
}

export function kpiModel(cfg, { socials, trend, state }) {
  if (!cfg || !socials?.generated_at) return null;
  const today = witaDay(socials.generated_at);
  const end = cfg.checkpoints.at(-1);
  const left = Math.max(0, days(today, end));
  const weekDay = state?.week_start && state?.today ? Math.min(7, Math.max(1, days(state.week_start, state.today) + 1)) : null;
  const divisions = cfg.divisions.map((d) => {
    const acc = socials[d.account];
    const subs = acc && !acc.error ? acc.subscribers ?? null : null;
    const { base, targets, stretch = null } = d.subs;
    const final = targets.at(-1);
    const expected = expectedAt(base, targets, cfg.checkpoints, cfg.start, today);
    const ni = cfg.checkpoints.findIndex((c, i) => c >= today && targets[i] != null);
    const next = ni < 0 ? null : { date: cfg.checkpoints[ni], target: targets[ni], in: days(today, cfg.checkpoints[ni]), short: subs == null ? null : Math.max(0, targets[ni] - subs) };
    const sd = change(trend, socials, [d.account], 'a'), vd = change(trend, socials, [d.account], 'v');
    const viewsWeek = vd ? Math.round((vd.diff * 7) / vd.days) : null;
    const perDay = sd ? sd.diff / sd.days : null;
    const viewsGoal = d.viewsWeek ? Math.round(expectedAt(d.viewsWeek.base, d.viewsWeek.targets, cfg.checkpoints, cfg.start, today)) : null;
    const r = state?.kpi_retention?.[d.key];
    return {
      key: d.key, name: d.name, color: d.color, focus: !!d.focus,
      subs, base, final, stretch, expected: Math.round(expected), status: statusOf(subs, expected, base, today, cfg.start), next,
      forecast: subs == null || perDay == null ? null : Math.max(0, Math.round(subs + perDay * left)),
      needPerDay: subs == null || !left ? null : Math.max(0, (final - subs) / left), perDay,
      views: d.viewsWeek ? { week: viewsWeek, goal: viewsGoal, final: d.viewsWeek.targets.at(-1), days: vd?.days ?? null } : null,
      // sub per 1.000 views baru bermakna kalau ada cukup views di periodenya
      per1k: d.subsPer1k ? { now: sd && vd && vd.diff >= 500 ? (sd.diff / vd.diff) * 1000 : null, target: d.subsPer1k } : null,
      // About Esports (channel null) nggak punya KPI Shorts harian
      shorts: d.channel && weekDay ? { posted: (state.week_contents ?? []).filter((c) => c.channel === d.channel && c.status === 'posted').length, target: cfg.weekly.shorts, day: weekDay } : null,
      watched: d.channel ? { now: r?.apv ?? null, videos: r?.n ?? 0, target: cfg.weekly.watched } : null,
    };
  });
  return { today, end, left, weekly: cfg.weekly, adsense: cfg.adsense, checkpoints: cfg.checkpoints, divisions };
}

// ---------- tampilan
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = (n, digits = 0) => (n == null ? '—' : Number(n).toLocaleString('id-ID', { maximumFractionDigits: digits }));
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const tgl = (d) => `${+d.slice(8)} ${BULAN[+d.slice(5, 7) - 1]}`;
const STATUS = { ok: '✓ Sesuai target', near: '≈ Sedikit di bawah', behind: '! Tertinggal', new: 'Baru mulai', nodata: 'Data belum ada' };
// kelas warna metrik: hijau kalau mencapai target, kuning kalau belum; tanpa data = netral
const met = (now, goal) => (now == null || goal == null ? '' : now >= goal ? 'ok' : 'warn');
const row = (label, value, goal, cls = '') => `<div class="kpi-row ${cls}"><dt>${label}</dt><dd><b>${value}</b><small>${goal}</small></dd></div>`;

function card(x, m) {
  const pct = (v) => Math.min(100, Math.max(0, (v / x.final) * 100));
  const forecast = x.forecast == null ? '' : `Laju sekarang → <b>${num(x.forecast)}</b> pada ${tgl(m.end)}${x.forecast >= x.final ? ' (cukup)' : ` (butuh ${num(x.needPerDay, 1)}/hari, sekarang ${num(x.perDay, 1)})`}`;
  const next = !x.next ? 'Semua pos cek sudah lewat'
    : `Pos cek ${tgl(x.next.date)}: <b>${num(x.next.target)}</b>${x.next.short == null ? '' : x.next.short ? ` · kurang ${num(x.next.short)} dalam ${x.next.in} hari` : ' · sudah tercapai'}`;
  const rows = [
    x.views && row('Views per minggu', num(x.views.week), `target ${num(x.views.goal)} · ${tgl(m.end)}: ${num(x.views.final)}${x.views.days && x.views.days < 7 ? ` · perkiraan dari ${x.views.days} hari` : ''}`,met(x.views.week, x.views.goal)),
    x.per1k && row('Sub per 1.000 views', num(x.per1k.now, 2), `target ${num(x.per1k.target, 1)} di ${tgl(m.end)}`, met(x.per1k.now, x.per1k.target)),
    x.shorts && row('Shorts tayang minggu ini', `${x.shorts.posted}/${x.shorts.target}`, `hari ke-${x.shorts.day} dari 7`, x.shorts.posted >= x.shorts.day - 1 ? 'ok' : 'warn'),
    x.watched && row('Rata-rata ditonton', x.watched.now == null ? '—' : `${num(x.watched.now)}%`, x.watched.now == null ? `target ${x.watched.target}% · data belum ada` : `target ${x.watched.target}% · ${x.watched.videos} video, 14 hari`, met(x.watched.now, x.watched.target)),
  ].filter(Boolean).join('');
  return `<article class="card kpi-div${x.focus ? ' focus' : ''}" style="--acc:${x.color}">
    <header><h3>${esc(x.name)}${x.focus ? ' <em>fokus</em>' : ''}</h3><span class="kpi-status ${x.status}">${STATUS[x.status]}</span></header>
    <p class="kpi-big"><strong>${num(x.subs)}</strong> <span>/ ${num(x.final)} subscriber${x.stretch ? ` · stretch ${num(x.stretch)}` : ''}</span></p>
    <div class="kpi-track" role="progressbar" aria-label="Subscriber ${esc(x.name)}" aria-valuemin="0" aria-valuemax="${x.final}" aria-valuenow="${Math.min(x.subs ?? 0, x.final)}">
      <u style="width:${x.subs == null ? 0 : pct(x.subs)}%"></u><i style="left:${pct(x.expected)}%" title="seharusnya hari ini: ${num(x.expected)}"></i>
    </div>
    <p class="kpi-line">Garis putih = posisi seharusnya hari ini (${num(x.expected)})</p>
    <p class="kpi-line">${next}</p>
    ${forecast ? `<p class="kpi-line">${forecast}</p>` : ''}
    ${rows ? `<dl>${rows}</dl>` : ''}
  </article>`;
}

export function kpiHtml(m) {
  if (!m) return '<p class="muted">Data KPI belum tersedia.</p>';
  const a = m.adsense;
  return `<div class="card kpi-intro">
      <div class="card-head"><h2>KPI YouTube per divisi</h2><span class="muted">${m.left ? `sisa ${m.left} hari ke ${tgl(m.end)}` : 'periode KPI selesai'} · data ${tgl(m.today)}</span></div>
      <p>Pos cek: ${m.checkpoints.map(tgl).join(' → ')}. Target ini membangun fondasi, <b>bukan</b> janji lolos AdSense: syaratnya ${num(a.subs)} subscriber <b>dan</b> ${num(a.shortsViews90d / 1e6)} juta views Shorts per 90 hari (atau ${num(a.watchHours)} jam tonton video panjang), dan naik dua kali lipat untuk pendaftar setelah ${tgl(a.deadline)}.</p>
      <p class="muted">Dicek manual, belum otomatis: “dilihat vs digeser” ≥${m.weekly.swiped}% (YouTube Studio) dan balasan komentar. Video panjang Zaa History belum dimulai.</p>
    </div>
    <div class="kpi-divs">${m.divisions.map((x) => card(x, m)).join('')}</div>`;
}
