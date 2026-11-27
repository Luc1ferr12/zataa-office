// Skill & alat yang dipakai tiap pegawai (menu Tim). Sumber: office/roles/<id>.md + CLAUDE.md —
// playbook berubah → samakan di sini. kind: skill = skill Claude, tool = alat/mesin/script.
const S = (label, desc) => ({ label, desc, kind: 'skill' });
const T = (label, desc) => ({ label, desc, kind: 'tool' });
const off = (x, why) => ({ ...x, off: why });
const IG = 'IG dimatikan';

export const SKILLS = {
  lemo: S('lemo-opuscar', 'Film pendek yang dibuat penuh dari kode (semua video divisi)'),
  'yt-plan': S('/yt-plan', 'Susun jadwal & urutan upload'),
  'yt-audit': S('/yt-audit', 'Audit channel: kemasan, konsistensi, detik awal'),
  'yt-viral': S('/yt-viral', 'Cari video yang lagi jalan di niche + formulanya'),
  'yt-script': S('/yt-script', 'Hook & naskah video, hook dinilai skor'),
  'yt-shorts': S('/yt-shorts', 'Cari & tulis Shorts dari video panjang'),
  'yt-package': S('/yt-package', 'Judul & thumbnail / frame pertama'),
  'yt-seo': S('/yt-seo', 'Deskripsi, tag & kata pencarian'),
  'yt-retention': S('/yt-retention', 'Baca di detik mana penonton kabur'),
  'yt-comment': S('/yt-comment', 'Pilah & balas komentar'),
  'yt-edit': S('/yt-edit', 'Buang jeda kosong dari transkrip'),
  'yt-chapters': S('/yt-chapters', 'Chapter video panjang'),
  'ig-viral': S('/ig-viral', 'Riset format reel yang lagi jalan'),
  'ig-caption': S('/ig-caption', 'Caption: baris pembuka + 1 ajakan'),
  'ig-human': S('/ig-human', 'Buang gaya tulisan yang berasa AI'),
  'ig-reel': S('/ig-reel', 'Cek ritme naskah video pendek'),
  'ig-profile': off(S('/ig-profile', 'Skor & perbaikan profil IG'), IG),
  'ig-audit': off(S('/ig-audit', 'Evaluasi post yang sudah tayang'), IG),
  'ig-carousel': off(S('/ig-carousel', 'Bikin carousel IG'), IG),
  'ig-story': off(S('/ig-story', 'Susun IG Story harian'), IG),
  'ig-reply': off(S('/ig-reply', 'Draf balasan komentar IG'), IG),

  voxcpm: T('VoxCPM2', 'Suara narator, dirender di laptop'),
  naya: T('ElevenLabs · Naya', 'Suara narator Zaa Story'),
  indah: T('ElevenLabs · Indah', 'Suara narator Marvel Talk'),
  depa: T('ElevenLabs · Depa', 'Suara narator Cowo Bingung'),
  whisper: T('Whisper', 'Transkrip suara & caption per kata'),
  ffmpeg: T('ffmpeg', 'Potong & susun video 9:16'),
  ytdlp: T('yt-dlp', 'Unduh footage sumber campaign'),
  zernio: T('Zernio', 'Upload ke YouTube / TikTok + angka performa'),
  approval: T('Approval Bos', 'Kirim ke Owner via Telegram / web (✅ ✏️ ❌)'),
  websearch: T('Riset web', 'Cari & cek silang sumber'),
  feeds: T('Feed berita', 'RSS berita esport (feeds.mjs)'),
  topics: T('Bank topik', 'Antrean ide Shorts + cek kuota pilar'),
  roster: T('Database tim', 'Logo, foto tim & pemain (Liquipedia)'),
  qa: T('QA otomatis', 'Cek sumber, istilah, logo & aturan konten (qa.mjs)'),
  analyst: T('Laporan data', 'Tarik angka, laporan harian & mingguan (analyst.mjs)'),
  boost: off(T('Meta Ads', 'Boost post (boost.mjs)'), 'iklan libur'),
  price: off(T('Pantau harga', 'Cek harga toko (price.mjs)'), 'toko mati'),
  finance: T('Google Sheet', 'Catat keuangan pribadi Owner'),
  haiku: T('Claude Haiku', 'Model cepat buat balas chat'),
  chrome: T('Chrome laptop', 'Akses Clippo lewat browser Owner yang login'),
  claude: T('Claude CLI', 'Pilih momen clip sesuai brief'),
  trader: S('trader-skill', 'Metode trading (MIT), disesuaikan buat XAUUSD'),
  cycle: T('Siklus M15', 'Alur otomatis tiap candle, tanpa AI'),
  calendar: T('Kalender USD', 'ForexFactory: CPI, NFP, FOMC, dll.'),
  indicator: T('Indikator M15', 'Analisa teknikal multi-timeframe'),
  riskgate: T('riskGate', 'Gerbang risiko sebelum order dikirim'),
  mt5: T('MQL5 / MT5', 'EA yang mengeksekusi order'),
  backtest: T('Backtest', 'Uji setelan di data 60 hari'),
  report: T('Laporan trading', 'Rangkuman dari database ke Telegram'),
};

// per pegawai: [keahlian (diadaptasi dari agency-agents, MIT), ...id SKILLS]
const shorts = (p, voice) => ({
  [`${p}video`]: ['Short-Video Editing Coach · Video Optimization', 'lemo', voice, 'whisper', 'yt-edit', 'yt-chapters'],
});
export const AGENT_SKILLS = {
  sec: ['Chief of Staff · Bookkeeper · FP&A Analyst', 'finance', 'haiku'],

  dir: ['Social Media Strategist · Growth Hacker', 'approval', 'analyst', 'ig-viral', 'ig-profile', 'ig-audit'],
  researcher: ['Trend Researcher · Research Synthesist', 'feeds', 'websearch', 'roster', 'ig-viral'],
  price: ['Pricing Analyst · Trend Researcher', 'price'],
  copywriter: ['Content Creator · TikTok Strategist', 'lemo', 'ig-caption', 'ig-human'],
  designer: ['Brand Guardian · Visual Storyteller', 'lemo', 'roster', 'ig-carousel'],
  video: ['Short-Video Editing Coach · TikTok Strategist', 'lemo', 'voxcpm', 'whisper', 'ig-reel'],
  publisher: ['Multi-Platform Publisher · TikTok Strategist', 'qa', 'approval', 'zernio', 'ig-caption', 'ig-story', 'ig-reply'],
  ads: ['Paid Social · PPC Strategist', 'boost'],
  analyst: ['Analytics Reporter', 'analyst', 'ig-audit', 'ig-profile'],

  ydir: ['Studio Producer · Project Shepherd', 'topics', 'yt-plan', 'yt-audit', 'yt-package'],
  yresearch: ['Historian · Research Synthesist', 'websearch', 'topics', 'yt-viral'],
  yscript: ['Narratologist · Historian', 'lemo', 'yt-script', 'yt-shorts'],
  yvisual: ['Visual Storyteller · Image Prompt Engineer', 'lemo', 'yt-package'],
  ...shorts('y', 'voxcpm'),
  ypublish: ['SEO Specialist · Analytics Reporter', 'approval', 'zernio', 'yt-package', 'yt-seo', 'yt-retention', 'yt-comment'],

  sdir: ['Studio Producer · Project Shepherd', 'topics', 'yt-plan', 'yt-audit', 'yt-package'],
  sresearch: ['Historian · Research Synthesist', 'websearch', 'topics', 'yt-viral'],
  sscript: ['Narratologist · Historian', 'lemo', 'naya', 'yt-script', 'yt-shorts'],
  svisual: ['Visual Storyteller · Image Prompt Engineer', 'lemo', 'yt-package'],
  ...shorts('s', 'naya'),
  spublish: ['SEO Specialist · Analytics Reporter', 'approval', 'zernio', 'yt-package', 'yt-seo', 'yt-retention', 'yt-comment'],

  vdir: ['Studio Producer · Content Creator', 'topics', 'yt-plan', 'yt-audit'],
  vresearch: ['Trend Researcher · Research Synthesist', 'websearch', 'topics', 'yt-viral'],
  vscript: ['Narrative Designer · Research Synthesist', 'lemo', 'indah', 'yt-script', 'yt-shorts'],
  vvisual: ['Visual Storyteller · Image Prompt Engineer', 'lemo', 'yt-package'],
  ...shorts('v', 'indah'),
  vpublish: ['Social Media Strategist · SEO Specialist', 'approval', 'zernio', 'yt-package', 'yt-seo', 'yt-retention', 'yt-comment'],

  bdir: ['Studio Producer · Content Creator', 'topics', 'yt-plan', 'yt-audit'],
  bresearch: ['Trend Researcher', 'websearch', 'topics'],
  bscript: ['Content Creator · Short-Video Editing Coach', 'lemo', 'depa', 'yt-script'],
  bvisual: ['Visual Storyteller', 'lemo'],
  bvideo: ['Short-Video Editing Coach', 'lemo', 'depa', 'whisper'],
  bpublish: ['Social Media Strategist · Content Creator', 'approval', 'zernio', 'yt-package', 'yt-seo', 'yt-comment'],

  cdir: ['Growth Hacker · Experiment Tracker', 'chrome', 'approval'],
  cbrief: ['Content Creator · Research Synthesist', 'claude', 'ytdlp', 'whisper'],
  cedit: ['Short-Video Editing Coach', 'ffmpeg', 'whisper'],
  ccopy: ['Content Creator · Social Media Strategist', 'claude'],
  cpublish: ['Social Media Strategist · Analytics Reporter', 'zernio', 'chrome'],

  tdir: ['Project Shepherd · Studio Producer', 'trader', 'cycle'],
  tresearch: ['Trend Researcher', 'trader', 'calendar'],
  ttech: ['Analytics Reporter', 'trader', 'indicator'],
  trisk: ['Backend Architect · Reality Checker', 'trader', 'riskgate', 'mt5'],
  texec: ['DevOps Automator', 'trader', 'riskgate', 'mt5'],
  teval: ['Experiment Tracker · Test Results Analyzer', 'trader', 'backtest'],
  treport: ['Support Responder · Analytics Reporter', 'trader', 'report'],
};

const chip = (id) => {
  const s = SKILLS[id];
  return `<i class="sk ${s.kind}${s.off ? ' off' : ''}" title="${s.desc}${s.off ? ` (nonaktif: ${s.off})` : ''}">${s.label}</i>`;
};

// blok skill di kartu pegawai ('' kalau pegawai nggak punya, mis. Owner & office girl)
export function skillsHtml(agentId) {
  const [craft, ...ids] = AGENT_SKILLS[agentId] ?? [];
  if (!craft) return '';
  return `<div class="skills">${ids.map(chip).join('')}<small>Keahlian: ${craft}</small></div>`;
}

// kamus skill: arti tiap chip + siapa yang pakai (di HP tooltip nggak muncul)
export function skillGuideHtml(names) {
  const users = (id) => Object.entries(AGENT_SKILLS).filter(([, v]) => v.indexOf(id) > 0).map(([a]) => names[a] ?? a);
  const group = (kind, title) => `<h3>${title}</h3><dl>${Object.entries(SKILLS).filter(([, s]) => s.kind === kind)
    .map(([id, s]) => `<div><dt>${chip(id)}</dt><dd>${s.desc}${s.off ? ` · <em>nonaktif: ${s.off}</em>` : ''}<small>${users(id).join(', ')}</small></dd></div>`).join('')}</dl>`;
  return group('skill', 'Skill') + group('tool', 'Alat');
}
