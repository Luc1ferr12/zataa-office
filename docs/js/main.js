import { AGENTS, wita, activityAt, describe, officeStatus } from './schedule.js';
import { chatFeed } from './chatter.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const GAME = { mlbb: 'ML', valorant: 'Valorant', freefire: 'Free Fire', other: 'Gaming' };
const STATUS = {
  draft: 'Draft', pending_approval: 'Nunggu approval', revision: 'Revisi', approved: 'Approved',
  rejected: 'Ditolak', scheduled: 'Terjadwal', posted: 'Terposting', failed: 'Gagal',
};
const NAMES = Object.fromEntries([['owner', 'Zamiir'], ...AGENTS.map((a) => [a.id, a.name])]);

let state = null;
let office = null;
let selected = null;
let lastSim = null;

// ---------- waktu: live atau simulasi ----------
function now() {
  if (!$('sim-toggle').checked) return wita(new Date());
  const m = +$('sim-time').value;
  const dow = +$('sim-day').value;
  return { dow, minutes: m, dayName: $('sim-day').selectedOptions[0].text, hh: String(Math.floor(m / 60)).padStart(2, '0'), mm: String(m % 60).padStart(2, '0') };
}

async function loadState() {
  try {
    const r = await fetch(`data/state.json?t=${Date.now()}`, { cache: 'no-store' });
    if (r.ok) state = await r.json();
  } catch { /* offline: tetap jalan dengan data terakhir */ }
  renderDashboard();
}

function renderDashboard() {
  const s = state;
  const st = s?.stats?.this_week ?? {};
  const lw = s?.stats?.last_week ?? {};
  $('k-total').textContent = st.total ?? 0;
  $('k-pending').textContent = st.pending ?? 0;
  $('k-posted').textContent = st.posted ?? 0;
  $('k-sched').textContent = `${st.scheduled ?? 0} terjadwal`;
  $('k-views').textContent = (st.views ?? 0).toLocaleString('id-ID');
  const diff = lw.views ? Math.round(((st.views - lw.views) / lw.views) * 100) : null;
  $('k-views-sub').textContent = diff === null ? 'belum ada data minggu lalu' : `${diff >= 0 ? '▲' : '▼'} ${Math.abs(diff)}% vs minggu lalu`;
  $('campaign-theme').textContent = s?.campaign?.theme ? `Tema: ${s.campaign.theme}` : 'Belum ada campaign';
  $('updated-at').textContent = s?.generated_at ? `update ${new Date(s.generated_at).toLocaleString('id-ID', { timeZone: 'Asia/Makassar', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}` : '';

  // jadwal minggu
  const week = s?.week_start ?? null;
  const days = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
  $('week-grid').innerHTML = days.map((d, i) => {
    const date = week ? addDays(week, i) : null;
    const items = (s?.week_contents ?? []).filter((c) => c.day === date);
    const chips = items.length
        ? items.map((c) => `<div class="chip ${c.format === 'video' ? 'video' : ''} s-${c.status}" title="${esc(STATUS[c.status] ?? c.status)}">
            <b>${esc(c.slot)} · ${c.format === 'video' ? '🎬 video' : c.format === 'carousel' ? '🖼️ carousel' : '🖼️ feed'}${c.game ? ' · ' + esc(GAME[c.game] ?? c.game) : ''}</b>${esc(c.title)}</div>`).join('')
        : '<p class="empty">—</p>';
    return `<div class="day ${date === s?.today ? 'today' : ''}"><h3>${d}<small>${date ? date.slice(8) : ''}</small></h3>${chips}</div>`;
  }).join('');

  // aktivitas
  const acts = s?.activity ?? [];
  $('activity').innerHTML = acts.length
    ? acts.map((a) => `<li><time>${fmtTs(a.ts)}</time><b>${esc(NAMES[a.agent_id] ?? '')}</b> ${esc(a.message)}</li>`).join('')
    : '<li class="muted">Belum ada aktivitas. Kantor buka tiap hari 07:00–21:00 WITA.</li>';

  renderTrading(s?.trading);

  office?.setCampaign(s?.campaign?.theme, st.pending ?? 0);
  lastChatKey = null;
  tick(true);
}

// chit-chat: diperbarui tiap ganti menit (live) atau tiap geser waktu simulasi
const AVATAR = Object.fromEntries([['owner', '#5b1fd6'], ...AGENTS.map((a) => [a.id, a.avatar])]);
const KIND = { oper: '🔁', santai: '☕', kerja: '💻', curhat: '💭', bos: '👑', pacaran: '💕' };
let lastChatKey = null;
function renderChat(t) {
  const sim = $('sim-toggle').checked;
  const key = `${sim}|${t.dow}|${Math.floor(t.minutes)}`;
  if (key === lastChatKey) return;
  lastChatKey = key;
  const feed = chatFeed(t, state, state?.today, sim).reverse(); // lama di atas, baru di bawah
  const box = $('chat');
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  box.innerHTML = feed.length
    ? feed.map((c) => `<li class="${c.kind}">
        <div class="av" style="background:${AVATAR[c.from] ?? '#555'}">${esc((NAMES[c.from] ?? '?')[0])}</div>
        <div class="msg"><div class="meta"><b>${esc(NAMES[c.from] ?? c.from)}</b>${c.to ? `→ ${esc(NAMES[c.to] ?? c.to)}` : ''}<span>${KIND[c.kind] ?? ''} ${c.time}</span></div>${esc(c.message)}</div>
      </li>`).join('')
    : '<li><span class="empty">Kantor masih sepi. Obrolan muncul pas jam kerja 07:00–21:00 WITA.</span></li>';
  if (atBottom || !box.dataset.ready) { box.scrollTop = box.scrollHeight; box.dataset.ready = '1'; }
}

const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const fmtTs = (ts) => new Date(ts.replace(' ', 'T') + 'Z').toLocaleString('id-ID', { timeZone: 'Asia/Makassar', weekday: 'short', hour: '2-digit', minute: '2-digit' });

const realOf = (id) => state?.agents?.find((a) => a.id === id);

// oper kerjaan asli (≤8 menit lalu) → pengirim jalan nyamperin meja penerima
const VISIT_MIN = 8;
function visitsNow() {
  if ($('sim-toggle').checked) return {};
  const v = {};
  for (const c of state?.chats ?? []) {
    if (c.kind !== 'oper' || !c.to_id || c.to_id === 'owner' || v[c.agent_id]) continue;
    const age = (Date.now() - new Date(c.ts.replace(' ', 'T') + 'Z').getTime()) / 60000;
    if (age >= 0 && age < VISIT_MIN) v[c.agent_id] = { target: c.to_id, label: `Nyamperin ${NAMES[c.to_id] ?? c.to_id}, oper kerjaan` };
  }
  return v;
}

// panel Tim: per divisi, urut sesuai alur kerja (urutan AGENTS dipakai buat kursi/kasur, jangan diubah)
const DIVISIONS = [
  { name: 'Pimpinan', flow: '', ids: ['owner'] },
  { name: 'Marketing', flow: 'plan → riset → konten → publish → iklan → data', ids: ['dir', 'researcher', 'price', 'copywriter', 'designer', 'video', 'publisher', 'ads', 'analyst'] },
  { name: 'Trading XAUUSD', flow: 'siklus tiap candle M15', ids: ['tdir', 'tresearch', 'ttech', 'trisk', 'texec', 'teval', 'treport'] },
  { name: 'Umum', flow: '', ids: ['ob'] },
];
// card Tim lebar penuh: kolom 1 Pimpinan + Umum, kolom 2 Marketing, kolom 3 Trading
const TEAM_COLUMNS = [[0, 3], [1], [2]];

function tick(force = false) {
  const t = now();
  $('clock-day').textContent = t.dayName;
  $('clock-time').textContent = `${t.hh}:${t.mm}`;

  // pertama kali: taruh langsung. Waktu simulasi lompat jauh: jalan cepat (tidak pernah teleport)
  const key = t.dow * 1440 + t.minutes;
  const mode = force === 'init' ? 'init' : lastSim !== null && Math.abs(key - lastSim) > 3 ? 'rush' : 'walk';
  lastSim = key;

  office?.setTime(t.minutes, t.dow);
  if (office?.chars.size) office.setOutfitForDay(t.dow);
  const visits = visitsNow();
  const list = AGENTS.map((a, idx) => {
    const real = realOf(a.id);
    const partnerBusy = a.partner ? realOf(a.partner)?.status === 'working' : false;
    const info = describe(a, activityAt(idx, a, t, real, { visit: visits[a.id], partnerBusy }), real);
    office?.setActivity(a.id, info, mode);
    return { a, info };
  });

  const os = officeStatus(t, list.some((l) => l.info.overtime));
  const pill = $('office-status');
  pill.textContent = os.label;
  pill.className = `pill ${os.tone}`;

  const byId = Object.fromEntries(list.map((l) => [l.a.id, l]));
  const row = ({ a, info }) => `
    <li class="member ${selected === a.id ? 'active' : ''}" data-id="${a.id}">
      <div class="avatar" style="background:${a.avatar}">${a.name[0]}</div>
      <div class="who"><strong>${a.name} <span style="display:inline;color:var(--muted);font-weight:400">· ${a.title}</span></strong><span>${info.emoji} ${esc(info.label)}</span></div>
      <div class="emoji" title="${esc(info.mood?.label ?? '')}">${info.mood?.emoji ?? ''}</div>
    </li>`;
  const division = (d) => {
    const rows = d.ids.map((id) => byId[id]).filter(Boolean);
    return rows.length ? `<div class="division"><span>${d.name}</span><small>${d.flow}</small></div><ul>${rows.map(row).join('')}</ul>` : '';
  };
  $('team-list').innerHTML = TEAM_COLUMNS.map((col) => `<li class="team-col">${col.map((i) => division(DIVISIONS[i])).join('')}</li>`).join('');
  if (selected) renderInspector(selected, list.find((l) => l.a.id === selected)?.info);
  renderChat(t);
}

// ---------- card Trading XAU (data dari tradingState() di scripts/office.mjs; sesi & dampak berita dihitung live)
const usd = (v, sign = false) => v == null ? '–' : `${sign ? (v >= 0 ? '+' : '−') : v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const tone = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : '');
const witaHM = (ms) => new Date(ms).toLocaleTimeString('id-ID', { timeZone: 'Asia/Makassar', hour: '2-digit', minute: '2-digit' });
const witaDay = (ms) => new Date(ms).toLocaleDateString('id-ID', { timeZone: 'Asia/Makassar', weekday: 'short' });
const kvRow = (k, v, cls = '') => `<div class="kv"><span>${k}</span><b class="${cls}">${v}</b></div>`;
// sama dengan marketOpen() di scripts/trading/market.mjs
function goldMarketOpen(d = new Date()) {
  const day = d.getUTCDay(), h = d.getUTCHours() + d.getUTCMinutes() / 60;
  if (day === 6) return false;
  if (day === 0) return h >= 22;
  if (day === 5 && h >= 21) return false;
  return !(h >= 21 && h < 22);
}
function sparkline(pts) {
  if (!pts || pts.length < 2) return '<div class="muted spark-empty">Grafik saldo muncul setelah ada trade tertutup.</div>';
  const w = 240, h = 46, lo = Math.min(...pts), hi = Math.max(...pts), span = hi - lo || 1;
  const xy = pts.map((v, i) => `${(i / (pts.length - 1) * w).toFixed(1)},${(h - 3 - (v - lo) / span * (h - 6)).toFixed(1)}`).join(' ');
  const col = pts.at(-1) >= pts[0] ? 'var(--ok)' : '#f87171';
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-label="Kurva saldo"><polyline points="${xy}" fill="none" stroke="${col}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}
function renderTrading(tr) {
  $('trd-mode').textContent = tr ? `mode ${tr.mode}${tr.paused ? ' · dijeda' : ''}` : 'belum jalan';
  if (!tr) {
    $('trd-kpi').innerHTML = '';
    for (const id of ['trd-now', 'trd-news', 'trd-risk']) $(id).innerHTML = '<div class="muted">–</div>';
    $('trd-trades').innerHTML = $('trd-list').innerHTML = '';
    return;
  }
  const st = tr.stats ?? {}, rk = tr.risk ?? {}, now = Date.now();
  const open = tr.open ?? [];

  // angka utama
  const winRate = st.n ? Math.round(st.wins / st.n * 100) : null;
  const dd = tr.peak && tr.balance != null ? Math.max(0, (tr.peak - tr.balance) / tr.peak * 100) : 0;
  const tile = (k, v, sub = '', cls = '') => `<div><span class="muted">${k}</span><b class="${cls}">${v}</b>${sub ? `<small class="muted">${sub}</small>` : ''}</div>`;
  $('trd-kpi').innerHTML = [
    tile('Harga XAUUSD', tr.price ? tr.price.toFixed(2) : '–', tr.ea?.connected ? 'dari EA MT5' : 'dari Yahoo'),
    tile('Saldo', usd(tr.balance), tr.mode === 'paper' ? 'simulasi' : tr.ea?.demo ? 'akun demo' : 'akun real'),
    tile('Hari ini', usd(tr.today_pnl, true), `${st.today_n ?? 0} trade`, tone(tr.today_pnl)),
    tile('7 hari', usd(st.week_pnl, true), `total ${usd(st.pnl ?? 0, true)}`, tone(st.week_pnl)),
    tile('Win rate', winRate == null ? '–' : `${winRate}%`, `${st.wins ?? 0} menang · ${st.losses ?? 0} kalah`),
    tile('Drawdown', `${dd.toFixed(1)}%`, `puncak ${usd(tr.peak)}`, dd >= 5 ? 'down' : ''),
  ].join('');

  // arah per timeframe: dicek tiap candle tutup (M10 tiap 10 menit … M60 tiap jam)
  const TF = [['M10', 'M10', 10], ['M15', 'M15', 15], ['M30', 'M30', 30], ['H1', 'M60', 60]];
  const biasTxt = { bullish: '🟢 Bullish', bearish: '🔴 Bearish', sideways: '⚪ Sideways' };
  $('trd-tf').innerHTML = TF.map(([key, label, min]) => {
    const x = tr.tf?.[key];
    const next = x?.at ? Math.floor(x.at / (min * 60000)) * min * 60000 + min * 60000 + 40000 : null;
    return `<div class="tf ${x?.bias ?? 'none'}"><span class="muted">${label} <small>· cek tiap ${min} mnt</small></span>
      <b>${x?.bias ? biasTxt[x.bias] : '⏳ Belum ada'}</b>
      <small class="muted">${x?.bias ? `skor ${x.score > 0 ? '+' : ''}${x.score}/3 · RSI ${x.rsi}` : esc(x?.note ?? 'nunggu cek pertama')}</small>
      <small class="muted">${x?.at ? `dicek ${witaHM(x.at)} · berikutnya ${witaHM(next)}` : ''}</small></div>`;
  }).join('');

  // kondisi sekarang: masuk atau nggak, dan kenapa
  const L = tr.last, t = L?.tech ?? {};
  const [s0, s1] = rk.sessionUTC ?? [6, 20], hUtc = new Date().getUTCHours();
  const sessionOn = hUtc >= s0 && hUtc < s1, mkt = goldMarketOpen();
  const sesTxt = `${witaHM(Date.UTC(2000, 0, 1, s0))}–${witaHM(Date.UTC(2000, 0, 1, s1))}`;
  const verdict = open.length
    ? `<div class="verdict in">📈 Lagi pegang posisi ${open[0].side.toUpperCase()} ${open[0].lot} lot<small>Entry ${open[0].entry} · SL ${open[0].sl} · TP ${open[0].tp}</small></div>`
    : !L ? '<div class="verdict">Belum ada analisa</div>'
      : L.decision !== 'NO TRADE' ? `<div class="verdict in">✅ Masuk ${L.decision} ${L.lot} lot · RR 1:${L.rr}<small>${esc(L.reason)}</small></div>`
        : `<div class="verdict out">⛔ Nggak masuk<small>${esc(L.reason)}</small></div>`;
  const biasIcon = { bullish: '🟢', bearish: '🔴', sideways: '⚪' }[t.bias] ?? '';
  $('trd-now').innerHTML = verdict
    + kvRow('Teknikal (Keira)', t.bias ? `${biasIcon} ${t.bias} · skor ${Math.abs(t.score ?? 0)}/3` : '–')
    + kvRow('Fundamental (Davina)', esc(tr.fund?.note ?? 'netral, pantau kalender'))
    + kvRow('Pasar emas', mkt ? 'buka' : 'tutup', mkt ? 'up' : 'down')
    + kvRow(`Sesi London–NY (${sesTxt} WITA)`, sessionOn ? 'jalan' : 'di luar sesi', sessionOn ? 'up' : '')
    + kvRow('EA MT5', tr.ea?.connected ? `tersambung${tr.ea.demo ? ' (demo)' : ''}` : 'belum tersambung', tr.ea?.connected ? 'up' : '')
    + kvRow('Analisa terakhir', L ? `${fmtTs(L.ts)} WITA` : '–');

  // berita: lagi terdampak (dalam ±menit blackout rilis High) atau aman
  const win = (rk.newsBlackoutMin ?? 45) * 60000;
  const cal = tr.calendar ?? [];
  const hit = cal.find((e) => e.impact === 'High' && Math.abs(e.at - now) <= win);
  const next = cal.find((e) => e.impact === 'High' && e.at > now);
  const banner = hit
    ? `<div class="verdict out">⚠️ Lagi terdampak berita: ${esc(hit.title)}<small>Rilis ${witaDay(hit.at)} ${witaHM(hit.at)} WITA · entry ditahan sampai ${witaHM(hit.at + win)} WITA</small></div>`
    : `<div class="verdict in">🛡️ Aman dari berita<small>${next ? `Berikutnya: ${esc(next.title)} · ${witaDay(next.at)} ${witaHM(next.at)} WITA (entry ditahan ±${rk.newsBlackoutMin ?? 45} menit)` : 'Nggak ada rilis USD berdampak tinggi lagi minggu ini'}</small></div>`;
  $('trd-news').innerHTML = banner + (cal.length
    ? `<ul class="news">${cal.map((e) => `<li class="${e.at < now - win ? 'past' : ''}${e === hit ? ' hit' : ''}"><time>${witaDay(e.at)} ${witaHM(e.at)}</time><i class="imp ${e.impact === 'High' ? 'hi' : 'md'}" title="${e.impact}"></i><span>${esc(e.title)}${e.forecast || e.previous ? `<small>prakiraan ${esc(e.forecast || '–')} · sebelumnya ${esc(e.previous || '–')}</small>` : ''}</span></li>`).join('')}</ul>`
    : '<div class="muted">Kalender kosong.</div>');

  // risiko & loss
  const eq = tr.balance ?? 0, lossCap = eq * (rk.dailyLossPct ?? 3) / 100;
  const lossToday = Math.max(0, -(tr.today_pnl ?? 0));
  const pct = lossCap ? Math.min(100, lossToday / lossCap * 100) : 0;
  const pf = st.gross_loss ? (st.gross_win / Math.abs(st.gross_loss)).toFixed(2) : st.gross_win ? '∞' : '–';
  $('trd-risk').innerHTML = kvRow(`Rugi hari ini (batas ${rk.dailyLossPct ?? 3}%)`, `${usd(lossToday)} / ${usd(lossCap)}`, lossToday ? 'down' : '')
    + `<div class="bar"><i style="width:${pct}%"></i></div>`
    + kvRow('Kalah beruntun hari ini', `${st.consec_loss ?? 0} / ${rk.maxConsecLoss ?? 3}`, st.consec_loss ? 'down' : '')
    + kvRow('Total loss', usd(st.gross_loss ?? 0), st.gross_loss ? 'down' : '')
    + kvRow('Loss terbesar', usd(st.max_loss ?? 0), st.max_loss ? 'down' : '')
    + kvRow('Profit factor · rata-rata', `${pf} · ${st.n ? `${st.avg_r >= 0 ? '+' : ''}${st.avg_r}R` : '–'}`)
    + kvRow('Risiko per trade', `${rk.riskPct ?? 1}% (≈${usd(eq * (rk.riskPct ?? 1) / 100)}) · RR 1:${rk.rr ?? 2}`)
    + ((tr.proposals ?? []).length ? kvRow('Usulan Jihan nunggu ACC', tr.proposals.map((x) => `#${x.id}`).join(', ')) : '')
    + sparkline(tr.curve);

  // posisi terbuka (floating dari harga terakhir, 1 lot = 100 oz) + riwayat
  const fl = (o) => (tr.price ? (tr.price - o.entry) * (o.side === 'buy' ? 1 : -1) * o.lot * 100 : null);
  const rows = [
    ...open.map((o) => `<li><b>${o.side.toUpperCase()} ${o.lot}</b> kebuka @ ${o.entry} · SL ${o.sl} · TP ${o.tp} · floating <b class="${tone(fl(o))}">${usd(fl(o), true)}</b></li>`),
    ...(tr.trades ?? []).map((x) => `<li><time>${fmtTs(x.close_ts)}</time><b>${x.side.toUpperCase()} ${x.lot}</b> ${x.entry} → ${x.exit} <b class="${tone(x.pnl)}">${usd(x.pnl, true)}</b>${x.r != null ? ` (${x.r >= 0 ? '+' : ''}${(+x.r).toFixed(1)}R)` : ''} · ${esc(x.reason_close)}</li>`),
  ];
  $('trd-trades').innerHTML = rows.length ? rows.join('') : '<li class="muted">Belum ada trade. Aryaputra baru masuk kalau semua syarat lolos.</li>';
  $('trd-list').innerHTML = (tr.signals ?? []).length
    ? tr.signals.map((x) => `<li><time>${fmtTs(x.ts)}</time><b>${esc(x.decision)}</b> ${esc(x.reason)}</li>`).join('')
    : '<li class="muted">Tim trading belum mulai analisa.</li>';
}

function renderInspector(id, info) {
  const a = AGENTS.find((x) => x.id === id);
  if (!a) { $('inspector').hidden = true; return; }
  $('inspector').hidden = false;
  $('insp-name').textContent = a.name;
  $('insp-title').textContent = a.title;
  $('insp-act').textContent = `${info?.emoji ?? ''} ${info?.label ?? ''}`;
  $('insp-mood').textContent = info?.mood ? `Mood: ${info.mood.emoji} ${info.mood.label}` : '';
  const tasks = (state?.today_tasks ?? []).filter((t) => t.agent_id === id);
  $('insp-tasks').innerHTML = tasks.length
    ? '<div class="muted">Tugas hari ini</div>' + tasks.map((t) => `<div><span>${esc(t.title)}</span><span class="muted">${t.status === 'done' ? '✅' : t.status === 'doing' ? '⚡' : '•'}</span></div>`).join('')
    : '<div class="muted">Belum ada tugas dari database hari ini.</div>';
}

function select(id) {
  selected = id;
  if (!id) $('inspector').hidden = true;
  tick();
}

// ---------- event ----------
$('team-list').addEventListener('click', (e) => {
  const li = e.target.closest('.member');
  if (li) { office?.select(li.dataset.id); office?.focus(li.dataset.id); select(li.dataset.id); $('office').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
});
$('insp-close').addEventListener('click', () => { office?.select(null); select(null); });
$('sim-toggle').addEventListener('change', (e) => {
  $('sim-day').disabled = $('sim-time').disabled = !e.target.checked;
  $('sim-play').disabled = !e.target.checked;
  if (e.target.checked) { const t = wita(new Date()); $('sim-day').value = String(t.dow); $('sim-time').value = Math.floor(t.minutes); }
  else stopPlay();
  updateSimOut();
  tick();
});
// ▶ putar waktu simulasi: 1 detik nyata = 1 menit kantor
let playTimer = null;
const stopPlay = () => { clearInterval(playTimer); playTimer = null; $('sim-play').textContent = '▶'; };
$('sim-play').addEventListener('click', () => {
  if (playTimer) return stopPlay();
  $('sim-play').textContent = '⏸';
  playTimer = setInterval(() => {
    const r = $('sim-time');
    r.value = (+r.value + 1) % 1440;
    updateSimOut(); tick();
  }, 1000);
});
const updateSimOut = () => { const m = +$('sim-time').value; $('sim-out').textContent = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
$('sim-time').addEventListener('input', () => { updateSimOut(); tick(); });
$('sim-day').addEventListener('change', () => tick());

// ---------- start ----------
setInterval(tick, 1000);
setInterval(loadState, 60_000);
loadState();

try {
  const { Office } = await import('./pixoffice.js');
  office = new Office($('office-canvas'), $('office'), now().dow === 1 ? 'formal' : 'kerja');
  office.onSelect = (id) => select(id);
  window.office = office; // memudahkan debug dari console
  $('loading').textContent = 'Lagi ngegambar kantor…';
  await office.ready;
  $('loading').remove();
  office.setCampaign(state?.campaign?.theme, state?.stats?.this_week?.pending ?? 0);
  tick('init');
} catch (err) {
  console.error(err);
  $('loading').textContent = 'Kantor gagal dimuat.';
}
