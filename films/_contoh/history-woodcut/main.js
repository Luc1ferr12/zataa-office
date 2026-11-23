// Mesin Antikythera — entry
const cv = document.getElementById('cv'), g = cv.getContext('2d');
await document.fonts.load('400 40px "IM Fell English"'); await document.fonts.load('400 40px "IM Fell English SC"');
const m = await import('./film.js');
await m.init();
window.DUR = m.DUR; window.EV = m.EV; window.TEXTS = m.TEXTS;
window.render = t => m.render(g, t);
window.READY = true;
