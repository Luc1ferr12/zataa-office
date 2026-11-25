// Tab 📶 Progress: posisi tiap konten per divisi, antrean render (urutan + perkiraan selesai), dan waiting list upload.
// Data = scripts/progress.mjs: live dari server VPS (GET /api/progress lewat tunnel, tiap 15 dtk), cadangan data/progress.json (tiap ±10 menit).
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const STEPS = [
  ['meeting', '🗣️', 'Meeting'], ['riset', '🔎', 'Riset'], ['naskah', '✍️', 'Copywriting'], ['editing', '🎨', 'Editing'],
  ['antre', '⏳', 'Antre render'], ['render', '🎬', 'Rendering'], ['approval', '👀', 'Approval'], ['tunggu', '🕒', 'Waiting list'],
  ['upload', '⏫', 'Uploading'], ['tayang', '📢', 'Uploaded'],
];
const STEP = Object.fromEntries(STEPS.map(([k, i, l], n) => [k, { i, l, n }]));
const DIV = {
  esports: { logo: 'about-esports-logo.png', color: 'mkt', name: 'About Esports', channel: '' },
  history: { logo: 'zaa-history-logo.png', color: 'yt', name: 'Zaa History', channel: 'youtube' },
  story: { logo: 'zataa-story-logo.png', color: 'story', name: 'Zaa Story', channel: 'story' },
  marvel: { logo: 'marvel-talk-logo.png', color: 'mv', name: 'Marvel Talk', channel: 'marvel' },
  cowo: { logo: 'cowo-bingung-logo.png', color: 'cb', name: 'Cowo Bingung', channel: 'cowo' },
};
const BY_CHANNEL = Object.fromEntries(Object.values(DIV).map((d) => [d.channel, d]));
const SUB = { suara: 'Bikin suara', persiapan: 'Siapin adegan', gambar: 'Render gambar', audio: 'Campur audio', encode: 'Encode akhir', kirim: 'Kirim ke kantor' };

const timeFmt = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Makassar', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' });
const hm = (t) => timeFmt.format(new Date(t));
const dur = (ms) => {
  const m = Math.max(1, Math.round(ms / 60000));
  return m < 60 ? `${m} mnt` : `${Math.floor(m / 60)} jam${m % 60 ? ` ${m % 60} mnt` : ''}`;
};
// jam + penanda hari kalau bukan hari ini
const when = (iso, today) => {
  const d = dayFmt.format(new Date(iso));
  return d === today ? hm(iso) : `${d.slice(8)}/${d.slice(5, 7)} ${hm(iso)}`;
};
const left = (iso) => { const ms = Date.parse(iso) - Date.now(); return ms > 0 ? `±${dur(ms)} lagi` : ''; };
const chip = (d) => `<span class="pg-chip" style="--cc:var(--c-${d?.color ?? 'gen'})">${esc(d?.name ?? '?')}</span>`;
const bar = (pct) => `<div class="pg-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>`;

// persen keseluruhan render = waktu terpakai dibanding perkiraan total
const pctOf = (q) => {
  const a = Date.parse(q.startAt), b = Date.parse(q.etaAt);
  return b > a ? Math.min(97, Math.max(3, Math.round(((Date.now() - a) / (b - a)) * 100))) : 3;
};
const etaText = (q, today) => {
  if (Date.parse(q.etaAt) < Date.now()) return 'lebih lama dari perkiraan, masih ditunggu';
  return `selesai ±${when(q.etaAt, today)} WITA · ${left(q.etaAt)}`;
};
const stepText = (q) => (q.step ? `${SUB[q.step] ?? q.step}${q.stepPct != null ? ` ${q.stepPct}%` : ''}` : 'Lagi dirender');

function queueCard(p) {
  const rows = p.queue.map((q) => {
    const d = BY_CHANNEL[q.channel];
    const head = `<div class="pg-q-main"><p>${chip(d)} <small>#${q.id}</small></p><b>${esc(q.title)}</b>`;
    if (q.state === 'render') {
      return `<li class="now"><span class="pg-pos" title="Lagi dirender">▶</span>${head}
        ${bar(pctOf(q))}<small>${esc(stepText(q))} · ${etaText(q, p.today)}${q.live ? '' : ' (taksiran)'}</small></div></li>`;
    }
    if (q.state === 'gagal') return `<li class="bad"><span class="pg-pos">!</span>${head}<small>Render gagal, nunggu dibenerin tim</small></div></li>`;
    return `<li><span class="pg-pos">${q.pos}</span>${head}
      <small>mulai ±${when(q.startAt, p.today)} · selesai ±${when(q.etaAt, p.today)} · lama ±${q.estMin} mnt${q.waitingWindow ? ' · nunggu jam render' : ''}</small></div></li>`;
  }).join('');
  const ok = p.queue.filter((q) => q.state !== 'gagal');
  const end = ok.at(-1)?.etaAt;
  const seen = p.laptop.at ? Date.now() - Date.parse(p.laptop.at) : null;
  // laptop lapor tiap 10 menit (tiap 20 dtk selama render)
  const lap = seen == null ? '💻 Laptop belum kirim laporan, jam di bawah taksiran'
    : seen < 15 * 60000 ? `💻 Laptop nyala · lapor ${seen < 60000 ? 'barusan' : `${dur(seen)} lalu`}`
      : `⚠️ Laptop nggak lapor sejak ${when(p.laptop.at, p.today)} (mati / offline?)`;
  return `<div class="card pg-queue">
    <div class="card-head"><h2>Antrean render</h2><span class="muted">${ok.length ? `${ok.length} video · kelar semua ±${when(end, p.today)} WITA` : 'kosong'}</span></div>
    <p class="muted pg-laptop">${lap} · render mulai ≥${esc(p.laptop.renderFrom)} WITA</p>
    ${rows ? `<ol class="pg-q">${rows}</ol>` : '<p class="muted">Nggak ada video yang antre render.</p>'}
  </div>`;
}

function waitCard(p) {
  const list = p.divisions.flatMap((v) => v.items.filter((i) => i.stage === 'tunggu' || i.stage === 'approval' && !i.rejected).map((i) => ({ ...i, div: DIV[v.key] })))
    .sort((a, b) => (a.stage === b.stage ? String(a.airAt).localeCompare(String(b.airAt)) : a.stage === 'tunggu' ? -1 : 1));
  const rows = list.map((i) => `<li class="${i.stage}">
      <span class="pg-time">${i.stage === 'tunggu' && i.airAt ? hm(i.airAt) : '✋'}</span>
      <div class="pg-q-main"><p>${chip(i.div)} <small>#${i.id}</small></p><b>${esc(i.title)}</b>
      <small>${i.stage === 'tunggu' ? `upload ${when(i.airAt, p.today)} WITA · ${left(i.airAt)}` : `<a href="#approval">Nunggu ✅ Bos, buka Approval</a>`}</small></div></li>`).join('');
  return `<div class="card pg-wait">
    <div class="card-head"><h2>Waiting list upload</h2><span class="muted">${list.length ? `${list.length} konten` : 'kosong'}</span></div>
    ${rows ? `<ol class="pg-q">${rows}</ol>` : '<p class="muted">Belum ada yang nunggu jam upload atau ✅.</p>'}
  </div>`;
}

function stepper(it) {
  const at = STEP[it.stage]?.n ?? 0;
  return `<ol class="pg-steps">${STEPS.map(([k, icon, label], n) => {
    const cls = it.done ? 'done' : n < at ? 'done' : n === at ? (it.bad ? 'bad' : 'now') : '';
    return `<li class="${cls}" title="${label}"${n === at ? ' aria-current="step"' : ''}><i>${n === at && it.bad ? '⚠️' : icon}</i><span>${label}</span></li>`;
  }).join('')}</ol>`;
}

function detail(it, p) {
  const q = it.render;
  const air = it.airAt ? `target tayang ${when(it.airAt, p.today)} WITA` : 'tayang begitu lolos';
  const late = q && it.airAt && Date.parse(q.etaAt) > Date.parse(it.airAt) ? ' · <em>bisa telat dari jam tayang</em>' : '';
  const note = it.note ? `${esc(it.note)} · ` : '';
  if (it.stage === 'render' && !it.bad && q) return `${bar(pctOf(q))}<p>${note}${esc(stepText(q))} · ${etaText(q, p.today)}${late}</p>`;
  if (it.stage === 'antre' && q) return `<p>${note}Urutan ke-${q.pos} · mulai ±${when(q.startAt, p.today)} · selesai ±${when(q.etaAt, p.today)} WITA${late}</p>`;
  if (it.stage === 'approval' && !it.rejected) return `<p><a href="#approval">${esc(it.note)}, buka Approval</a> · ${air}</p>`;
  if (it.stage === 'tunggu') return `<p>${note}upload ${when(it.airAt, p.today)} WITA · ${left(it.airAt)}</p>`;
  if (it.stage === 'tayang') {
    const link = it.links?.youtube ? ` · <a href="${esc(it.links.youtube)}" target="_blank" rel="noopener">YouTube ↗</a>` : '';
    return `<p>${note}Tayang${it.doneAt ? ` ${when(it.doneAt, p.today)} WITA` : ''}${link}${it.tiktok ? ' · TikTok ✓' : ''}</p>`;
  }
  return `<p>${note}${it.waitOwner ? '<a href="#approval">buka Approval</a>' : air}</p>`;
}

function divisionCard(v, p) {
  const meta = DIV[v.key];
  let items = v.items;
  // belum ada konten hari ini tapi pegawainya lagi kerja → tampilkan posisi persiapannya
  if (!items.some((i) => i.day === p.today) && v.working) {
    items = [...items, { day: p.today, title: v.working.task || 'Lagi nyiapin konten', stage: v.working.stage, note: `${v.working.name} lagi kerja`, prep: true }];
  }
  const live = items.filter((i) => !i.done && !i.rejected);
  const bad = live.some((i) => i.bad);
  const top = [...live].sort((a, b) => STEP[b.stage].n - STEP[a.stage].n)[0];
  const sum = bad ? '⚠️ Ada yang gagal'
    : top ? `${STEP[top.stage].i} ${top.waitOwner ? 'Nunggu ✅ ide' : STEP[top.stage].l}${live.length > 1 ? ` +${live.length - 1}` : ''}`
      : items.some((i) => i.done) ? '✅ Beres hari ini' : '💤 Belum mulai';
  const list = items.map((it) => `<li class="pg-item ${it.bad ? 'bad' : ''} ${it.done ? 'done' : ''}">
      <div class="pg-item-head"><b>${esc(it.title)}</b>
        <span class="pg-badge ${it.bad ? 'bad' : it.done ? 'done' : ''}">${it.rejected ? '❌ Ditolak' : it.bad ? '⚠️ Gagal' : `${STEP[it.stage].i} ${STEP[it.stage].l}`}</span></div>
      <p class="pg-meta">${it.id ? `#${it.id}` : it.idea ? `ide #${it.idea}` : 'persiapan'}${it.day !== p.today ? ` · jadwal ${it.day.slice(8)}/${it.day.slice(5, 7)}` : ''}${it.revisions ? ` · revisi ke-${it.revisions}` : ''}</p>
      ${it.rejected ? '' : stepper(it)}<div class="pg-detail">${detail(it, p)}</div></li>`).join('');
  return `<article class="card pg-div" style="--acc:var(--c-${meta.color})">
    <div class="card-head"><h2><img src="assets/${meta.logo}" alt="" width="26" height="26">${esc(v.name)}</h2><span class="pg-sum ${bad ? 'bad' : ''}">${esc(sum)}</span></div>
    ${v.working ? `<p class="pg-working">💻 <b>${esc(v.working.name)}</b> ${esc(v.working.task ?? '')}</p>` : ''}
    ${list ? `<ul class="pg-items">${list}</ul>` : `<p class="muted">Belum ada konten. Sesi berikutnya ${esc(v.nextSession)} WITA.</p>`}
    ${list && v.key === 'esports' ? `<p class="muted pg-next">Sesi riset berikutnya ${esc(v.nextSession)} WITA</p>` : ''}
  </article>`;
}

function render(p) {
  const all = p.divisions.flatMap((v) => v.items);
  const n = (f) => all.filter(f).length;
  const tiles = [
    ['✍️ Disiapin', n((i) => ['meeting', 'riset', 'naskah', 'editing'].includes(i.stage))],
    ['⏳ Antre render', n((i) => i.stage === 'antre')],
    ['🎬 Rendering', n((i) => i.stage === 'render' && !i.bad)],
    ['👀 Nunggu ✅', n((i) => (i.stage === 'approval' && !i.rejected) || i.waitOwner)],
    ['🕒 Waiting list', n((i) => i.stage === 'tunggu' || (i.stage === 'upload' && !i.bad))],
    ['📢 Uploaded', n((i) => i.done)],
    ['⚠️ Gagal', n((i) => i.bad && !i.rejected)],
  ];
  $('pg-tiles').innerHTML = tiles.map(([k, v]) => `<div class="${v ? '' : 'zero'}${k.startsWith('⚠️') && v ? ' bad' : ''}"><b>${v}</b><span>${k}</span></div>`).join('');
  $('pg-top').innerHTML = queueCard(p) + waitCard(p);
  $('pg-divs').innerHTML = p.divisions.filter((v) => DIV[v.key]).map((v) => divisionCard(v, p)).join('')
    + `<article class="card pg-div off" style="--acc:var(--c-clip)"><div class="card-head"><h2><img src="assets/zaa-clips-logo.png" alt="" width="26" height="26">Zaa Clips</h2><span class="pg-sum">💤 Libur</span></div><p class="muted">Libur sejak 20 Nov 2026, nunggu perintah Bos.</p></article>`;
}

// ---------- ambil data
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
let base = null, data = null, lastTry = 0, busy = false;
// jeda coba live, disimpan biar reload berkali-kali nggak nambah hitungan gagal di server
const OFF = 'pg-live-off';
const liveOff = () => { try { return +localStorage.getItem(OFF) || 0; } catch { return 0; } };
const setLiveOff = (ms) => { try { localStorage.setItem(OFF, String(Date.now() + ms)); } catch { /* storage diblokir */ } };
let offMem = 0;
const getJson = async (url, ms) => {
  const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw Object.assign(new Error(`server ${r.status}`), { status: r.status });
  return r.json();
};
async function fetchLive() {
  if (Date.now() < Math.max(offMem, liveOff())) return null;
  try {
    let local = null;
    try { local = LOCAL ? localStorage.getItem('ap-api') : null; } catch { /* storage diblokir */ }
    base ??= local || (await getJson(`data/api.json?t=${Date.now()}`, 5000)).url;
    return base ? await getJson(`${base}/api/progress`, 6000) : null;
  } catch (e) {
    // server menolak (versi lama minta kunci) → jangan diulang-ulang, nanti IP Owner kena blok approval
    if (e.status) { offMem = Date.now() + 10 * 60_000; setLiveOff(10 * 60_000); }
    else { base = null; offMem = Date.now() + 60_000; }
    return null;
  }
}
async function load() {
  if (busy) return;
  busy = true; lastTry = Date.now();
  try {
    let p = await fetchLive();
    const live = !!p;
    p ??= await getJson(`data/progress.json?t=${Date.now()}`, 8000);
    data = p;
    render(p);
    const age = Date.now() - Date.parse(p.at);
    $('pg-status').className = `pg-status ${live ? 'live' : age > 25 * 60000 ? 'stale' : ''}`;
    $('pg-status').textContent = live ? `Live · ${hm(p.at)} WITA` : `Data ${when(p.at, dayFmt.format(new Date()))} WITA · diperbarui tiap ±10 mnt`;
  } catch {
    if (!data) $('pg-divs').innerHTML = '<p class="muted">Data progres belum tersedia. Kantor ngirim otomatis tiap ±10 menit.</p>';
    $('pg-status').className = 'pg-status stale';
    $('pg-status').textContent = 'Gagal ambil data, dicoba lagi';
  } finally { busy = false; }
}
// cuma narik data selama tab-nya kebuka
const visible = () => !document.hidden && !$('pg-panel').hidden;
setInterval(() => { if (visible() && Date.now() - lastTry >= 15_000) load(); }, 1000);
new MutationObserver(() => { if (visible()) load(); }).observe($('pg-panel'), { attributes: true, attributeFilter: ['hidden'] });
if (visible()) load();
