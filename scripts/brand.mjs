// Dua channel Shorts, alur & kode sama, beda tim/bot/akun (keputusan Owner 25 Okt 2026):
//   history = Zataa History (channel YouTube lama @zataastory, akun zataatopup) — sejarah misteri kuno dunia, tim Bagas dkk, bot @zataashortbot, Zernio akun 1
//   story   = Zataa Story (channel YouTube baru + TikTok @zataa.story, akun zataastory) — misteri & horor Nusantara, tim Raditya dkk, bot @zataastorybot, Zernio akun 2
// Pilih brand: argumen --brand=story (CLI) atau env SHORTS_BRAND; default history.
const arg = process.argv.find((a) => a.startsWith('--brand='));
export const BRAND_KEY = arg ? arg.slice(8) : process.env.SHORTS_BRAND || 'history';

export const BRANDS = {
  history: {
    key: 'history', name: 'Zataa History', channel: 'youtube', niche: 'sejarah misteri kuno dunia + mitologi Yunani',
    bot: '@zataashortbot', tokenEnv: 'SHORTS_BOT_TOKEN', zernioEnv: 'ZERNIO_API_KEY', ytTokenEnv: 'YT_REFRESH_TOKEN', ytClientEnv: 'YT_CLIENT_ID', ytSecretEnv: 'YT_CLIENT_SECRET', tiktok: false,
    sop: 'office/youtube.md', state: 'tmp/shorts-bot.json', hashtags: '#Shorts #sejarah #misteri', tag: 'MISTERI KUNO',
    team: { dir: 'ydir', research: 'yresearch', script: 'yscript', visual: 'yvisual', video: 'yvideo', publish: 'ypublish' },
    week: 7, core: 'hidden_history', coreMin: 2, quotaStart: '2026-10-26',
  },
  story: {
    key: 'story', name: 'Zataa Story', channel: 'story', niche: 'misteri & horor Nusantara berbasis sejarah',
    bot: '@zataastorybot', tokenEnv: 'STORY_BOT_TOKEN', zernioEnv: 'ZERNIO_STORY_API_KEY', ytTokenEnv: 'STORY_YT_REFRESH_TOKEN', ytClientEnv: 'STORY_YT_CLIENT_ID', ytSecretEnv: 'STORY_YT_CLIENT_SECRET', tiktok: true,
    sop: 'office/story.md', state: 'tmp/story-bot.json', hashtags: '#Shorts #misteri #nusantara #horor', tag: 'MISTERI NUSANTARA',
    team: { dir: 'sdir', research: 'sresearch', script: 'sscript', visual: 'svisual', video: 'svideo', publish: 'spublish' },
    week: 7, core: 'horor_sejarah', coreMin: 3, quotaStart: '2026-10-26',
  },
};
if (!BRANDS[BRAND_KEY]) throw new Error(`brand tidak dikenal: ${BRAND_KEY} (pakai history | story)`);
export const B = BRANDS[BRAND_KEY];
export const brandOfChannel = (ch) => Object.values(BRANDS).find((b) => b.channel === ch) ?? null;
export const SHORTS_CHANNELS = Object.values(BRANDS).map((b) => b.channel);
// argumen CLI tanpa --brand=…
export const cliArgs = () => process.argv.slice(2).filter((a) => !a.startsWith('--brand='));
