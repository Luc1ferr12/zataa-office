// Panel approval Owner di web (tab ✅ Approval). Server: scripts/web-api.mjs di watcher VPS, alamatnya dari data/api.json
// (Cloudflare tunnel, berubah kalau tunnel restart). Kunci = WEB_APPROVAL_TOKEN, disimpan di localStorage browser Owner saja.
// Keputusan masuk jalur yang sama dengan tombol Telegram, dan bot ikut ngabarin "🌐 Dari web: …".
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* storage diblokir */ } },
};
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
// tes lokal: ?api=http://127.0.0.1:8790 (cuma di localhost, biar link orang lain nggak bisa nyolong kunci ke server palsu)
if (LOCAL) { const q = new URLSearchParams(location.search).get('api'); if (q) store.set('ap-api', q); }

let base = null, data = null, loading = false;
const blobs = new Map();
const token = () => store.get('ap-token');
const SLOT = { pagi: '10:00', siang: '12:00', sore: '16:00', malam: '19:00', petang: '21:00', kilat: 'langsung' };
const DAY = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const dayLabel = (d) => (d ? `${DAY[new Date(`${d}T00:00:00Z`).getUTCDay()]} ${d.slice(8)}/${d.slice(5, 7)}` : '');
const status = (t) => { $('ap-status').textContent = t; };

async function apiBase() {
  if (LOCAL && store.get('ap-api')) return store.get('ap-api');
  const r = await fetch(`data/api.json?t=${Date.now()}`, { cache: 'no-store' }).catch(() => null);
  return r?.ok ? (await r.json()).url ?? null : null;
}
async function call(path, opt = {}) {
  const r = await fetch(`${base}${path}`, { ...opt, headers: { Authorization: `Bearer ${token()}`, ...(opt.body ? { 'Content-Type': 'application/json' } : {}) } });
  if (r.status === 401) { store.set('ap-token', null); throw Object.assign(new Error('Kunci salah, masukkan lagi.'), { auth: true }); }
  const j = r.headers.get('content-type')?.includes('json') ? await r.json() : null;
  if (!r.ok) throw new Error(j?.error ?? `server ${r.status}`);
  return j;
}

function badge(n) { const b = $('ap-badge'); b.hidden = !n; b.textContent = n; }

async function load() {
  if (loading) return;
  loading = true;
  try {
    base ??= await apiBase();
    $('ap-login').hidden = !!token();
    $('ap-foot').hidden = !token();
    if (!base) { $('ap-list').innerHTML = '<p class="muted">Server approval belum nyala (tunnel VPS belum jalan). Sementara pakai Telegram dulu ya Bos.</p>'; status(''); return; }
    if (!token()) { $('ap-list').innerHTML = ''; badge(0); status(''); return; }
    status('Memuat…');
    data = await call('/api/pending');
    render();
    status(`dicek ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`);
  } catch (e) {
    if (e.auth) { $('ap-login').hidden = false; $('ap-foot').hidden = true; $('ap-list').innerHTML = ''; }
    else base = null; // alamat tunnel mungkin berubah → ambil ulang api.json di percobaan berikutnya
    status(e.message === 'Failed to fetch' ? 'Server approval nggak kejangkau' : e.message);
  } finally { loading = false; }
}

function contentCard(c) {
  const media = c.media.map((m) => (m.kind === 'video'
    ? `<button class="ap-media vid" type="button" data-vid="${c.id}:${m.i}">▶ Putar video</button>`
    : `<img class="ap-media" alt="Preview #${c.id}" data-img="${c.id}:${m.i}">`)).join('');
  return `<article class="ap-item" data-id="${c.id}">
    <header><b>#${c.id}</b> <span class="ap-chip ch-${esc(c.channel || 'mkt')}">${esc(c.brand)}</span>
      <span class="muted">${esc(dayLabel(c.day))} · ${esc(c.slot ?? '')}${SLOT[c.slot] ? ` (${SLOT[c.slot]}${c.slot === 'kilat' ? '' : ' WIB'})` : ''} · ${esc(c.format ?? '')}${c.revisions ? ` · revisi ke-${c.revisions}` : ''}</span></header>
    <h3>${esc(c.title)}</h3>
    ${media ? `<div class="ap-gallery">${media}</div>` : ''}
    ${c.caption ? `<details><summary>${c.channel ? 'Deskripsi' : 'Caption'}</summary><p class="ap-text">${esc(c.caption)}${c.hashtags ? `\n\n${esc(c.hashtags)}` : ''}</p></details>` : ''}
    ${c.sources ? `<details><summary>Sumber</summary><p class="ap-text">${esc(c.sources)}</p></details>` : ''}
    <div class="ap-actions">
      <button class="ap-btn ok" data-act="approve">✅ Approve</button>
      <button class="ap-btn" data-act="revise-open">✏️ Revisi</button>
      <button class="ap-btn no" data-act="reject">❌ Tolak</button>
    </div>
    <div class="ap-rev" hidden><textarea rows="3" placeholder="Catatan revisi buat tim…" aria-label="Catatan revisi #${c.id}"></textarea><button class="ap-btn" data-act="revision">Kirim revisi</button></div>
    <p class="ap-msg" role="status"></p>
  </article>`;
}

function planCard(p) {
  const rows = p.items.map((r) => `<li><span class="muted">${esc(dayLabel(r.day))} · ${esc(r.slot)}</span> ${r.format === 'video' ? '🎬' : '🖼️'} ${esc(r.title)}</li>`).join('');
  return `<article class="ap-item" data-plan="${p.id}">
    <header><b>Plan C${p.id}</b> <span class="ap-chip ch-mkt">About Esports</span><span class="muted">minggu ${esc(p.week_start)}</span></header>
    <h3>${esc(p.theme)}</h3>${p.goals ? `<p class="muted">Target: ${esc(p.goals)}</p>` : ''}
    <ul class="ap-plan">${rows}</ul>
    <div class="ap-actions"><button class="ap-btn ok" data-act="plan_approve">✅ Approve plan</button><button class="ap-btn" data-act="revise-open">✏️ Revisi plan</button></div>
    <div class="ap-rev" hidden><textarea rows="3" placeholder="Catatan revisi plan…" aria-label="Catatan revisi plan"></textarea><button class="ap-btn" data-act="plan_revision">Kirim revisi</button></div>
    <p class="ap-msg" role="status"></p>
  </article>`;
}

function ideasCard(ideas) {
  return `<article class="ap-item" data-ideas="1">
    <header><b>Ide konten tambahan</b> <span class="ap-chip ch-mkt">About Esports</span><span class="muted">hari ini · pilihan Andre</span></header>
    ${ideas.map((x, i) => `<label class="ap-idea"><input type="checkbox" value="${x.id}" checked>
      <span><b>Ide ${i + 1}</b> · ${x.format === 'video' ? '🎬 video' : '🖼️ feed'}${SLOT[x.slot] ? ` · ${SLOT[x.slot]} WIB` : ''}<br><strong>${esc(x.title)}</strong><br><span class="muted">${esc(x.concept ?? '')}</span></span></label>`).join('')}
    <div class="ap-actions"><button class="ap-btn ok" data-act="idea_approve">✅ Approve yang dicentang</button><button class="ap-btn no" data-act="idea_skip">❌ Tolak semua</button></div>
    <p class="ap-msg" role="status"></p>
  </article>`;
}

function render() {
  const n = data.contents.length + (data.plan ? 1 : 0) + (data.ideas.length ? 1 : 0);
  badge(n);
  $('ap-list').innerHTML = n
    ? [data.plan ? planCard(data.plan) : '', data.ideas.length ? ideasCard(data.ideas) : '', ...data.contents.map(contentCard)].join('')
    : '<p class="muted">Nggak ada yang nunggu approval. Santai dulu, Bos ☕</p>';
  for (const img of $('ap-list').querySelectorAll('img[data-img]')) loadMedia(img.dataset.img).then((u) => { img.src = u; }).catch(() => img.remove());
}

// media lewat fetch + Authorization (img/video src biasa nggak bisa bawa header)
async function loadMedia(key) {
  if (!blobs.has(key)) {
    const [id, i] = key.split(':');
    blobs.set(key, fetch(`${base}/api/media?id=${id}&i=${i}`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.blob(); }).then((b) => URL.createObjectURL(b))
      .catch((e) => { blobs.delete(key); throw e; }));
  }
  return blobs.get(key);
}

async function decide(card, payload, okText) {
  const msg = card.querySelector('.ap-msg');
  const btns = card.querySelectorAll('button, textarea, input');
  btns.forEach((b) => { b.disabled = true; });
  msg.className = 'ap-msg'; msg.textContent = 'Mengirim…';
  try {
    const r = await call('/api/decide', { method: 'POST', body: JSON.stringify(payload) });
    msg.classList.add('ok'); msg.textContent = `${okText} ${r.text ? `· ${r.text.replace(/^🌐 Dari web: /, '').split('\n')[0]}` : ''}`;
    card.classList.add('done');
    badge(Math.max(0, (+$('ap-badge').textContent || 1) - 1));
  } catch (e) {
    msg.classList.add('err'); msg.textContent = e.message;
    btns.forEach((b) => { b.disabled = false; });
    if (e.auth) load();
  }
}

$('ap-list').addEventListener('click', async (ev) => {
  const vid = ev.target.closest('[data-vid]');
  if (vid) {
    vid.disabled = true; vid.textContent = 'Memuat video…';
    try { const v = document.createElement('video'); Object.assign(v, { controls: true, playsInline: true, className: 'ap-media', src: await loadMedia(vid.dataset.vid) }); vid.replaceWith(v); v.play().catch(() => {}); }
    catch { vid.disabled = false; vid.textContent = 'Gagal muat, coba lagi'; }
    return;
  }
  const b = ev.target.closest('[data-act]');
  if (!b) return;
  const card = b.closest('.ap-item'), act = b.dataset.act;
  if (act === 'revise-open') { const r = card.querySelector('.ap-rev'); r.hidden = !r.hidden; if (!r.hidden) r.querySelector('textarea').focus(); return; }
  const note = card.querySelector('.ap-rev textarea')?.value.trim() ?? '';
  if (card.dataset.id) {
    const id = +card.dataset.id;
    if (act === 'revision' && !note) return card.querySelector('textarea').focus();
    if (act === 'reject' && !confirm(`Tolak #${id}? Tim bakal bikin konten pengganti.`)) return;
    return decide(card, { kind: 'content', id, action: act, note }, { approve: '✅ Di-approve', reject: '❌ Ditolak', revision: '📝 Revisi terkirim' }[act]);
  }
  if (card.dataset.plan) {
    if (act === 'plan_revision' && !note) return card.querySelector('textarea').focus();
    return decide(card, { kind: 'plan', id: +card.dataset.plan, action: act, note }, act === 'plan_approve' ? '✅ Plan di-approve' : '📝 Revisi plan terkirim');
  }
  if (card.dataset.ideas) {
    const ids = [...card.querySelectorAll('input:checked')].map((x) => +x.value);
    if (act === 'idea_approve' && !ids.length) return;
    if (act === 'idea_skip' && !confirm('Tolak semua ide? Tim cari ide baru.')) return;
    return decide(card, { kind: 'ideas', action: act, ids }, act === 'idea_approve' ? `💡 ${ids.length} ide di-approve` : '🔄 Semua ide ditolak');
  }
});

$('ap-login').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const t = $('ap-token').value.trim();
  if (!t) return;
  store.set('ap-token', t);
  $('ap-token').value = '';
  load();
});
$('ap-refresh').addEventListener('click', load);
$('ap-logout').addEventListener('click', () => { store.set('ap-token', null); badge(0); load(); });

// cek tiap 60 dtk (cuma kalau tab browser kelihatan, dan Owner nggak lagi ngetik revisi / nonton video)
const busy = () => !!document.activeElement?.closest?.('.ap-item') || [...document.querySelectorAll('.ap-rev textarea')].some((t) => t.value.trim())
  || [...document.querySelectorAll('.ap-list video')].some((v) => !v.paused);
const auto = () => { if (!document.hidden && token() && !busy()) load(); };
load();
setInterval(auto, 60_000);
document.addEventListener('visibilitychange', auto);
