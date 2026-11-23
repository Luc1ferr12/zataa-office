"""Vibranium (Pop Art) · narasi + foley percetakan + musik lounge 60-an → out/mix.wav (jalankan dari root library dengan $LIB/.venv python).
Foley: stempel (thump + tamparan kertas), sapuan rakel, whoosh kertas, satu dentum per plat, retak & ledakan.
Musik orisinal 112 bpm: bas petik, vibraphone, marimba, glockenspiel + shaker & tepuk sintetis; hening rendah sebelum ledakan."""
import json, os, sys
import numpy as np, soundfile as sf
HERE = os.path.dirname(os.path.abspath(__file__))
LIB = os.environ.get('LIB') or os.getcwd()
sys.path.insert(0, LIB)
from core.audio import sampler as S
from core.audio.sfx import SR, add, bp, lp, hp, noise, brown, thump, whoosh, compress, limit, t_

S.seed(23)
J = json.load(open(os.path.join(HERE, 'events.json'), encoding='utf8'))
DUR = J['dur']; EV = J['ev']
N = int((DUR + 1) * SR)
rng = np.random.default_rng(5)
f32 = lambda x: np.asarray(x, np.float32)
note = lambda *a, **k: S.note(*a, **k).astype(np.float32)
music = np.zeros((N, 2), np.float32); fol = np.zeros((N, 2), np.float32)

def stamp(v=1.0):
    th = f32(thump(v=1.0, f=95))[:int(.25 * SR)] * .55
    sl = f32(hp(noise(.06), 900) * np.exp(-t_(.06) / .012) * .35)
    out = np.zeros(max(len(th), len(sl)), np.float32); out[:len(th)] += th; out[:len(sl)] += sl
    return out * v
def squeegee(v=1.0):
    d = .32; x = bp(noise(d), 700, 4200) * np.minimum(1, t_(d) / .03) * np.minimum(1, (d - t_(d)) / .12)
    return f32(x * .22 * v)
def flick(v=1.0): return f32(bp(noise(.05), 1800, 7000) * np.exp(-t_(.05) / .01) * .45 * v)
def crackle(d):
    x = lp(noise(d), 700) * .5 + bp(noise(d), 1500, 5000) * (np.abs(lp(noise(d), 30)) * 6) ** 2 * .15
    return f32(x * np.minimum(1, t_(d) / .6) * np.minimum(1, (d - t_(d)) / .4) * .35)
def boom(v=1.0):
    d = 1.6; x = lp(brown(d), 160) * np.exp(-t_(d) / .45) + bp(noise(d), 300, 3000) * np.exp(-t_(d) / .12) * .6
    return f32(x / np.abs(x).max() * v)

vo_t = {}
for e in EV:
    t, ty, v = e['t'], e['type'], e.get('v', 1.0)
    pan = e.get('pan', 0.0)
    if ty == 'vo': vo_t[e['id']] = t
    elif ty == 'stamp': add(fol, stamp(.55 * v), t, 1, pan)
    elif ty == 'stampbig': add(fol, stamp(1.15), t, 1, .2)
    elif ty == 'print': add(fol, squeegee(), t, 1, -.2); add(fol, stamp(.45), t + .3, 1, -.2)
    elif ty == 'plate': add(fol, stamp(.6) * (1 + .1 * e.get('k', 0)), t, 1, -.3 + .2 * e.get('k', 0))
    elif ty in ('pull', 'whoosh'): add(fol, f32(lp(whoosh(min(2.5, max(.3, e.get('d', .8))), 1.0), 2600) * .18), t, 1, 0)
    elif ty == 'cut': add(fol, flick(.7), t, 1, .1)
    elif ty == 'label': add(fol, flick(.5), t, 1, -.4)
    elif ty == 'slam': add(fol, stamp(1.3), t, 1, 0); add(fol, f32(lp(noise(.6), 200) * np.exp(-t_(.6) / .15) * .4), t, 1, 0)
    elif ty == 'thud': add(fol, f32(thump(v=.7, f=70))[:int(.3 * SR)] * .5, t, 1, 0)
    elif ty == 'creak': add(fol, f32(bp(noise(e.get('d', 1)), 300, 1400) * .05), t, 1, -.2)
    elif ty == 'rot': add(fol, crackle(e.get('d', 2.5)), t, 1, -.1)

# meledak = akhir 'rot' (event rot + durasinya)
bm = [e for e in EV if e['type'] == 'boom']
t_boom = bm[0]['t'] if bm else None
if t_boom: add(fol, boom(.9), t_boom, 1, 0); add(fol, stamp(1.2), t_boom, 1, 0)

# ---------------- musik ----------------
B = 60 / 112
end = [e['t'] for e in EV if e['type'] == 'end'][0]
prog = [(['C2', 'C3'], ['E4', 'G4', 'B4']), (['A1', 'A2'], ['C4', 'E4', 'G4']), (['F1', 'F2'], ['A3', 'C4', 'E4']), (['G1', 'G2'], ['B3', 'D4', 'F4'])]
mel = ['G5', 'E5', 'C5', 'E5', 'A5', 'G5', 'E5', None, 'F5', 'A5', 'C6', 'A5', 'G5', 'D5', 'B4', None]
def hush(t): return t_boom is not None and t_boom - 1.4 <= t < t_boom + .1
t = 0.0; k = 0
while t < end:
    bar = (k // 4) % 4; beat = k % 4
    bassn, ch = prog[bar]
    if not hush(t):
        if beat in (0, 2): add(music, note('contrabass_pizz', bassn[0] if beat == 0 else bassn[1], B * 1.2, vel=.7), t, .55, 0)
        if beat in (1, 3):
            for p in ch: add(music, note('vibraphone', p, B * 1.1, vel=.35), t + B * .5, .16, .25)
        sh = f32(hp(noise(.07), 5000) * np.exp(-t_(.07) / .02) * .12)
        add(music, sh, t, 1, .35); add(music, sh * .6, t + B * .5, 1, .35)
        if beat in (1, 3) and t > vo_t.get('L9', 1e9): add(music, f32(bp(noise(.08), 900, 3500) * np.exp(-t_(.08) / .025) * .25), t, 1, -.1)   # tepuk di akhir
        m = mel[(k * 2) % 16]
        if m and k % 2 == 0 and t > 3.6: add(music, note('marimba', m, B * .8, vel=.4), t, .2, .2)
    elif beat == 0:
        add(music, note('contrabass_pizz', 'C2', B * 3, vel=.4), t, .45, 0)
    t += B; k += 1
for i, p in enumerate(['C5', 'E5', 'G5', 'C6']): add(music, note('glockenspiel', p, 2.5, vel=.5), end + i * .06, .3, .2)
add(music, note('vibraphone', 'C4', 3.5, vel=.5), end, .3, -.2); add(music, note('contrabass_pizz', 'C2', 3, vel=.7), end, .5, 0)
if t_boom: add(music, note('glockenspiel', 'C6', 1.5, vel=.5), t_boom, .25, .3)
music = S.room(music, size=.32, mix=.15)

# ---------------- narasi ----------------
vox = np.zeros((N, 2), np.float32); spk = np.zeros(N, np.float32)
for i in range(1, 11):
    x, sr = sf.read(os.path.join(HERE, 'out', 'vo', f'l{i}.wav'), dtype='float32')
    if x.ndim > 1: x = x.mean(1)
    if sr != SR:
        import soxr; x = soxr.resample(x, sr, SR)
    x = compress(hp(x, 85) / (np.abs(x).max() + 1e-9) * .85, thr=.2, ratio=3.2)
    a = int(vo_t[f'L{i}'] * SR); n = min(len(x), N - a); vox[a:a + n] += f32(x[:n])[:, None]; spk[a:a + n] = 1
kk = int(.15 * SR); duck = np.convolve(np.maximum(spk, np.roll(spk, kk)), np.ones(kk) / kk, 'same')
rms = lambda x: float(np.sqrt(np.mean(np.square(x)) + 1e-12))
on = spk > 0
music = music - .4 * np.stack([bp(music[:, 0], 300, 4000), bp(music[:, 1], 300, 4000)], 1).astype(np.float32)
music *= (1 - .5 * duck)[:, None]; fol *= (1 - .4 * duck)[:, None]
vg = rms(music[on].mean(1)) * 10 ** (10 / 20) / rms(vox[on, 0])
mix = music + fol + vox * vg
mix = mix[:int(DUR * SR)]
mix = np.stack([compress(mix[:, c], thr=.3, ratio=2.5) for c in (0, 1)], 1)
ceil = rms(mix.mean(1)) * 10 ** (11 / 20)
mix = np.stack([limit(mix[:, c] / ceil * .9, .9) * ceil / .9 for c in (0, 1)], 1)
tt = np.arange(len(mix)) / SR; mix *= np.clip((DUR - tt) / .4, 0, 1)[:, None]
sf.write(os.path.join(HERE, 'out', 'mix.wav'), mix.astype(np.float32), SR)
open(os.path.join(HERE, 'out', 'music-credits.txt'), 'w', encoding='utf8').write('\n'.join(S.credits(['contrabass_pizz', 'vibraphone', 'marimba', 'glockenspiel'])))
print('mix', mix.shape)
