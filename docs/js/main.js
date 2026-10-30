import { AGENTS, wita, activityAt, describe, officeStatus, approvalWaits, pairBilliard } from './schedule.js';
import { chatFeed } from './chatter.js';
import { BIRTHDAYS, birthdaysOn, relationsOn, STAGE_LABEL, dateOf } from './social.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const GAME = { mlbb: 'ML', valorant: 'Valorant', freefire: 'Free Fire', other: 'Gaming' };
const STATUS = {
  draft: 'Draft', pending_approval: 'Nunggu approval', revision: 'Revisi', approved: 'Approved',
  rejected: 'Ditolak', scheduled: 'Terjadwal', posted: 'Terposting', failed: 'Gagal',
  uploading: 'Lagi upload', uploaded: 'Private, nunggu Owner ubah Publik', upload_failed: 'Upload gagal',
};
const SHORTS_4WEEK_FROM = '2026-10-26'; // Zataa History sempat 4/minggu (hari kosong = libur, bukan telat)
const SHORTS_4WEEK_TO = '2026-10-30';   // mulai tanggal ini History balik tiap hari (7/minggu)
const SHORTS_DAILY_FROM = '2026-10-19'; // mulai tanggal ini Shorts tiap hari (dulu Senin–Selasa libur)
const NAMES = Object.fromEntries([['owner', 'Zamiir'], ...AGENTS.map((a) => [a.id, a.name])]);

let state = null;
let socials = null;
let health = null; // docs/data/health.json
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
  try {
    const r = await fetch(`data/socials.json?t=${Date.now()}`, { cache: 'no-store' });
    if (r.ok) socials = await r.json();
  } catch { /* belum ada data analytics */ }
  try {
    const r = await fetch(`data/health.json?t=${Date.now()}`, { cache: 'no-store' });
    if (r.ok) health = await r.json();
  } catch { /* belum ada data kesehatan */ }
  renderDashboard();
  renderSocials();
  renderHealth();
}

// ---------- kesehatan kantor (docs/data/health.json dari scripts/health.mjs, di-push watcher tiap 10 menit)
const ago = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'barusan' : m < 60 ? `${m} mnt lalu` : m < 1440 ? `${Math.round(m / 60)} jam lalu` : `${Math.round(m / 1440)} hari lalu`;
};
function renderHealth() {
  const box = $('health-grid');
  if (!box) return;
  const items = Object.entries(health?.services ?? {}).map(([key, s]) => {
    const fails = s.fails?.length ?? 0;
    let cls = s.state === 'paused' ? 'off' : s.state === 'error' ? 'bad' : fails ? 'warn' : 'ok';
    let msg = s.state === 'paused' ? s.msg : s.state === 'error' ? s.msg : fails ? `${fails}× gagal 24 jam · terakhir oke ${s.okAt ? ago(s.okAt) : '-'}` : `oke · ${ago(s.at)}`;
    // watcher berhenti lapor >30 menit (push tiap 10 menit) = kantor VPS mati
    if (key === 'watcher' && Date.now() - s.at > 30 * 60000) { cls = 'bad'; msg = `nggak ada kabar sejak ${ago(s.at)} (VPS/watcher mati?)`; }
    return { name: s.name ?? key, cls, msg };
  });
  // tim trading: sinyal tiap candle M15 (service zataa-trading); pasar emas tutup Sabtu–Minggu
  const last = state?.trading?.last?.ts;
  if (last) {
    const t = Date.parse(`${last.replace(' ', 'T')}Z`);
    const weekend = [0, 6].includes(new Date(Date.now() + 8 * 3600_000).getUTCDay());
    const stale = Date.now() - t > 45 * 60000;
    items.push({ name: 'Tim Trading (M15)', cls: stale ? (weekend ? 'off' : 'bad') : 'ok', msg: stale ? (weekend ? `pasar tutup · sinyal terakhir ${ago(t)}` : `sinyal terakhir ${ago(t)}, service mati?`) : `jalan · ${state.trading.mode ?? 'paper'} · ${ago(t)}` });
  }
  const order = { bad: 0, warn: 1, ok: 2, off: 3 };
  items.sort((a, b) => order[a.cls] - order[b.cls]);
  box.innerHTML = items.length ? items.map((i) => `<li class="${i.cls}"><b>${esc(i.name)}</b><small>${esc(i.msg)}</small></li>`).join('') : '<li class="muted">Belum ada laporan dari watcher.</li>';
  $('health-updated').textContent = health?.at ? `update ${ago(health.at)}` : '';
}

// ---------- analytics sosmed (docs/data/socials.json, ditarik watcher tiap 3 jam lewat scripts/socials.mjs)
const PLATFORMS = [
  { key: 'instagram', name: 'Instagram', icon: '📸', audience: 'followers', audLabel: 'Followers' },
  { key: 'tiktok', name: 'TikTok', icon: '🎵', audience: 'followers', audLabel: 'Followers' },
  { key: 'youtube', name: 'YouTube · Zataa History', icon: '▶️', audience: 'subscribers', audLabel: 'Subscribers' },
  // divisi Zataa Story (akun sendiri: YouTube channel baru + TikTok @zataa.story)
  { key: 'story_youtube', name: 'YouTube', icon: '▶️', audience: 'subscribers', audLabel: 'Subscribers', group: 'story' },
  { key: 'story_tiktok', name: 'TikTok', icon: '🎵', audience: 'followers', audLabel: 'Followers', group: 'story' },
];
const num = (n) => (n == null ? '—' : Number(n).toLocaleString('id-ID'));
const safeUrl = (u) => (/^https:\/\//.test(u ?? '') ? u : null);
function renderSocials() {
  const s = socials;
  $('social-updated').textContent = s?.generated_at ? `update ${new Date(s.generated_at).toLocaleString('id-ID', { timeZone: 'Asia/Makassar', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })} WITA` : '';
  if (!s) { $('social-grid').innerHTML = '<p class="muted">Belum ada data. Ditarik otomatis tiap 3 jam.</p>'; return; }
  const GROUP = { story: '<h3 class="social-group"><img src="assets/zataa-story-logo.png" alt="" width="28" height="28">Zataa Story <small>misteri & horor Nusantara · tim Raditya</small></h3>' };
  $('social-grid').innerHTML = PLATFORMS.map((pf, i) => (pf.group && pf.group !== PLATFORMS[i - 1]?.group ? GROUP[pf.group] : '') + (() => {
    const p = s[pf.key];
    const head = `<h3><span>${pf.icon} ${pf.name}</span>${p?.url && safeUrl(p.url) ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.handle ?? '')}</a>` : ''}</h3>`;
    if (!p || p.error) return `<section class="social-col">${head}<p class="muted">Data belum tersedia${p?.error ? `: ${esc(p.error)}` : ''}</p></section>`;
    const c = p.posts ?? {};
    const parts = [['video', '🎬 video'], ['foto', '🖼️ foto'], ['carousel', '🗂️ carousel']].filter(([k]) => c[k]).map(([k, l]) => `${num(c[k])} ${l}`).join(' · ');
    const top = (p.top ?? []).map((t) => {
      const url = safeUrl(t.url), thumb = safeUrl(t.thumb);
      const inner = `${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="ph">🎬</span>'}
        <span class="t"><span>${esc(t.title || '(tanpa judul)')}</span><small>👁 ${num(t.views)} · ❤ ${num(t.likes)} · 💬 ${num(t.comments)}</small></span>`;
      return `<li>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${inner}</a>` : inner}</li>`;
    }).join('');
    return `<section class="social-col">${head}
      <div class="aud"><strong>${num(p[pf.audience])}</strong><span>${pf.audLabel}</span></div>
      <dl class="social-stats">
        <div><dt>Postingan</dt><dd>${num(c.total)}</dd><small>${parts || '—'}</small></div>
        <div><dt>Views</dt><dd>${num(p.views)}</dd>${p.views == null ? '<small>butuh izin insights</small>' : ''}</div>
        <div><dt>Likes</dt><dd>${num(p.likes)}</dd></div>
        <div><dt>Komentar</dt><dd>${num(p.comments)}</dd></div>
      </dl>
      <h4>Top konten</h4>
      ${top ? `<ol class="social-top">${top}</ol>` : '<p class="muted">Belum ada postingan.</p>'}
    </section>`;
  })()).join('');
}

function renderDashboard() {
  const s = state;
  const st = s?.stats?.this_week ?? {};
  const lw = s?.stats?.last_week ?? {};
  // KPI gabungan Marketing + Shorts, rincian di baris kecil (yt_* dari office.mjs weekStats)
  const split = (all, yt) => `Marketing ${(all ?? 0) - (yt ?? 0)} · Shorts ${yt ?? 0}`;
  $('k-total').textContent = st.total ?? 0;
  $('k-total-sub').textContent = split(st.total, st.yt_total);
  $('k-pending').textContent = st.pending ?? 0;
  $('k-pending-sub').textContent = `${split(st.pending, st.yt_pending)} · cek Telegram`;
  $('k-posted').textContent = st.posted ?? 0;
  $('k-sched').textContent = `${split(st.posted, st.yt_posted)} · ${st.scheduled ?? 0} terjadwal`;
  $('k-views').textContent = (st.views ?? 0).toLocaleString('id-ID');
  const diff = lw.views ? Math.round(((st.views - lw.views) / lw.views) * 100) : null;
  const vSplit = `Marketing ${((st.views ?? 0) - (st.yt_views ?? 0)).toLocaleString('id-ID')} · Shorts ${(st.yt_views ?? 0).toLocaleString('id-ID')}`;
  $('k-views-sub').textContent = diff === null ? vSplit : `${diff >= 0 ? '▲' : '▼'} ${Math.abs(diff)}% vs minggu lalu · ${vSplit}`;
  // klik link pelacak (golink.mjs) → toko (scripts/golink.mjs); nama sumber sama dengan SOURCES di sana
  const SRC = { ig: 'IG bio', igs: 'IG Story', tt: 'TikTok', tg: 'Telegram', yt: 'YouTube', wa: 'WA', '(direct)': 'langsung', google: 'Google' };
  const g = st.ga4;
  $('k-clicks').textContent = ((g ? g.sessions : st.clicks) ?? 0).toLocaleString('id-ID');
  $('k-clicks-sub').textContent = g
    ? `${g.users} orang · ${(g.by_src ?? []).slice(0, 3).map((r) => `${SRC[r.src] ?? r.src} ${r.n}`).join(' · ') || 'GA4'}${lw.ga4 ? ` · minggu lalu ${lw.ga4.sessions}` : ''}`
    : st.clicks
    ? `${st.click_visitors} orang · ${(st.click_src ?? []).map((r) => `${SRC[r.src] ?? r.src} ${r.n}`).join(' · ')}`
    : 'data klik ada di GA4 toko (Akuisisi → utm_source)';
  $('campaign-theme').textContent = s?.campaign?.theme ? `Tema: ${s.campaign.theme}` : 'Belum ada campaign';
  $('updated-at').textContent = s?.generated_at ? `update ${new Date(s.generated_at).toLocaleString('id-ID', { timeZone: 'Asia/Makassar', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}` : '';

  // jadwal minggu: Marketing (IG/TikTok), Zataa History (channel 'youtube', tiap hari) & Zataa Story (channel 'story', tiap hari)
  const week = s?.week_start ?? null;
  const days = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
  const isYT = (c) => c.channel === 'youtube';
  const isShort = (c) => c.channel === 'youtube' || c.channel === 'story';
  $('week-grid').innerHTML = days.map((d, i) => {
    const date = week ? addDays(week, i) : null;
    const items = (s?.week_contents ?? []).filter((c) => c.day === date && !isShort(c));
    const chips = items.length
        ? items.map((c) => `<div class="chip ${c.format === 'video' ? 'video' : ''} s-${c.status}" title="${esc(STATUS[c.status] ?? c.status)}">
            <b>${esc(c.slot)} · ${c.format === 'video' ? '🎬 video' : c.format === 'carousel' ? '🖼️ carousel' : '🖼️ feed'}${c.game ? ' · ' + esc(GAME[c.game] ?? c.game) : ''}</b>${esc(c.title)}</div>`).join('')
        : '<p class="empty">—</p>';
    return `<div class="day ${date === s?.today ? 'today' : ''}"><h3>${d}<small>${date ? date.slice(8) : ''}</small></h3>${chips}</div>`;
  }).join('');
  // Shorts: 1 slot tiap hari sejak 19 Okt 2026 (sebelumnya Senin–Selasa libur; kosong = belum ada konten)
  $('week-grid-yt').innerHTML = days.map((d, i) => {
    const date = week ? addDays(week, i) : null;
    const off = i < 2 && date !== null && date < SHORTS_DAILY_FROM;
    const items = (s?.week_contents ?? []).filter((c) => c.day === date && isYT(c));
    const chips = off ? '<p class="empty">Libur</p>'
      : items.length ? items.map((c) => `<div class="chip yt s-${c.status}" title="${esc(STATUS[c.status] ?? c.status)}"><b>18:00 · 🎬 shorts</b>${esc(c.title)}</div>`).join('')
        : date && date >= SHORTS_4WEEK_FROM && date < SHORTS_4WEEK_TO ? '<p class="empty">—</p>' : '<div class="chip slot"><b>18:00 · 🎬 shorts</b>Belum ada konten</div>';
    return `<div class="day ${off ? 'off' : ''} ${date === s?.today ? 'today' : ''}"><h3>${d}<small>${date ? date.slice(8) : ''}</small></h3>${chips}</div>`;
  }).join('');
  // Zataa Story: 1 Shorts tiap hari (YouTube + TikTok)
  $('week-grid-story').innerHTML = days.map((d, i) => {
    const date = week ? addDays(week, i) : null;
    const items = (s?.week_contents ?? []).filter((c) => c.day === date && c.channel === 'story');
    const chips = items.length ? items.map((c) => `<div class="chip yt s-${c.status}" title="${esc(STATUS[c.status] ?? c.status)}"><b>👻 shorts + TikTok</b>${esc(c.title)}</div>`).join('')
      : '<div class="chip slot"><b>👻 shorts + TikTok</b>Belum ada konten</div>';
    return `<div class="day ${date === s?.today ? 'today' : ''}"><h3>${d}<small>${date ? date.slice(8) : ''}</small></h3>${chips}</div>`;
  }).join('');

  // aktivitas
  const acts = s?.activity ?? [];
  $('activity').innerHTML = acts.length
    ? acts.map((a) => `<li><time>${fmtTs(a.ts)}</time><b>${esc(NAMES[a.agent_id] ?? '')}</b> ${esc(a.message)}</li>`).join('')
    : '<li class="muted">Belum ada aktivitas. Kantor jalan 24 jam, kerja tiap hari mulai 07:00 WITA.</li>';

  renderTrading(s?.trading);

  office?.setCampaign(s?.campaign?.theme, st.pending ?? 0);
  lastChatKey = null;
  tick(true);
}

// chit-chat: diperbarui tiap ganti menit (live) atau tiap geser waktu simulasi
const AVATAR = Object.fromEntries([['owner', '#5b1fd6'], ...AGENTS.map((a) => [a.id, a.avatar])]);
const KIND = { oper: '🔁', santai: '☕', kerja: '💻', curhat: '💭', bos: '👑', nimbrung: '🗣️', pacaran: '💕', pdkt: '💘', gosip: '👀', ultah: '🎂', event: '🏆' };
let lastChatKey = null;
function renderChat(t) {
  const sim = $('sim-toggle').checked;
  const key = `${sim}|${t.dow}|${Math.floor(t.minutes)}`;
  if (key === lastChatKey) return;
  lastChatKey = key;
  const all = chatFeed(t, state, state?.today, sim);
  const isWork = (c) => WORK_KINDS.has(c.kind);
  fillChat($('chat-work'), all.filter(isWork).slice(0, 70).reverse(), 'Belum ada obrolan kerja. Oper kerjaan & diskusi muncul pas jam kerja.');
  fillChat($('chat'), all.filter((c) => !isWork(c)).slice(0, 90).reverse(), 'Kantor masih sepi. Obrolan muncul pas ada yang nongkrong bareng.');
}
const WORK_KINDS = new Set(['oper', 'kerja', 'bos']);
function fillChat(box, feed, empty) {   // lama di atas, baru di bawah; tetap nempel bawah kalau user lagi di bawah
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  box.innerHTML = feed.length
    ? feed.map((c) => `<li class="${c.kind}">
        <div class="av" style="background:${AVATAR[c.from] ?? '#555'}" title="${esc(NAMES[c.from] ?? c.from)}">${esc((NAMES[c.from] ?? '?')[0])}<img src="assets/office/faces/${esc(c.from)}.webp" alt="" loading="lazy" onerror="this.remove()"></div>
        <div class="msg"><div class="meta"><b>${esc(NAMES[c.from] ?? c.from)}</b>${c.to ? `→ ${esc(NAMES[c.to] ?? c.to)}` : ''}<span>${KIND[c.kind] ?? ''} ${c.time}</span></div>${esc(c.message)}</div>
      </li>`).join('')
    : `<li><span class="empty">${empty}</span></li>`;
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
  { name: 'Pimpinan', color: 'boss', flow: '', ids: ['owner', 'sec'] },
  { name: 'Umum', color: 'gen', flow: '', ids: ['ob'] },
  { name: 'Marketing', color: 'mkt', flow: 'plan → riset → konten → publish → iklan → data', ids: ['dir', 'researcher', 'price', 'copywriter', 'designer', 'video', 'publisher', 'ads', 'analyst'] },
  { name: 'YouTube · Zataa History', color: 'yt', flow: 'riset → naskah & cek fakta → visual → video → upload · tiap hari', ids: ['ydir', 'yresearch', 'yscript', 'yvisual', 'yvideo', 'ypublish'] },
  { name: 'Zataa Story', color: 'story', flow: 'riset → naskah → visual → video → YouTube + TikTok · tiap hari', ids: ['sdir', 'sresearch', 'sscript', 'svisual', 'svideo', 'spublish'] },
  { name: 'Trading XAUUSD', color: 'trd', flow: 'siklus tiap candle M15', ids: ['tdir', 'tresearch', 'ttech', 'trisk', 'texec', 'teval', 'treport'] },
];

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
  // divisi yang nunggu ✅ Owner di Telegram → manajernya nunggu di depan ruang Bos
  const waits = approvalWaits({ campaign: state?.campaign, contents: state?.week_contents, agents: state?.agents, proposals: state?.trading?.proposals, today: state?.today });
  const infos = pairBilliard(AGENTS.map((a, idx) => {
    const real = realOf(a.id);
    const partnerBusy = a.partner ? realOf(a.partner)?.status === 'working' : false;
    return describe(a, activityAt(idx, a, t, real, { visit: visits[a.id], partnerBusy, waitApproval: waits[a.id] }), real);
  }), t);   // billiard: pasangin 2 orang per meja
  const list = AGENTS.map((a, idx) => {
    office?.setActivity(a.id, infos[idx], mode);
    return { a, info: infos[idx] };
  });

  const os = officeStatus(t, list.some((l) => l.info.overtime));
  const pill = $('office-status');
  pill.textContent = os.label;
  pill.className = `pill ${os.tone}`;

  const byId = Object.fromEntries(list.map((l) => [l.a.id, l]));
  const bdayIds = birthdaysOn(dateOf(t));
  const row = ({ a, info }) => `
    <li class="member ${selected === a.id ? 'active' : ''}" data-id="${a.id}" title="${esc(`${a.name} · ${a.title}`)}">
      <div class="bust" style="--av:${a.avatar}">${a.name[0]}<img src="assets/office/busts/${a.id}.webp" alt="" loading="lazy" onerror="this.onerror=()=>this.remove();this.src='assets/office/faces/${a.id}.webp'"></div>
      <div class="who"><strong>${a.name}${bdayIds.includes(a.id) ? ' 🎂' : ''} <small>${a.title}</small></strong><span>${info.emoji} ${esc(info.label)}</span></div>
      <i class="mood" title="${esc(info.mood?.label ?? '')}">${info.mood?.emoji ?? ''}</i>
    </li>`;
  const division = (d) => {
    const rows = d.ids.map((id) => byId[id]).filter(Boolean);
    if (!rows.length) return '';
    return `<li class="team-div ${rows.length < 3 ? 'mini' : ''}" style="--acc:var(--c-${d.color})">
      <div class="division"><span>${d.name}</span><b>${rows.length}</b>${d.flow ? `<small>${d.flow}</small>` : ''}</div>
      <ul>${rows.map(row).join('')}</ul></li>`;
  };
  $('team-list').innerHTML = DIVISIONS.map(division).join('');
  if (selected) renderInspector(selected, list.find((l) => l.a.id === selected)?.info);
  renderChat(t);
}

// ---------- card Trading XAU (data dari tradingState() di scripts/office.mjs; sesi & dampak berita dihitung live)
let CUR = 'USD';   // akun cent → USC (1 USC = $0,01)
const usd = (v, sign = false) => {
  if (v == null) return '–';
  const s = sign ? (v >= 0 ? '+' : '−') : v < 0 ? '−' : '', a = Math.abs(v).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return CUR === 'USC' ? `${s}${a} USC` : `${s}$${a}`;
};
const tone = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : '');
const witaHM = (ms) => new Date(ms).toLocaleTimeString('id-ID', { timeZone: 'Asia/Makassar', hour: '2-digit', minute: '2-digit' });
const witaDay = (ms) => new Date(ms).toLocaleDateString('id-ID', { timeZone: 'Asia/Makassar', weekday: 'short' });
const kvRow = (k, v, cls = '') => `<div class="kv"><span>${k}</span><b class="${cls}">${v}</b></div>`;
// sama dengan marketOpen() di scripts/trading/market.mjs
const NY_FMT = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function goldMarketOpen(d = new Date()) {
  const p = Object.fromEntries(NY_FMT.formatToParts(d).map((x) => [x.type, x.value]));
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday), h = +p.hour + +p.minute / 60;
  if (day === 6) return false;
  if (day === 0) return h >= 18;
  if (day === 5 && h >= 17) return false;
  return !(h >= 17 && h < 18);
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
  CUR = tr.currency ?? 'USD';
  const idr = (v) => `≈ Rp${Math.round((CUR === 'USC' ? v / 100 : v) * (tr.usd_idr ?? 16500)).toLocaleString('id-ID')}`;
  const st = tr.stats ?? {}, rk = tr.risk ?? {}, now = Date.now();
  const open = tr.open ?? [];

  // angka utama
  const winRate = st.n ? Math.round(st.wins / st.n * 100) : null;
  const dd = tr.peak && tr.balance != null ? Math.max(0, (tr.peak - tr.balance) / tr.peak * 100) : 0;
  const tile = (k, v, sub = '', cls = '') => `<div><span class="muted">${k}</span><b class="${cls}">${v}</b>${sub ? `<small class="muted">${sub}</small>` : ''}</div>`;
  $('trd-kpi').innerHTML = [
    tile('Harga XAUUSD', tr.price ? tr.price.toFixed(2) : '–', tr.ea?.connected ? 'dari EA MT5' : 'dari Yahoo'),
    tile('Saldo', usd(tr.balance), `${idr(tr.balance ?? 0)} · ${tr.mode === 'paper' ? 'simulasi' : tr.ea?.demo ? 'akun demo' : 'akun real'}`),
    tile('Hari ini', usd(tr.today_pnl, true), `${idr(tr.today_pnl ?? 0)} · ${st.today_n ?? 0} trade`, tone(tr.today_pnl)),
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
  // sesi: Asia = aktif, London–NY = mode aman, rollover = libur (sama dengan strategy.mjs → session)
  const hUtc = new Date().getUTCHours(), mkt = goldMarketOpen();
  const inR = ([a, b]) => (a <= b ? hUtc >= a && hUtc < b : hUtc >= a || hUtc < b);
  const asia = rk.asiaUTC ?? [0, 7], off = rk.offUTC ?? [20, 24];
  const hmU = (h) => witaHM(Date.UTC(2000, 0, 1, h));
  const ses = inR(asia) ? ['🟢 Asia (aktif)', 'up'] : inR(off) ? ['😴 libur (rollover)', ''] : [`🛡️ London–NY (mode aman, risiko ×${rk.safeRiskMul ?? 0.5})`, ''];
  const sesTxt = `Asia ${hmU(asia[0])}–${hmU(asia[1])} · libur ${hmU(off[0])}–${hmU(off[1])} WITA`;
  const verdict = open.length
    ? `<div class="verdict in">📈 Lagi pegang posisi ${open[0].side.toUpperCase()} ${open[0].lot} lot<small>Entry ${open[0].entry} · SL ${open[0].sl} · TP ${open[0].tp}</small></div>`
    : !L ? '<div class="verdict">Belum ada analisa</div>'
      : L.decision !== 'NO TRADE' ? `<div class="verdict in">✅ Masuk ${L.decision} ${L.lot} lot · RR 1:${L.rr}<small>${esc(L.reason)}</small></div>`
        : `<div class="verdict out">⛔ Nggak masuk<small>${esc(L.reason)}</small></div>`;
  const biasIcon = { bullish: '🟢', bearish: '🔴', sideways: '⚪' }[t.bias] ?? '';
  $('trd-now').innerHTML = verdict
    + kvRow('Teknikal M15 (Keira)', t.bias ? (t.trigger ? `setup ${t.trigger.toUpperCase()} · konfirmasi ${t.score ?? 0}/4${t.confirm?.length ? ` (${esc(t.confirm.join('+'))})` : ''}` : `nunggu pantulan BB · H1 ${biasIcon} ${t.bias}`) : '–')
    + kvRow('Fundamental (Davina)', esc(tr.fund?.note ?? 'netral, pantau kalender'))
    + kvRow('Pasar emas', mkt ? 'buka' : 'tutup', mkt ? 'up' : 'down')
    + kvRow(`Sesi (${sesTxt})`, ses[0], ses[1])
    + kvRow('EA MT5', tr.ea?.connected ? `tersambung${tr.ea.demo ? ' (demo)' : ''}` : 'belum tersambung', tr.ea?.connected ? 'up' : '')
    + kvRow('Analisa terakhir', L ? `${fmtTs(L.ts)} WITA` : '–');

  // berita: lagi terdampak (dalam jendela larangan entry, bertingkat per berita) atau aman
  const wb = (e) => (e.wb ?? 60) * 60000, wa = (e) => (e.wa ?? 45) * 60000;
  const cal = tr.calendar ?? [];
  const hit = cal.find((e) => now >= e.at - wb(e) && now <= e.at + wa(e));
  const next = cal.find((e) => e.impact === 'High' && e.at > now);
  const banner = hit
    ? `<div class="verdict out">⚠️ Lagi terdampak berita: ${esc(hit.title)}<small>Rilis ${witaDay(hit.at)} ${witaHM(hit.at)} WITA · entry ditahan sampai ${witaHM(hit.at + wa(hit))} WITA</small></div>`
    : `<div class="verdict in">🛡️ Aman dari berita<small>${next ? `Berikutnya: ${esc(next.title)} · ${witaDay(next.at)} ${witaHM(next.at)} WITA (entry ditahan ${witaHM(next.at - wb(next))}–${witaHM(next.at + wa(next))})` : 'Nggak ada rilis USD berdampak tinggi lagi minggu ini'}</small></div>`;
  $('trd-news').innerHTML = banner + (cal.length
    ? `<ul class="news">${cal.map((e) => `<li class="${e.at < now - wa(e) ? 'past' : ''}${e === hit ? ' hit' : ''}"><time>${witaDay(e.at)} ${witaHM(e.at)}</time><i class="imp ${e.impact === 'High' ? 'hi' : 'md'}" title="${e.impact}"></i><span>${esc(e.title)}${e.forecast || e.previous ? `<small>prakiraan ${esc(e.forecast || '–')} · sebelumnya ${esc(e.previous || '–')}</small>` : ''}</span></li>`).join('')}</ul>`
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
  const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const [bm, bd] = (BIRTHDAYS[id] ?? '').split('-').map(Number);
  const rel = relationsOn(dateOf(now())).filter((r) => r.a === id || r.b === id)
    .map((r) => `${STAGE_LABEL[r.stage]} sama ${AGENTS.find((x) => x.id === (r.a === id ? r.b : r.a))?.name ?? ''}`);
  $('insp-mood').innerHTML = [info?.mood ? `Mood: ${info.mood.emoji} ${esc(info.mood.label)}` : '', bm ? `🎂 Ultah ${bd} ${BULAN[bm - 1]}` : '', ...rel.map(esc)]
    .filter(Boolean).join('<br>');
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

// ---------- tab navigasi (diingat di localStorage, bisa dibuka langsung lewat #hash) ----------
const TABS = [...document.querySelectorAll('.tabs [data-tab]')];
function showTab(name) {
  if (!TABS.some((b) => b.dataset.tab === name)) name = 'ringkasan';
  for (const b of TABS) b.setAttribute('aria-selected', String(b.dataset.tab === name));
  const on = TABS.find((b) => b.dataset.tab === name), bar = on.parentElement;   // HP: tab aktif digeser kelihatan
  bar.scrollLeft = on.offsetLeft - (bar.clientWidth - on.offsetWidth) / 2;
  for (const p of document.querySelectorAll('[data-panel]')) p.hidden = p.dataset.panel !== name;
  if (name === 'ringkasan') for (const box of [$('chat'), $('chat-work')]) box.scrollTop = box.scrollHeight;
  try { localStorage.setItem('tab', name); } catch { /* storage diblokir */ }
}
for (const b of TABS) b.addEventListener('click', () => { showTab(b.dataset.tab); history.replaceState(null, '', `#${b.dataset.tab}`); });
addEventListener('hashchange', () => showTab(location.hash.slice(1)));
let savedTab = null;
try { savedTab = localStorage.getItem('tab'); } catch { /* storage diblokir */ }
showTab(location.hash.slice(1) || savedTab);

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
  const { Office, loadThemes, PIXEL_THEME_LIST } = await import('./pixoffice.js');
  // mode tampilan (3D / Pixel Art HD) + tema per mode: 3D dari bg/themes/themes.json, pixel = palet (px/themes.js); diingat per browser
  const DEFAULT_THEME = 'vanilla';   // tema bawaan (keputusan Owner 26 Okt); pilihan pengunjung diingat per browser
  const KEY = { '3d': 'officeTheme', pixel: 'officeThemePx' };
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { /* storage diblokir */ } return null; };
  const lists = { '3d': await loadThemes(), pixel: PIXEL_THEME_LIST };
  const pick = (m) => {
    const L = lists[m], t = store(KEY[m]) || DEFAULT_THEME;
    return L.some((x) => x.id === t) ? t : L.some((x) => x.id === DEFAULT_THEME) ? DEFAULT_THEME : 'klasik';
  };
  let mode = store('officeMode') === 'pixel' ? 'pixel' : '3d';
  const modeSel = $('office-mode'), sel = $('office-theme');
  const fill = (m, t) => {
    sel.innerHTML = lists[m].map((x) => `<option value="${esc(x.id)}">${esc(x.label)}</option>`).join('');
    sel.value = t;
    sel.disabled = lists[m].length < 2;
  };
  const busy = async (fn) => {
    sel.disabled = modeSel.disabled = true;
    try { return await fn(); } finally { modeSel.disabled = false; sel.disabled = lists[office.mode].length < 2; }
  };
  modeSel.value = mode;
  fill(mode, pick(mode));
  modeSel.addEventListener('change', async () => {
    const m = modeSel.value, t = pick(m);
    store('officeMode', m);
    fill(m, t);
    const ok = await busy(() => office.setMode(m, t));
    if (!ok && office.mode !== m) { modeSel.value = office.mode; fill(office.mode, office.theme); }
  });
  sel.addEventListener('change', async () => {
    const t = sel.value;
    store(KEY[office.mode], t);
    const ok = await busy(() => office.setTheme(t));
    if (!ok) sel.value = office.theme;
  });
  office = new Office($('office-canvas'), $('office'), now().dow === 1 ? 'formal' : 'kerja', pick(mode), mode);
  office.onSelect = (id) => select(id);
  window.office = office; // memudahkan debug dari console
  $('loading').textContent = 'Lagi ngegambar kantor…';
  await office.ready;
  modeSel.value = office.mode;
  fill(office.mode, office.theme);
  $('loading').remove();
  office.setCampaign(state?.campaign?.theme, state?.stats?.this_week?.pending ?? 0);
  tick('init');
} catch (err) {
  console.error(err);
  $('loading').textContent = 'Kantor gagal dimuat.';
}
