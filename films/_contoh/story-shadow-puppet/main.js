// Kapal Hantu Ourang Medan — entry
for (const f of ['500', '600', '700']) await document.fonts.load(`${f} 40px "Cormorant Garamond"`);
await document.fonts.load('italic 600 40px "Cormorant Garamond"');
const m = await import('./film.js');
await m.init(document.getElementById('gl'));
window.DUR = m.DUR; window.EV = m.EV; window.TEXTS = m.TEXTS;
window.render = t => m.render(t);
window.READY = true;
