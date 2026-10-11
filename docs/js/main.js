import { AGENTS, wita, activityAt, describe, officeStatus } from './schedule.js';

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

  office?.setCampaign(s?.campaign?.theme, st.pending ?? 0);
  tick(true);
}

const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const fmtTs = (ts) => new Date(ts.replace(' ', 'T') + 'Z').toLocaleString('id-ID', { timeZone: 'Asia/Makassar', weekday: 'short', hour: '2-digit', minute: '2-digit' });

const realOf = (id) => state?.agents?.find((a) => a.id === id);

function tick(force = false) {
  const t = now();
  $('clock-day').textContent = t.dayName;
  $('clock-time').textContent = `${t.hh}:${t.mm}`;
  const os = officeStatus(t);
  const pill = $('office-status');
  pill.textContent = os.label;
  pill.className = `pill ${os.tone}`;

  // pertama kali: taruh langsung. Waktu simulasi lompat jauh: jalan cepat (tidak pernah teleport)
  const key = t.dow * 1440 + t.minutes;
  const mode = force === 'init' ? 'init' : lastSim !== null && Math.abs(key - lastSim) > 3 ? 'rush' : 'walk';
  lastSim = key;

  office?.setTime(t.minutes, t.dow);
  if (office?.chars.size) office.setOutfitForDay(t.dow);
  const list = AGENTS.map((a, idx) => {
    const real = realOf(a.id);
    const info = describe(a, activityAt(idx, a, t, real), real);
    office?.setActivity(a.id, info, mode);
    return { a, info };
  });

  $('team-list').innerHTML = list.map(({ a, info }) => `
    <li class="member ${selected === a.id ? 'active' : ''}" data-id="${a.id}">
      <div class="avatar" style="background:${a.avatar}">${a.name[0]}</div>
      <div class="who"><strong>${a.name} <span style="display:inline;color:var(--muted);font-weight:400">· ${a.title}</span></strong><span>${info.emoji} ${esc(info.label)}</span></div>
      <div class="emoji" title="${esc(info.mood?.label ?? '')}">${info.mood?.emoji ?? ''}</div>
    </li>`).join('');
  if (selected) renderInspector(selected, list.find((l) => l.a.id === selected)?.info);
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
$('upper-toggle').addEventListener('change', (e) => office?.toggleUpper(e.target.checked));
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
  $('loading').textContent = 'Lagi ngegambar kantor pixel…';
  await office.ready;
  $('loading').remove();
  office.setCampaign(state?.campaign?.theme, state?.stats?.this_week?.pending ?? 0);
  tick('init');
} catch (err) {
  console.error(err);
  $('loading').textContent = 'Kantor gagal dimuat.';
}
