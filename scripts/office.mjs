#!/usr/bin/env node
// CLI kantor: dipakai Claude tiap sesi kerja supaya baca/tulis DB dengan output sekecil mungkin (hemat token).
// Contoh:
//   node scripts/office.mjs init
//   node scripts/office.mjs brief researcher
//   node scripts/office.mjs agent designer working "Feed promo Diamond ML"
//   node scripts/office.mjs log designer "Render feed #12 selesai"
//   node scripts/office.mjs export
process.removeAllListeners('warning'); // sembunyikan ExperimentalWarning node:sqlite
const { DatabaseSync } = await import('node:sqlite');
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAT_SQL, chat as chatTo, handoff } from './chatter.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DB_PATH = join(ROOT, 'db', 'office.db');
const STATE_PATH = join(ROOT, 'docs', 'data', 'state.json');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON');
db.exec(CHAT_SQL);
// Okt 2026: Andre gantiin Aprista jadi Marketing Director (id dir), Aprista jadi sekretaris pribadi Bos (id sec)
try {
  db.exec("UPDATE agents SET name = 'Andre' WHERE id = 'dir' AND name = 'Aprista'");
  db.exec("INSERT OR IGNORE INTO agents (id, name, title) VALUES ('sec', 'Aprista', 'Sekretaris Pribadi')");
  // Okt 2026: divisi YouTube Shorts (sejarah misteri kuno)
  db.exec(`INSERT OR IGNORE INTO agents (id, name, title) VALUES ('ydir', 'Bagas', 'Manajer YouTube'), ('yresearch', 'Nadhira', 'Riset Sejarah & Tren'),
    ('yscript', 'Laras', 'Scriptwriter & Fact Checker'), ('yvisual', 'Galih', 'Visual & Creative'), ('yvideo', 'Yoga', 'Video Producer'), ('ypublish', 'Kirana', 'Publisher, SEO & Growth')`);
} catch { /* db belum init */ }
// YouTube Shorts disimpan di contents juga: channel 'youtube' (kosong = Marketing IG/TikTok), youtube_id = id video (scripts/shorts-bot.mjs)
for (const col of ['channel TEXT', 'youtube_id TEXT']) { try { db.exec(`ALTER TABLE contents ADD COLUMN ${col}`); } catch { /* sudah ada / db belum init */ } }
// plan mingguan perlu ✅ Owner; campaign lama dianggap sudah approved
try { db.exec("ALTER TABLE campaigns ADD COLUMN status TEXT DEFAULT 'approved'"); } catch { /* sudah ada */ }
// ide konten tambahan dari briefing pagi: Andre pilih 3 (2 feed + 1 video) per ronde; Owner ❌ semua → ronde baru
db.exec(`CREATE TABLE IF NOT EXISTS ideas (id INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT NOT NULL, agent_id TEXT NOT NULL,
  title TEXT NOT NULL, concept TEXT, game TEXT, pillar TEXT, chosen INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pitched', content_id INTEGER, created_at TEXT DEFAULT (datetime('now')))`); // pitched | proposed | approved | skipped | made
for (const col of ["format TEXT DEFAULT 'feed'", 'slot TEXT']) { try { db.exec(`ALTER TABLE ideas ADD COLUMN ${col}`); } catch { /* sudah ada */ } }
db.exec(`CREATE TABLE IF NOT EXISTS followups (id INTEGER PRIMARY KEY AUTOINCREMENT, note TEXT NOT NULL, due_at TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`);

// Tanggal hari ini versi WITA, zona jam kantor (YYYY-MM-DD)
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' }).format(new Date());
const mondayOf = (d) => {
  const dt = new Date(d + 'T00:00:00Z');
  const diff = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - diff);
  return dt.toISOString().slice(0, 10);
};
const addDays = (d, n) => {
  const dt = new Date(d + 'T00:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
};
const all = (sql, ...p) => db.prepare(sql).all(...p);
const get = (sql, ...p) => db.prepare(sql).get(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);
const out = (o) => console.log(typeof o === 'string' ? o : JSON.stringify(o));
const log = (agent, msg) => run('INSERT INTO activity (agent_id, message) VALUES (?, ?)', agent, msg);

const [cmd, ...args] = process.argv.slice(2);

const commands = {
  init() {
    db.exec(readFileSync(join(ROOT, 'db', 'schema.sql'), 'utf8'));
    out('ok: db siap di db/office.db');
  },

  // Konteks ringkas untuk satu pegawai — satu-satunya yang perlu dibaca Claude sebelum kerja
  brief(agent) {
    const t = today();
    // plan lengkap cuma untuk Director; pegawai lain cukup tema (hemat token)
    const cols = agent === 'dir' ? 'id, week_start, theme, goals, plan_json' : 'theme, goals';
    const camp = get(`SELECT ${cols} FROM campaigns WHERE week_start = ?`, mondayOf(t));
    const mem = all('SELECT note FROM memories WHERE agent_id = ? ORDER BY id DESC LIMIT 6', agent).map((r) => r.note);
    const tasks = all("SELECT id, type, title, status, content_id FROM tasks WHERE agent_id = ? AND day = ? AND status != 'done'", agent, t);
    const revisions = all("SELECT id, title, owner_note FROM contents WHERE status = 'revision' AND channel IS NOT 'youtube' ORDER BY id");
    const brief = { today: t, campaign: camp ?? null, memory: mem, tasks };
    if (revisions.length) brief.revisions = revisions;
    if (agent === 'researcher' || agent === 'dir') {
      brief.recent_topics = all('SELECT topic FROM research WHERE day >= ? ORDER BY id DESC LIMIT 15', addDays(t, -14)).map((r) => r.topic);
    }
    if (agent === 'dir') {
      brief.last_week = weekStats(addDays(mondayOf(t), -7));
    }
    out(brief);
  },

  agent(id, status, ...task) {
    const t = task.join(' ') || null;
    const prev = get('SELECT status FROM agents WHERE id = ?', id);
    run("UPDATE agents SET status = ?, current_task = ?, updated_at = datetime('now') WHERE id = ?", status, t, id);
    // kelar → otomatis oper ke pegawai berikutnya di panel chit-chat
    if (status === 'done' && prev?.status === 'working' && t) handoff(db, id, t);
    out('ok');
  },

  // idea add <file.json> [{agent, title, concept, format, game, pillar}] | idea pick <id1> <id2> <id3> | idea list [day]
  idea(sub, a, b, c) {
    if (sub === 'add') {
      const items = JSON.parse(existsSync(a) ? readFileSync(a, 'utf8') : a);
      const ids = items.map((i) => Number(run('INSERT INTO ideas (day, agent_id, title, concept, format, game, pillar) VALUES (?, ?, ?, ?, ?, ?, ?)',
        today(), i.agent, i.title, i.concept ?? null, i.format === 'video' ? 'video' : 'feed', i.game ?? null, i.pillar ?? null).lastInsertRowid));
      return out({ ok: true, ids });
    }
    if (sub === 'pick') { // wajib 3 ide ronde ini: 2 feed + 1 video
      const ids = [a, b, c].filter(Boolean).map(Number);
      const rows = ids.map((id) => get("SELECT id, format, status FROM ideas WHERE id = ?", id));
      if (rows.some((r) => !r || r.status !== 'pitched')) return out({ ok: false, error: 'ide nggak ada / bukan dari ronde ini (status harus pitched)' });
      const v = rows.filter((r) => r.format === 'video').length;
      if (ids.length !== 3 || v !== 1) return out({ ok: false, error: `pilih 3 ide: 2 feed + 1 video (sekarang ${ids.length} ide, ${v} video)` });
      for (const id of ids) run('UPDATE ideas SET chosen = 1 WHERE id = ?', id);
      log('dir', 'Pilih 3 ide terbaik dari briefing (2 feed + 1 video)');
      return out('ok');
    }
    if (sub === 'list') return out(all('SELECT id, agent_id, format, title, concept, chosen, status, content_id FROM ideas WHERE day = ? ORDER BY id', a ?? today()));
    if (sub === 'done') { run("UPDATE ideas SET status = 'made', content_id = ? WHERE id = ?", b, a); return out('ok'); }
    out('pakai: idea add <file.json> | pick <id1> <id2> <id3> (2 feed + 1 video) | list [day] | done <idea_id> <content_id>');
  },

  // followup <menit> "<apa yang dicek>" — minta watcher membangunkan Claude lagi nanti (mis. pantau skor pertandingan)
  followup(minutes, ...note) {
    const m = Math.max(15, Math.min(240, +minutes || 30));
    run("INSERT INTO followups (note, due_at) VALUES (?, datetime('now', ?))", note.join(' '), `+${m} minutes`);
    out(`ok: dicek lagi ${m} menit lagi`);
  },

  // chat <dari> <ke|all> <oper|santai|curhat> "<pesan>"  — obrolan antar pegawai (panel Chit-chat)
  chat(from, to, kind, ...msg) {
    chatTo(db, from, to === 'all' ? null : to, msg.join(' '), kind);
    out('ok');
  },

  log(agent, ...msg) {
    log(agent, msg.join(' '));
    out('ok');
  },

  memory(agent, ...note) {
    // memory <agent> "<catatan>"  — simpan pelajaran penting, pendek
    run('INSERT INTO memories (agent_id, note) VALUES (?, ?)', agent, note.join(' '));
    // simpan maksimal 30 catatan per pegawai
    run('DELETE FROM memories WHERE agent_id = ? AND id NOT IN (SELECT id FROM memories WHERE agent_id = ? ORDER BY id DESC LIMIT 30)', agent, agent);
    out('ok');
  },

  // campaign <file.json>  {theme, goals, plan:[{day, slot, format, game, pillar, title}]}
  campaign(file) {
    const c = JSON.parse(readFileSync(file, 'utf8'));
    const week = c.week_start ?? mondayOf(today());
    run(`INSERT INTO campaigns (week_start, theme, goals, plan_json) VALUES (?, ?, ?, ?)
         ON CONFLICT(week_start) DO UPDATE SET theme = excluded.theme, goals = excluded.goals, plan_json = excluded.plan_json`,
      week, c.theme, c.goals ?? null, JSON.stringify(c.plan ?? []));
    const { id } = get('SELECT id FROM campaigns WHERE week_start = ?', week);
    // plan baru / revisi plan: buang slot lama yang belum dikerjakan, status balik draft (nunggu ✅ Owner)
    const stale = all("SELECT id FROM contents WHERE campaign_id = ? AND status = 'draft' AND data_json IS NULL", id).map((r) => r.id);
    for (const cid of stale) { run('DELETE FROM tasks WHERE content_id = ?', cid); run('DELETE FROM contents WHERE id = ?', cid); }
    run("UPDATE campaigns SET status = 'draft' WHERE id = ?", id);
    for (const p of c.plan ?? []) {
      const r = run('INSERT INTO contents (campaign_id, day, slot, format, game, pillar, title) VALUES (?, ?, ?, ?, ?, ?, ?)',
        id, p.day, p.slot, p.format, p.game ?? null, p.pillar ?? null, p.title);
      const cid = Number(r.lastInsertRowid);
      const steps = p.format === 'video' ? ['copywriter', 'video', 'publisher'] : ['copywriter', 'designer', 'publisher'];
      const typeOf = { copywriter: 'copy', designer: 'design', video: 'video', publisher: 'publish' };
      for (const a of steps) run('INSERT INTO tasks (campaign_id, agent_id, day, type, title, content_id) VALUES (?, ?, ?, ?, ?, ?)', id, a, p.day, typeOf[a], p.title, cid);
    }
    log('dir', `Plan minggu ${week} dibuat: ${c.theme} (${(c.plan ?? []).length} konten)`);
    out({ ok: true, campaign_id: id, contents: (c.plan ?? []).length });
  },

  // research <file.json>  [{game, topic, summary, source_url, score}]
  research(file) {
    const items = JSON.parse(readFileSync(file, 'utf8'));
    for (const i of items) run('INSERT INTO research (day, game, topic, summary, source_url, score) VALUES (?, ?, ?, ?, ?, ?)',
      today(), i.game ?? null, i.topic, i.summary ?? null, i.source_url ?? null, i.score ?? 0);
    log('researcher', `Nemu ${items.length} topik baru`);
    out({ ok: true, added: items.length });
  },

  // content get <id> | content set <id> <json-string-or-file> | content list [day]
  content(sub, id, payload) {
    if (sub === 'get') return out(get('SELECT * FROM contents WHERE id = ?', id));
    // Shorts (channel youtube) tidak ikut: pakai scripts/shorts-bot.mjs list
    if (sub === 'list') return out(all("SELECT id, slot, format, game, pillar, title, status FROM contents WHERE day = ? AND channel IS NOT 'youtube' ORDER BY id", id ?? today()));
    // content new '{"format":"feed","game":"mlbb","pillar":"promo","title":"..."}' → konten dadakan (permintaan Owner), slot "kilat" = tayang begitu di-approve
    if (sub === 'new') {
      const p = existsSync(id) ? JSON.parse(readFileSync(id, 'utf8')) : JSON.parse(id);
      const r = run('INSERT INTO contents (day, slot, format, game, pillar, title) VALUES (?, ?, ?, ?, ?, ?)',
        p.day ?? today(), p.slot ?? 'kilat', p.format ?? 'feed', p.game ?? null, p.pillar ?? null, p.title);
      return out({ ok: true, id: Number(r.lastInsertRowid) });
    }
    if (sub === 'set') {
      const data = existsSync(payload) ? JSON.parse(readFileSync(payload, 'utf8')) : JSON.parse(payload);
      const allowed = ['title', 'data_json', 'caption', 'hashtags', 'cta', 'link', 'template', 'asset_path', 'asset_url', 'status',
        'owner_note', 'scheduled_at', 'posted_at', 'ig_media_id', 'tiktok_id', 'sources', 'game', 'pillar', 'slot', 'format'];
      for (const [k, v] of Object.entries(data)) {
        if (!allowed.includes(k)) continue;
        run(`UPDATE contents SET ${k} = ?, updated_at = datetime('now') WHERE id = ?`, typeof v === 'object' && v !== null ? JSON.stringify(v) : v, id);
      }
      return out('ok');
    }
    out('pakai: content get|set|list|new');
  },

  // task done <id> | task list [agent]
  task(sub, a) {
    if (sub === 'done') { run("UPDATE tasks SET status = 'done', updated_at = datetime('now') WHERE id = ?", a); return out('ok'); }
    if (sub === 'doing') { run("UPDATE tasks SET status = 'doing', updated_at = datetime('now') WHERE id = ?", a); return out('ok'); }
    if (sub === 'list') return out(all("SELECT id, agent_id, type, title, status, content_id FROM tasks WHERE day = ? AND (? IS NULL OR agent_id = ?) ORDER BY id", today(), a ?? null, a ?? null));
    out('pakai: task done|doing|list');
  },

  // metric <content_id> <platform> views likes comments shares saves
  metric(cid, platform, views = 0, likes = 0, comments = 0, shares = 0, saves = 0) {
    run('INSERT INTO metrics (content_id, platform, views, likes, comments, shares, saves) VALUES (?, ?, ?, ?, ?, ?, ?)',
      cid, platform, +views, +likes, +comments, +shares, +saves);
    out('ok');
  },

  stats(week) { out(weekStats(week ?? mondayOf(today()))); },

  export() {
    const t = today();
    const week = mondayOf(t);
    const camp = get('SELECT week_start, theme, goals, status FROM campaigns WHERE week_start = ?', week);
    const state = {
      generated_at: new Date().toISOString(),
      today: t,
      week_start: week,
      campaign: camp ?? null,
      agents: all('SELECT id, name, title, status, current_task, updated_at FROM agents'),
      week_contents: all(`SELECT id, day, slot, format, game, pillar, title, status, asset_url, scheduled_at, posted_at, channel
                          FROM contents WHERE day BETWEEN ? AND ? ORDER BY day, CASE slot WHEN 'pagi' THEN 0 WHEN 'siang' THEN 1 WHEN 'kilat' THEN 2 WHEN 'sore' THEN 3 WHEN 'malam' THEN 4 ELSE 5 END`, week, addDays(week, 6)),
      today_tasks: all('SELECT agent_id, type, title, status FROM tasks WHERE day = ? ORDER BY id', t),
      activity: all('SELECT ts, agent_id, message FROM activity ORDER BY id DESC LIMIT 25'),
      chats: all('SELECT ts, agent_id, to_id, kind, message FROM chats ORDER BY id DESC LIMIT 40'),
      stats: { this_week: weekStats(week), last_week: weekStats(addDays(week, -7)) },
      trading: tradingState(),
    };
    mkdirSync(dirname(STATE_PATH), { recursive: true });
    writeFileSync(STATE_PATH, JSON.stringify(state, null, 1));
    out('ok: docs/data/state.json');
  },
};

// ringkasan tim Trading XAUUSD untuk dashboard (tabel trd_* dibuat scripts/trading/store.mjs)
function tradingState() {
  try {
    const kv = (k, d) => { const r = get('SELECT value FROM trd_kv WHERE key = ?', k); try { return r ? JSON.parse(r.value) : d; } catch { return d; } };
    const mode = kv('mode', 'paper');
    const day = new Date().toISOString().slice(0, 10);
    const P = { riskPct: 1, maxRr: 2, safeRiskMul: 0.5, dailyLossPct: 3, maxConsecLoss: 3, asiaUTC: [0, 7], offUTC: [20, 24], newsBlackoutMin: 45, newsBeforeMin: 60, newsMajorBeforeMin: 120, newsMajorAfterMin: 90, newsMediumMin: 20, ...kv('params', {}) };
    // jendela larangan entry per berita, menit [sebelum, sesudah] (sama dengan scripts/trading/research.mjs → newsWindow)
    const newsWin = (e) => (e.impact === 'High' && /CPI|Non-Farm|NFP|FOMC|Federal Funds|Fed Chair|Powell/i.test(e.title) ? [P.newsMajorBeforeMin, P.newsMajorAfterMin]
      : e.impact === 'High' ? [P.newsBeforeMin, P.newsBlackoutMin] : [P.newsMediumMin, P.newsMediumMin]);
    const balance = mode === 'paper' ? kv('paper', { balance: 10000 }).balance : kv('ea', {})?.equity ?? null;
    const closed = all("SELECT pnl, r, close_ts FROM trd_trades WHERE status = 'closed' AND mode = ? ORDER BY id", mode);
    const todayRows = closed.filter((x) => (x.close_ts ?? '').slice(0, 10) === day);
    let consecLoss = 0;
    for (const x of todayRows) consecLoss = x.pnl < 0 ? consecLoss + 1 : 0;
    const win = closed.filter((x) => x.pnl > 0), loss = closed.filter((x) => x.pnl < 0);
    const sum = (rows) => +rows.reduce((t, x) => t + (x.pnl ?? 0), 0).toFixed(2);
    const weekAgo = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
    const start = (balance ?? 0) - sum(closed);
    let run = start;
    const curve = [start, ...closed.slice(-60).map((x) => (run += x.pnl ?? 0))];
    const last = get('SELECT ts, decision, side, entry, sl, tp, lot, rr, risk_usd, reason, fund, tech FROM trd_signals ORDER BY id DESC LIMIT 1');
    const json = (v) => { try { return JSON.parse(v); } catch { return null; } };
    const fund = kv('fund', null);
    const ea = kv('ea', {});
    return {
      mode, paused: kv('paused', false), balance,
      today_pnl: sum(todayRows),
      price: get("SELECT c FROM trd_bars WHERE tf = 'M15' ORDER BY t DESC LIMIT 1")?.c ?? null,
      open: all("SELECT side, lot, entry, sl, tp, open_ts FROM trd_trades WHERE status = 'open' AND mode = ?", mode),
      signals: all('SELECT ts, decision, reason FROM trd_signals ORDER BY id DESC LIMIT 6'),
      trades: all("SELECT side, lot, entry, exit, pnl, r, close_ts, reason_close FROM trd_trades WHERE status = 'closed' AND mode = ? ORDER BY id DESC LIMIT 6", mode),
      stats: {
        n: closed.length, wins: win.length, losses: loss.length,
        pnl: sum(closed), week_pnl: sum(closed.filter((x) => (x.close_ts ?? '') >= weekAgo)),
        gross_win: sum(win), gross_loss: sum(loss),
        max_loss: loss.length ? Math.min(...loss.map((x) => x.pnl)) : 0,
        avg_r: closed.length ? +(closed.reduce((t, x) => t + (x.r ?? 0), 0) / closed.length).toFixed(2) : 0,
        today_n: todayRows.length, consec_loss: consecLoss,
      },
      peak: Math.max(kv('peakEquity', balance ?? 0), balance ?? 0),
      curve,
      last: last ? { ...last, fund: json(last.fund), tech: json(last.tech) } : null,
      fund: fund && fund.until > Date.now() ? { bias: fund.bias, note: fund.note } : null,
      calendar: kv('calendar', []).filter((e) => e.at >= Date.now() - 3 * 3600e3 && e.at <= Date.now() + 7 * 864e5).sort((x, y) => x.at - y.at).slice(0, 8)
        .map((e) => { const [wb, wa] = newsWin(e); return { ...e, wb, wa }; }),
      ea: { connected: !!ea.at && Date.now() / 1000 - ea.at < 180, demo: ea.demo ?? null },
      risk: { riskPct: P.riskPct, rr: P.maxRr, safeRiskMul: P.safeRiskMul, dailyLossPct: P.dailyLossPct, maxConsecLoss: P.maxConsecLoss, asiaUTC: P.asiaUTC, offUTC: P.offUTC },
      proposals: all("SELECT id, ts, note FROM trd_proposals WHERE status = 'proposed' ORDER BY id DESC LIMIT 3"),
      tf: kv('tfTrend', {}),
      currency: kv('currency', 'USD'), usd_idr: kv('usdIdr', 16500),
    };
  } catch { return null; }
}

function weekStats(week) {
  const end = addDays(week, 6);
  // Marketing (IG/TikTok) + YouTube Shorts; Shorts 'uploading/uploaded' = sudah ✅ tapi belum tayang publik
  const c = get(`SELECT COUNT(*) total,
      SUM(status = 'posted') posted,
      SUM(status = 'pending_approval') pending,
      SUM(status IN ('approved','scheduled','uploading','uploaded')) scheduled,
      SUM(channel IS 'youtube') yt_total, SUM(channel IS 'youtube' AND status = 'posted') yt_posted,
      SUM(channel IS 'youtube' AND status = 'pending_approval') yt_pending,
      SUM(channel IS 'youtube' AND status IN ('approved','uploading','uploaded')) yt_scheduled
    FROM contents WHERE day BETWEEN ? AND ? AND COALESCE(json_extract(data_json, '$._test'), 0) = 0 AND status != 'rejected'`, week, end);
  // metrics = snapshot tiap tarikan (Raka tiap 3 jam, socials.mjs) → ambil yang terbaru per konten per platform, jangan dijumlah semua
  const LATEST = 'm.id IN (SELECT MAX(id) FROM metrics GROUP BY content_id, platform)';
  const m = get(`SELECT COALESCE(SUM(m.views),0) views, COALESCE(SUM(m.likes),0) likes, COALESCE(SUM(m.comments),0) comments,
      COALESCE(SUM(m.shares),0) shares, COALESCE(SUM(m.saves),0) saves, COALESCE(SUM(CASE WHEN c.channel IS 'youtube' THEN m.views END),0) yt_views
    FROM metrics m JOIN contents c ON c.id = m.content_id WHERE ${LATEST} AND c.day BETWEEN ? AND ?`, week, end);
  const top = all(`SELECT c.title, c.format, c.pillar, SUM(m.views) views FROM metrics m JOIN contents c ON c.id = m.content_id
    WHERE ${LATEST} AND c.day BETWEEN ? AND ? GROUP BY c.id ORDER BY views DESC LIMIT 3`, week, end);
  return { week, ...normalize(c), ...normalize(m), top };
}
const normalize = (o) => Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [k, Number(v ?? 0)]));

if (!commands[cmd]) {
  out('perintah: init | brief <agent> | agent <id> <status> [task] | chat <dari> <ke|all> <kind> <pesan> | log <agent> <msg> | memory <agent> <note> | campaign <file> | research <file> | content get|set|list|new | idea add|pick|list|done | followup <menit> <catatan> | task done|doing|list | metric ... | stats [week] | export');
  process.exit(cmd ? 1 : 0);
}
commands[cmd](...args);
