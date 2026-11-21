// Dua channel Shorts, alur & kode sama, beda tim/bot/akun (keputusan Owner 25 Okt 2026):
//   history = Zaa History (channel YouTube lama @zataastory, akun zataatopup) — sejarah misteri kuno dunia, tim Bagas dkk, bot @zataashortbot, Zernio akun 1
//   story   = Zaa Story (channel YouTube baru + TikTok @zataa.story, akun zataastory) — misteri & horor Nusantara, tim Raditya dkk, bot @zataastorybot, Zernio akun 2
//   marvel  = Marvel Talk (15 Nov 2026: YouTube + TikTok baru) — lore, teori, fakta & berita MCU, tim Reza dkk, bot MARVEL_BOT_TOKEN, Zernio akun 3
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
  },
  story: {
    key: 'story', name: 'Zaa Story', channel: 'story', niche: 'misteri & horor Nusantara berbasis sejarah',
    bot: '@zataastorybot', tokenEnv: 'STORY_BOT_TOKEN', zernioEnv: 'ZERNIO_STORY_API_KEY', zernioAcct: 'ZERNIO_STORY', tiktok: true, ttTags: ['#misteri', '#horor', '#nusantara', '#fyp'],
    sop: 'office/story.md', state: 'tmp/story-bot.json', hashtags: '#Shorts #misteri #nusantara #horor', tag: 'MISTERI NUSANTARA',
    team: { dir: 'sdir', research: 'sresearch', script: 'sscript', visual: 'svisual', video: 'svideo', publish: 'spublish' },
    week: 7, core: 'horor_sejarah', coreMin: 3, quotaStart: '2026-10-26',
  },
  marvel: {
    key: 'marvel', name: 'Marvel Talk', channel: 'marvel', niche: 'lore, teori, fakta & berita/rumor Marvel (MCU & komik)',
    bot: 'bot Marvel Talk', tokenEnv: 'MARVEL_BOT_TOKEN', zernioEnv: 'ZERNIO_MARVEL_API_KEY', zernioAcct: 'ZERNIO_MARVEL', tiktok: true, ttTags: ['#marvel', '#mcu', '#fyp'],
    sop: 'office/marvel.md', state: 'tmp/marvel-bot.json', hashtags: '#Shorts #marvel #mcu', tag: 'MARVEL TALK',
    team: { dir: 'vdir', research: 'vresearch', script: 'vscript', visual: 'vvisual', video: 'vvideo', publish: 'vpublish' },
    week: 7, core: 'lore_teori', coreMin: 3, quotaStart: '2026-11-16',
  },
};
if (!BRANDS[BRAND_KEY]) throw new Error(`brand tidak dikenal: ${BRAND_KEY} (pakai history | story | marvel)`);
export const B = BRANDS[BRAND_KEY];
export const brandOfChannel = (ch) => Object.values(BRANDS).find((b) => b.channel === ch) ?? null;
export const SHORTS_CHANNELS = Object.values(BRANDS).map((b) => b.channel);
// argumen CLI tanpa --brand=…
export const cliArgs = () => process.argv.slice(2).filter((a) => !a.startsWith('--brand='));
