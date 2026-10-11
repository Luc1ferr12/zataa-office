// Helper bersama template: game → warna aksen, *teks* → sorotan, header/footer, dan pengecil teks otomatis.
export const GAMES = {
  mlbb: { name: 'MOBILE LEGENDS', accent: '#f5b942' },
  valorant: { name: 'VALORANT', accent: '#ff4655' },
  freefire: { name: 'FREE FIRE', accent: '#ff8a1f' },
  other: { name: 'GAMING', accent: '#a78bfa' },
};
const LOGO = new URL('../../docs/assets/logo.png', import.meta.url).href;

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// *kata* → warna aksen, **kata** → tebal putih, baris baru dipertahankan
export const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/\n/g, '<br>');

export function setup(data, size) {
  const g = GAMES[data.game] ?? null;
  document.body.className = size === 'story' ? 'story' : 'feed';
  document.documentElement.style.setProperty('--accent', data.accent ?? g?.accent ?? '#a78bfa');
  return g;
}

export const shell = (data, g, inner, { kicker = '', foot = true } = {}) => `
  <div class="bg"></div><div class="watermark">ZA</div><div class="hud tl"></div><div class="hud br"></div>
  <div class="frame">
    <div class="head">
      <div class="brandmark"><img src="${LOGO}" alt=""><div><b>ZATAA</b><small>TOP UP GAME</small></div></div>
      ${g ? `<div class="chip"><i></i>${esc(data.game_label ?? g.name)}</div>` : ''}
    </div>
    ${kicker}
    ${inner}
    ${foot ? footer(data) : ''}
  </div>`;

export const footer = (data) => `
  <div class="foot">
    <div class="cta">${esc(data.cta ?? 'Top up di zataa.my.id')}${/\p{Extended_Pictographic}/u.test(data.cta ?? '') ? '' : ' <span class="bolt">⚡</span>'}</div>
    ${data.footnote ? `<div class="small">${md(data.footnote)}</div>` : '<div class="site">zataa.my.id</div>'}
  </div>`;

export const kicker = (text, cls = '') => (text ? `<div class="kicker ${cls}"><span>${esc(text)}</span></div>` : '');

// kecilkan font elemen sampai tidak meluber dari wadahnya
export function fit(el, min = 40) {
  if (!el) return;
  let size = parseFloat(getComputedStyle(el).fontSize);
  const box = el.closest('.grow') ?? el.parentElement;
  const over = () => box.scrollHeight > box.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
  while (over() && size > min) { size -= 4; el.style.fontSize = `${size}px`; }
}

export async function ready() {
  await document.fonts.ready;
  await Promise.all([...document.images].map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; }))));
}
