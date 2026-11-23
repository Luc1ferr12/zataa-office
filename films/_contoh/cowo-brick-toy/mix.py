"""Rel Kereta & Kerikil (Brick Toy) · score + foley + voice → out/mix.wav (run from the library root with $LIB/.venv/bin/python).
Small acoustic playful score (pizzicato, marimba, glockenspiel, kalimba), cut dead at every failure; plastic foley: brick clicks
(transient + resonances near 2.9 and 4.6 kHz), creak before a failure, a crash of many clacks, a pour of gravel bricks, a bell ding.
"""
import json, os, sys
import numpy as np, soundfile as sf
HERE = os.path.dirname(os.path.abspath(__file__))
LIB = os.environ.get('LIB') or os.getcwd()
sys.path.insert(0, LIB)
from core.audio import sampler as S
from core.audio.sfx import SR, add, bp, lp, hp, noise, brown, thump, whoosh, pop, compress, limit, t_

S.seed(41)
J = json.load(open(os.path.join(HERE, 'events.json'), encoding='utf8'))
DUR = J['dur']; EV = J['ev']
ev = lambda typ: [e for e in EV if e['type'] == typ]
first = lambda typ: ev(typ)[0]['t']
VO = {e['id']: e['t'] for e in EV if e['type'] == 'vo'}
N = int((DUR + 1) * SR)
music = np.zeros((N, 2), np.float32); fol = np.zeros((N, 2), np.float32); vox = np.zeros((N, 2), np.float32)
rng = np.random.default_rng(8)
f32 = lambda x: np.asarray(x, np.float32)
note = lambda *a, **k: S.note(*a, **k).astype(np.float32)

def click(v=.6):                     # one brick snapping home
    d = .09; t = t_(d); x = bp(noise(d), 2000, 9000) * np.exp(-t / .004)
    for f, a, tau in [(2900 * rng.uniform(.95, 1.05), .7, .018), (4600 * rng.uniform(.95, 1.05), .45, .012), (1350, .25, .01)]: x += a * np.sin(2 * np.pi * f * t) * np.exp(-t / tau)
    return f32(x / np.abs(x).max() * v)
def creak(d=.5, v=.3):               # plastic under stress
    t = t_(d); f = 180 + 60 * np.sin(2 * np.pi * 3 * t); ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sign(np.sin(ph)) * (rng.random(len(t)) > .6) * bp(noise(d), 600, 3000)
    return f32(x / (np.abs(x).max() + 1e-9) * v * np.sin(np.pi * t / d))
def crash(d=1.2, n=40, v=.8):        # many bricks clattering down
    out = np.zeros(int(d * SR), np.float32)
    for k in range(n):
        s = int(min(d - .1, rng.exponential(.18)) * SR); c = click(rng.uniform(.3, 1)); e = min(len(out), s + len(c)); out[s:e] += c[:e - s]
    th = f32(lp(noise(.3), 300) * np.exp(-t_(.3) / .06) * .6)[:len(out)]; out[:len(th)] += th
    return out / np.abs(out).max() * v
def pour(d=1.9, v=.7):
    out = np.zeros(int(d * SR), np.float32)
    for k in range(220):
        s = int(rng.uniform(0, d - .1) ** 1.2 / d ** .2 * SR); c = click(rng.uniform(.15, .7)); e = min(len(out), s + len(c)); out[s:e] += c[:e - s]
    return out / np.abs(out).max() * v
def rumble(d, v=.4):
    t = t_(d); x = lp(brown(d), 200) + .3 * bp(noise(d), 400, 1200) * (.5 + .5 * np.sin(2 * np.pi * 7 * t))
    return f32(x / np.abs(x).max() * v * np.minimum(1, t / .6) * np.minimum(1, (d - t) / .6))
def rain(d, v=.25):
    out = np.zeros(int(d * SR), np.float32)
    for k in range(int(d * 40)): s = int(rng.uniform(0, d - .1) * SR); c = click(rng.uniform(.1, .4)); e = min(len(out), s + len(c)); out[s:e] += c[:e - s]   # plastic drops
    hs = f32(hp(noise(d), 3000) * .05)[:len(out)]; out[:len(hs)] += hs
    return out / np.abs(out).max() * v * f32(np.minimum(1, t_(d) / .6) * np.minimum(1, (d - t_(d)) / .6))[:len(out)]
def bell(f=1568, d=2.5, v=.6):
    t = t_(d); x = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / (d * k)) for r, a, k in [(1, 1, .5), (2.0, .5, .3), (2.76, .3, .2), (5.4, .15, .1)])
    return f32(x / np.abs(x).max() * v)

BPM = 116; B = 60 / BPM
fails = [e['t'] for e in ev('fail')]
sil = ev('silence')[0]
def muted(t): return any(f - .05 <= t < f + 1.0 for f in fails) or (sil['t'] - .1 <= t < sil['t'] + sil['dur'] + .5)
bass = ['C2', 'G2', 'A2', 'E2', 'F2', 'C2', 'F2', 'G2']
chords = [['E4', 'G4', 'C5'], ['D4', 'G4', 'B4'], ['C4', 'E4', 'A4'], ['B3', 'E4', 'G4'], ['A3', 'C4', 'F4'], ['G3', 'C4', 'E4'], ['A3', 'C4', 'F4'], ['B3', 'D4', 'G4']]
mel = ['G5', 'E5', 'C5', 'E5', 'G5', 'A5', 'G5', 'E5', 'F5', 'A5', 'G5', 'E5', 'D5', 'E5', 'C5', None]
t = VO['L1'] - .3; k = 0
while t < DUR - 3.4:
    if not muted(t):
        bar = (k // 4) % 8
        if k % 2 == 0: add(music, note('contrabass_pizz', bass[bar] if k % 4 == 0 else bass[(bar + 1) % 8], .5, vel=.6), t, .7, -.15)
        if k % 2 == 1:
            for p in chords[bar]: add(music, note('marimba', p, .3, vel=.42), t, .22, .25)
        m = mel[k % 16]
        if m and k % 2 == 0 and (k // 16) % 2 == 1: add(music, note('glockenspiel', m, .4, vel=.4), t, .18, .35)
    t += B; k += 1

for e in ev('click'): add(fol, click(.55), e['t'], .6, rng.uniform(-.5, .5)); add(music, note('kalimba', ['C6', 'D6', 'E6', 'G6', 'A6', 'C7'][e['n'] % 6], .3, vel=.45), e['t'], .18, rng.uniform(-.3, .3))
for e in ev('cheer'): add(music, note('glockenspiel', 'G6', .4, vel=.6), e['t'], .3, .3); add(music, note('glockenspiel', 'C7', .5, vel=.6), e['t'] + .12, .3, .3)
for e in ev('train'): add(fol, rumble(e['dur'], .5), e['t'], 1, 0)
for e in ev('rain'): add(fol, rain(e['dur'], .3), e['t'], 1, 0)
for f in fails: add(fol, creak(.6, .35), f - .6, 1, .1); add(fol, crash(1.2, 36, .8), f, 1, 0)
for e in ev('slab'): add(fol, thump(.7, 90), e['t'], .7, 0); add(fol, click(.8), e['t'] + .02, .6, 0)
for e in ev('five'): add(fol, click(.9), e['t'], .7, 0); add(music, note('vibraphone', 'E5', .8, vel=.5), e['t'], .35, 0)
for e in ev('crack'): add(fol, f32(bp(noise(.4), 1500, 7000) * np.exp(-t_(.4) / .04) * .9), e['t'], 1, .1)
p = ev('pour')[0]; add(fol, pour(p['dur'], .8), p['t'], 1, 0)
for k2, pp in enumerate(['C5', 'E5', 'G5', 'C6', 'E6', 'G6', 'C7']): add(music, note('harp', pp, .8, vel=.55), p['t'] + .3 + k2 * .07, .35, -.4 + k2 * .12)
dr = ev('drain')[0]
for k2 in range(18): add(fol, click(.25), dr['t'] + .1 + k2 * .13, .4, rng.uniform(-.5, .5))
for e in ev('tick'): add(music, note('xylophone', ['C6', 'E6', 'G6', 'C7'][e['n']], .4, vel=.6), e['t'], .35, .3)
tp = ev('tamp')[0]
for k2 in range(8): add(fol, thump(.5, 140), tp['t'] + k2 * .22, .4, 0); add(fol, crash(.25, 6, .3), tp['t'] + k2 * .22, .6, 0)
tt0 = first('title'); add(music, note('vibraphone', 'C4', 3.0, vel=.55), tt0, .5, -.2)
for pp in ['E4', 'G4', 'C5', 'E5']: add(music, note('vibraphone', pp, 3.0, vel=.5), tt0 + .04, .35, .2)
add(music, bell(1568, 2.6, .7), first('ding'), .5, .2)

dur = {}
for e in ev('vo'):
    x, sr = sf.read(os.path.join(HERE, 'out', 'vo', e['id'].lower() + '.wav'), dtype='float32')
    if x.ndim > 1: x = x.mean(1)
    if sr != SR:
        import soxr; x = soxr.resample(x, sr, SR)
    x = compress(x / (np.abs(x).max() + 1e-9) * .8, thr=.2, ratio=3.5)
    add(vox, f32(x), e['t'], 1, 0); dur[e['id']] = len(x) / SR

tt = np.arange(N) / SR; under = np.zeros(N, np.float32)
for e in ev('vo'): under[(tt >= e['t'] - .12) & (tt < e['t'] + dur[e['id']] + .15)] = 1
kk = int(.1 * SR); under = np.convolve(under, np.ones(kk) / kk, 'same')
def rms(x): m = np.abs(x).max(1) > 1e-4; return np.sqrt(np.mean(x[m] ** 2)) if m.any() else 1
music *= .14 / max(rms(music), 1e-6); fol *= .11 / max(rms(fol), 1e-6); vox *= .5 / max(rms(vox), 1e-6)
music = S.room(music, size=.35, mix=.14)
mix = music * (10 ** (-4.4 * under / 20))[:, None] * .75 + fol * (10 ** (-4 * under / 20))[:, None] + vox      # music ducked ~40 % under the voice
a, b = int(sil['t'] * SR), int((sil['t'] + sil['dur']) * SR); mix[a:b] *= .06
mix = mix[: int(DUR * SR)]
mix = mix / max(np.abs(mix).max(), 1e-6) * .9
mix = np.stack([limit(mix[:, ch], .95) for ch in range(2)], 1)
sf.write(os.path.join(HERE, 'out', 'mix.wav'), mix.astype(np.float32), SR)
print('mix', mix.shape)
open(os.path.join(HERE, 'out', 'music-credits.txt'), 'w', encoding='utf8').write('\n'.join(S.credits(['contrabass_pizz', 'marimba', 'kalimba', 'glockenspiel', 'xylophone', 'harp', 'vibraphone'])))
