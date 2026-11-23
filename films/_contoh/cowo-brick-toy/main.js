// Rel Kereta & Kerikil (Brick Toy) — entry
await document.fonts.load('600 44px Fredoka'); await document.fonts.load('400 84px "Lilita One"'); await document.fonts.load('700 104px Fredoka');
const m = await import('./film.js');
await m.init();
window.DUR = m.DUR; window.EV = m.EV; window.TEXTS = m.TEXTS;
window.render = t => m.render(t);
window.READY = true;
