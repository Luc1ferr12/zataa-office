-- Zataa AI Virtual Office — database lokal (SQLite)
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Pegawai kantor (AI + owner)
CREATE TABLE IF NOT EXISTS agents (
  id           TEXT PRIMARY KEY,          -- dir, researcher, copywriter, designer, video, publisher, owner
  name         TEXT NOT NULL,
  title        TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'idle', -- idle | working | waiting | done | off
  current_task TEXT,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Rencana campaign mingguan (dibuat Marketing Dir tiap Senin)
CREATE TABLE IF NOT EXISTS campaigns (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start  TEXT NOT NULL UNIQUE,      -- tanggal Senin, YYYY-MM-DD
  theme       TEXT NOT NULL,
  goals       TEXT,
  plan_json   TEXT,                       -- jadwal slot per hari (ringkas)
  evaluation  TEXT,                       -- diisi Sabtu
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Tugas per pegawai
CREATE TABLE IF NOT EXISTS tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER REFERENCES campaigns(id),
  agent_id    TEXT NOT NULL REFERENCES agents(id),
  day         TEXT NOT NULL,             -- YYYY-MM-DD
  type        TEXT NOT NULL,             -- plan | research | copy | design | video | publish | eval
  title       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'todo', -- todo | doing | done | blocked
  content_id  INTEGER REFERENCES contents(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Konten (feed / carousel / video)
CREATE TABLE IF NOT EXISTS contents (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id   INTEGER REFERENCES campaigns(id),
  day           TEXT NOT NULL,           -- YYYY-MM-DD
  slot          TEXT NOT NULL,           -- pagi | siang | malam
  format        TEXT NOT NULL,           -- feed | carousel | video
  game          TEXT,                    -- mlbb | valorant | freefire | other
  pillar        TEXT,                    -- promo | news | esport | tips | engagement
  title         TEXT NOT NULL,
  data_json     TEXT,                    -- isi template (headline, harga, poin, dll)
  caption       TEXT,
  hashtags      TEXT,
  cta           TEXT,
  link          TEXT,
  template      TEXT,
  asset_path    TEXT,                    -- path file hasil render
  asset_url     TEXT,                    -- URL publik (GitHub Pages) untuk IG/TikTok
  status        TEXT NOT NULL DEFAULT 'draft',
                -- draft | pending_approval | revision | approved | rejected | scheduled | posted | failed
  owner_note    TEXT,
  scheduled_at  TEXT,
  posted_at     TEXT,
  ig_media_id   TEXT,
  tiktok_id     TEXT,
  sources       TEXT,                    -- URL sumber berita (wajib untuk news/esport)
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Temuan Researcher
CREATE TABLE IF NOT EXISTS research (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  day        TEXT NOT NULL,
  game       TEXT,
  topic      TEXT NOT NULL,
  summary    TEXT,
  source_url TEXT,
  score      INTEGER DEFAULT 0,          -- 1-5 potensi viral
  used       INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Memori ringkas per pegawai (biar hemat token: yang dibaca cuma N terakhir)
CREATE TABLE IF NOT EXISTS memories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id   TEXT NOT NULL REFERENCES agents(id),
  kind       TEXT NOT NULL DEFAULT 'note', -- note | lesson | preference
  note       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Hasil performa konten
CREATE TABLE IF NOT EXISTS metrics (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id  INTEGER REFERENCES contents(id),
  platform    TEXT NOT NULL,             -- instagram | tiktok
  views       INTEGER DEFAULT 0,
  likes       INTEGER DEFAULT 0,
  comments    INTEGER DEFAULT 0,
  shares      INTEGER DEFAULT 0,
  saves       INTEGER DEFAULT 0,
  captured_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Log aktivitas (ditampilkan di dashboard)
CREATE TABLE IF NOT EXISTS activity (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  ts       TEXT NOT NULL DEFAULT (datetime('now')),
  agent_id TEXT REFERENCES agents(id),
  message  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_day ON tasks(day);
CREATE INDEX IF NOT EXISTS idx_contents_day ON contents(day);
CREATE INDEX IF NOT EXISTS idx_mem_agent ON memories(agent_id, id);

INSERT OR IGNORE INTO agents (id, name, title) VALUES
  ('owner',      'Zamiir', 'Owner / Boss'),
  ('dir',        'Aprista',   'Marketing Director'),
  ('researcher', 'Clariana',  'Researcher'),
  ('copywriter', 'Ista',   'Copywriter'),
  ('designer',   'Maria',  'Graphic Designer'),
  ('video',      'Dimas',  'Video Production'),
  ('publisher',  'Fikri',  'Social Media Publisher');
