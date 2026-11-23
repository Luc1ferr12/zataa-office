// Channel Shorts (4 brand), alur & kode sama, beda tim/bot/akun (keputusan Owner 25 Okt 2026):
//   history = Zaa History (channel YouTube lama @zataastory, akun zataatopup) — sejarah misteri kuno dunia, tim Bagas dkk, bot @zataashortbot, Zernio akun 1
//   story   = Zaa Story (channel YouTube baru + TikTok @zataa.story, akun zataastory) — misteri & horor Nusantara, tim Raditya dkk, bot @zataastorybot, Zernio akun 2
//   marvel  = Marvel Talk (15 Nov 2026: YouTube + TikTok baru) — lore, teori, fakta & berita MCU, tim Reza dkk, bot MARVEL_BOT_TOKEN, Zernio akun 3
//   cowo    = Cowo Bingung (23 Nov 2026: YouTube + TikTok @cowo.bingung65) — fakta unik/nyeleneh/lucu, tim Aurel dkk (cewek semua), bot @cowobingungbot, Zernio ZERNIO_COWO_API_KEY
// 23 Nov 2026: video SEMUA brand = film lemo-opuscar (films/<slug>, scripts/film.mjs); `voice` = eleven (scripts/eleven.mjs) / voxcpm.
// Owner 23 Nov 2026: tiap divisi punya 3 gaya (`films`), dipilih per video sesuai tema (`filmBy` pilar → gaya, default `film`); ganti-ganti biar channel nggak monoton.
// Pilih brand: argumen --brand=story (CLI) atau env SHORTS_BRAND; default history.
const arg = process.argv.find((a) => a.startsWith('--brand='));
export const BRAND_KEY = arg ? arg.slice(8) : process.env.SHORTS_BRAND || 'history';

export const BRANDS = {
  history: {
    key: 'history', name: 'Zaa History', channel: 'youtube', niche: 'sejarah misteri kuno dunia + mitologi Yunani',
    bot: '@zataashortbot', tokenEnv: 'SHORTS_BOT_TOKEN', zernioEnv: 'ZERNIO_HISTORY_API_KEY', zernioAcct: 'ZERNIO_HISTORY', tiktok: true, ttTags: ['#sejarah', '#misteri', '#fyp'], ttBackfill: '10:00', ttStart: '2026-11-16', // 21 Nov 2026: satu login Zernio History (YouTube + TikTok @zaa.history)
   
    sop: 'office/youtube.md', state: 'tmp/shorts-bot.json', hashtags: '#Shorts #sejarah #misteri', tag: 'MISTERI KUNO',
    team: { dir: 'ydir', research: 'yresearch', script: 'yscript', visual: 'yvisual', video: 'yvideo', publish: 'ypublish' },
    week: 7, core: 'hidden_history', coreMin: 2, quotaStart: '2026-10-26',
    film: 'woodcut', films: ['woodcut', 'dark-documentary', 'stained-glass'], voice: 'voxcpm',
    filmBy: { hidden_history: 'woodcut', historical_figures: 'woodcut', strange_events: 'woodcut', lost_civilizations: 'dark-documentary', historical_mysteries: 'dark-documentary', ancient_secrets: 'dark-documentary', greek_myth: 'stained-glass' },
  },
  story: {
    key: 'story', name: 'Zaa Story', channel: 'story', niche: 'misteri & horor Nusantara berbasis sejarah',
    bot: '@zataastorybot', tokenEnv: 'STORY_BOT_TOKEN', zernioEnv: 'ZERNIO_STORY_API_KEY', zernioAcct: 'ZERNIO_STORY', tiktok: true, ttTags: ['#misteri', '#horor', '#nusantara', '#fyp'],
    sop: 'office/story.md', state: 'tmp/story-bot.json', hashtags: '#Shorts #misteri #nusantara #horor', tag: 'MISTERI NUSANTARA',
    team: { dir: 'sdir', research: 'sresearch', script: 'sscript', visual: 'svisual', video: 'svideo', publish: 'spublish' },
    week: 7, core: 'horor_sejarah', coreMin: 3, quotaStart: '2026-10-26',
    film: 'shadow-puppet', films: ['shadow-puppet', 'backrooms', 'newsreel'], voice: 'eleven',
    filmBy: { legenda_mitos: 'shadow-puppet', ritual_mistis: 'shadow-puppet', misteri_kuno: 'shadow-puppet', horor_sejarah: 'backrooms', sejarah_kelam: 'newsreel', peristiwa_aneh: 'newsreel' },
  },
  marvel: {
    key: 'marvel', name: 'Marvel Talk', channel: 'marvel', niche: 'lore, teori, fakta & berita/rumor Marvel (MCU & komik)',
    bot: 'bot Marvel Talk', tokenEnv: 'MARVEL_BOT_TOKEN', zernioEnv: 'ZERNIO_MARVEL_API_KEY', zernioAcct: 'ZERNIO_MARVEL', tiktok: true, ttTags: ['#marvel', '#mcu', '#fyp'],
    sop: 'office/marvel.md', state: 'tmp/marvel-bot.json', hashtags: '#Shorts #marvel #mcu', tag: 'MARVEL TALK',
    team: { dir: 'vdir', research: 'vresearch', script: 'vscript', visual: 'vvisual', video: 'vvideo', publish: 'vpublish' },
    week: 7, core: 'lore_teori', coreMin: 3, quotaStart: '2026-11-16',
    film: 'pop-art', films: ['pop-art', 'manga-panels', 'text-flash-cuts'], voice: 'eleven',
    filmBy: { fakta_marvel: 'pop-art', karakter: 'manga-panels', ranking: 'manga-panels', lore_teori: 'text-flash-cuts', berita_mcu: 'text-flash-cuts' },
  },
  cowo: {
    key: 'cowo', name: 'Cowo Bingung', channel: 'cowo', niche: 'fakta unik, nyeleneh & lucu sehari-hari (kenapa benda/aturan begini, coba bikin sendiri)',
    bot: '@cowobingungbot', tokenEnv: 'COWO_BOT_TOKEN', zernioEnv: 'ZERNIO_COWO_API_KEY', zernioAcct: 'ZERNIO_COWO', tiktok: true, ttTags: ['#faktaunik', '#cowobingung', '#fyp'],
    sop: 'office/cowo.md', state: 'tmp/cowo-bot.json', hashtags: '#Shorts #faktaunik #cowobingung', tag: 'COWO BINGUNG',
    team: { dir: 'bdir', research: 'bresearch', script: 'bscript', visual: 'bvisual', video: 'bvideo', publish: 'bpublish' },
    week: 7, core: 'kenapa_gitu', coreMin: 3, quotaStart: '2026-11-23',
    film: 'brick-toy', films: ['brick-toy', 'isometric-picture-book', 'colored-pencil'], voice: 'eleven',
    filmBy: { kenapa_gitu: 'brick-toy', coba_bikin: 'brick-toy', fakta_aneh: 'isometric-picture-book', tubuh_alam: 'colored-pencil' },
  },
};
// 'esports' = About Esports (bukan brand Shorts, dipakai film.mjs --brand=esports) → jangan crash, B jatuh ke history (nggak dipakai)
if (!BRANDS[BRAND_KEY] && BRAND_KEY !== 'esports') throw new Error(`brand tidak dikenal: ${BRAND_KEY} (pakai history | story | marvel | cowo)`);
export const B = BRANDS[BRAND_KEY] ?? BRANDS.history;
export const brandOfChannel = (ch) => Object.values(BRANDS).find((b) => b.channel === ch) ?? null;
export const SHORTS_CHANNELS = Object.values(BRANDS).map((b) => b.channel);
// argumen CLI tanpa --brand=…
export const cliArgs = () => process.argv.slice(2).filter((a) => !a.startsWith('--brand='));
