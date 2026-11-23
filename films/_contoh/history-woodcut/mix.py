"""Mesin Antikythera · score + foley + voice → out/mix.wav (run from the library root with $LIB/.venv/bin/python).
Score: low strings, wood and skin, a bowed-saw drone; the bronze (modal metal) is withheld until the first gear is carved.
"""
import json, os, sys
import numpy as np, soundfile as sf
HERE = os.path.dirname(os.path.abspath(__file__))
LIB = os.environ.get('LIB') or os.getcwd()
sys.path.insert(0, LIB)
from core.audio import sampler as S
from core.audio.sfx import SR, add, bp, lp, hp, noise, brown, clack, thump, whoosh, pop, compress, limit, t_, env_exp

S.seed(11)
EV = json.load(open(os.path.join(HERE, 'events.json'), encoding='utf8'))
DUR = EV['dur']; EV = EV['ev']
ev = lambda typ: [e for e in EV if e['type'] == typ]
first = lambda typ: ev(typ)[0]['t']
K = {e['id']: e['t'] for e in EV if e['type'] in ('vo', 'cut')}
N = int((DUR + 1) * SR)
music = np.zeros((N, 2), np.float32); fol = np.zeros((N, 2), np.float32); vox = np.zeros((N, 2), np.float32)
rng = np.random.default_rng(5)
BEAT = 60 / 72

# ------------------------------------------------------------------ synth voices
def metal(f, d=3.0, v=1.0, bright=1.0):
    """struck bronze: inharmonic partials + hammer transient"""
    t = t_(d); x = np.zeros_like(t)
    for k, (r, a, tau) in enumerate([(1, 1, d * .45), (2.76, .55, d * .22), (5.40, .32 * bright, d * .1), (8.93, .18 * bright, d * .05), (13.3, .08 * bright, d * .03)]):
        x += a * np.sin(2 * np.pi * f * r * t * (1 + .0004 * k) + k) * np.exp(-t / tau)
    hit = bp(noise(.02), 1500, 7000) * np.exp(-t_(.02) / .004)
    x[:len(hit)] += hit * .6
    return (x / np.abs(x).max() * v).astype(np.float32)

def saw(f, d, v=.25, vib=5.2):
    """bowed saw: near-sine with slow wide vibrato and a breathy edge"""
    t = t_(d); ph = 2 * np.pi * np.cumsum(f * (1 + .012 * np.sin(2 * np.pi * vib * t / 5 + .3) + .004 * np.sin(2 * np.pi * vib * t))) / SR
    x = np.sin(ph) + .08 * np.sin(2 * ph) + .02 * lp(noise(d), 2500)
    e = np.minimum(1, t / 1.6) * np.minimum(1, (d - t) / 1.8)
    return (x * e * v).astype(np.float32)

def hum(d, v=.2):
    t = t_(d); x = np.sin(2 * np.pi * 55 * t) + .5 * np.sin(2 * np.pi * 110 * t) + .25 * np.sin(2 * np.pi * 165 * t)
    return (x * np.minimum(1, t / .4) * np.minimum(1, (d - t) / .4) * v).astype(np.float32)

def knife(d, v=.5):
    """knife into wood: fibre tearing, band-passed noise that follows the cut speed"""
    t = t_(d); x = bp(noise(d), 1200, 5200) * (0.4 + .6 * np.abs(np.sin(2 * np.pi * 3.1 * t + rng.random() * 6)))
    return (x * np.minimum(1, t / .02) * np.minimum(1, (d - t) / .05) * v).astype(np.float32)

def paper(d, v=.5):
    t = t_(d); x = bp(noise(d), 400, 6000) * np.sin(np.pi * t / d) ** .7
    return (x * v).astype(np.float32)

def S_note(*a, **k):
    return S.note(*a, **k).astype(np.float32)

# ------------------------------------------------------------------ I · the lump, the sea, the museum (no metal yet)
carve = first('carve')
for k in range(26):                                                   # the knife carving the lump
    add(fol, knife(.05 + .1 * rng.random(), .32), carve + k * .065 + .02 * rng.random(), 1, rng.uniform(-.5, .5))
crack = first('crack')
add(fol, clack(.7, .9), crack, .8, .25); add(fol, knife(.45, .55), crack, 1, .2)
add(fol, whoosh(.25, .4), first('snap') - .12, .5, 0); add(fol, thump(.6, 60), first('snap'), .55, 0)
add(music, saw(587.3, 16.2, .16), .25, 1, -.15)                       # D5 drone over the first act
for i, (tt, nn) in enumerate([(K['sea'] + .0, 'D2'), (K['sea'] + 2 * BEAT, 'A1'), (K['sea'] + 4 * BEAT, 'D2'), (K['sea'] + 6 * BEAT, 'F2'), (K['sea'] + 8 * BEAT, 'E2'), (K['sea'] + 10 * BEAT, 'D2')]):
    add(music, S_note('contrabass_pizz', nn, 1.5, vel=.6), tt, .8, -.1)
add(music, S_note('contrabass', 'D2', 8.6, vel=.35, attack=1.2), K['sea'] + .2, .45, .1)
for c in ('sea', 'museum'): add(music, S.hit('log_drum', 'lo', .75).astype(np.float32), K[c], .7, -.3)
sea0, sea1 = K['sea'] - .4, K['museum'] + .25                          # J-cut: the sea is heard before it is seen
d = sea1 - sea0; bed = lp(brown(d), 380) * np.minimum(1, t_(d) / .4) * np.minimum(1, (d - t_(d)) / .3)
add(fol, (bed / np.abs(bed).max() * .35).astype(np.float32), sea0, 1, 0)
for k in range(38):                                                   # bubbles from the helmet
    tb = K['sea'] + .1 + k * .22 + .35
    if tb < K['museum'] - .2 and rng.random() < .55: add(fol, pop(.35 + .3 * rng.random()), tb, .22, .2)
add(fol, thump(.5, 90), K['museum'] + 1.2, .3, 0)                     # the pedestal, one knock
room = lp(noise(4.3), 900) * .02; add(fol, room.astype(np.float32), K['museum'], 1, 0)

# ------------------------------------------------------------------ II · the X-ray (first metal when the first gear is carved)
scan = ev('scan')[0]
add(fol, hum(scan['dur'] + .6, .16), scan['t'], 1, 0)
sd = scan['dur']; hiss = hp(noise(sd), 3500) * .06 * np.minimum(1, t_(sd) / .3) * np.minimum(1, (sd - t_(sd)) / .3)
add(fol, hiss.astype(np.float32), scan['t'], 1, .3)
gears = sorted(ev('gear'), key=lambda e: e['t'])
for e in gears:
    f = {185: 196.0, 95: 293.7, 72: 392.0, 52: 523.3, 34: 698.5}.get(e['r'], 440)
    add(music, metal(f, 3.2 if e['r'] > 90 else 1.8, 1.0), e['t'], .5 if e['r'] > 90 else .3, rng.uniform(-.5, .5))
main = [e for e in gears if e['r'] == 185][0]['t']
ost = ['D3', 'A2', 'D3', 'F3', 'E3', 'A2', 'D3', 'C3']
t = main; i = 0
while t < first('total') - .3:                                        # cello pizz ostinato, eighths
    add(music, S_note('cellos_pizz', ost[i % 8], .5, vel=.5 + .1 * (i % 2 == 0)), t, .55, .25 if i % 2 else -.25)
    t += BEAT / 2; i += 1

# ------------------------------------------------------------------ III · the cosmos: gears tick, the sky turns
crank = first('crank'); add(fol, clack(.8, .8), crank, .5, -.2)
t = crank; b = 0
while t < K['eclipse'] - .05:
    add(music, S.hit('woodblock', 'b' if b % 4 else 'a', .55).astype(np.float32), t, .3, .35)
    if b % 4 == 0: add(music, metal(587.3, 1.2, 1, .7), t, .1, -.3)
    t += BEAT; b += 1
add(music, metal(880, 2.4, 1, 1.2), first('sun'), .22, -.4); add(music, metal(659.3, 2.4, 1, 1.2), first('moon'), .2, .4)
add(music, metal(440, 3.0), first('align'), .32, 0)
sky = ev('skycarve')[0]
for k in range(14): add(fol, knife(.05, .2), sky['t'] + k * .11, 1, rng.uniform(-.7, .7))
add(music, S_note('cellos', 'D2', 7.0, vel=.45, attack=2.0), K['eclipse'] - 2.2, .6, 0)
add(music, S_note('contrabass', 'D2', 6.0, vel=.4, attack=2.0), K['eclipse'] - 1.0, .5, 0)
tot, cor = first('total'), first('corona')
t = K['eclipse'] - .4; k = 0
while t < tot - .05:                                                  # timpani roll building into totality
    u = (t - (K['eclipse'] - .4)) / (tot - K['eclipse'] + .4)
    add(music, S.hit('timpani', 'drum1', .25 + .6 * u).astype(np.float32), t, .25 + .45 * u, rng.uniform(-.2, .2))
    t += .11 - .04 * u; k += 1
# totality: digital silence from tot to cor (applied after the mix), then the tam-tam
add(music, S.hit('gong', None, .95).astype(np.float32), cor, 1.0, 0)
add(music, metal(98.0, 6.0, 1, .8), cor, .55, .1)
add(music, S.hit('gran_cassa', None, .9).astype(np.float32) if 'gran_cassa' in S.instruments() else thump(1, 50), cor, .7, 0)

# ------------------------------------------------------------------ IV · a thousand years in three prints
peel = ev('peel')[0]
add(fol, paper(peel['dur'], .35), peel['t'], 1, .3); add(fol, (lp(noise(.5), 1400) * np.exp(-t_(.5) / .15) * .3).astype(np.float32), peel['t'] + peel['dur'] - .45, 1, -.2)
for e in ev('print'):
    add(music, S.hit('frame_drum', 'large', .75).astype(np.float32), e['t'], .7, -.2)
    add(fol, paper(.35, .25), e['t'] - .3, 1, .4)
add(music, saw(440.0, 8.0, .12), K['prints'] + 1.0, 1, .15)
for i, nn in enumerate(['D2', 'A1', 'C2', 'D2']): add(music, S_note('contrabass_pizz', nn, 1.5, vel=.5), K['prints'] + 1.2 + i * 2 * BEAT, .65, -.1)

# ------------------------------------------------------------------ V · back to the lump; one bronze ring left
add(music, metal(196.0, 7.0, 1, .6), first('lastglint'), .35, .1)
add(music, saw(293.7, DUR - K['end'] - .2, .12), K['end'] + .2, 1, -.1)
add(fol, (lp(noise(DUR - K['end']), 700) * .015).astype(np.float32), K['end'], 1, 0)

# ------------------------------------------------------------------ voice
dur = {}
for e in ev('vo'):
    x, sr = sf.read(os.path.join(HERE, 'out', 'vo', e['id'].lower() + '.wav'), dtype='float32')
    if x.ndim > 1: x = x.mean(1)
    if sr != SR:
        import soxr; x = soxr.resample(x, sr, SR)
    x = compress(x / (np.abs(x).max() + 1e-9) * .8, thr=.2, ratio=3.5)
    add(vox, x.astype(np.float32), e['t'], 1, 0); dur[e['id']] = len(x) / SR

# ------------------------------------------------------------------ mix: ducking, balance, silences
tt = np.arange(N) / SR; under = np.zeros(N, np.float32)
for e in ev('vo'): under[(tt >= e['t'] - .15) & (tt < e['t'] + dur[e['id']] + .2)] = 1
k = int(.12 * SR); under = np.convolve(under, np.ones(k) / k, 'same')
duckM = 10 ** (-8 * under / 20); duckF = 10 ** (-5 * under / 20)
def rms(x): return np.sqrt(np.mean(x[np.abs(x).max(1) > 1e-4] ** 2)) if np.any(np.abs(x) > 1e-4) else 1
music *= .5 / max(rms(music), 1e-6) * .18; fol *= .5 / max(rms(fol), 1e-6) * .14; vox *= .5 / max(rms(vox), 1e-6) * .55
mix = music * duckM[:, None] + fol * duckF[:, None] + vox
mix = S.room(mix, size=.42, mix=.14)
# near-silence before the X-ray, true digital silence at totality
ms = (tt >= 16.9) & (tt < scan['t'] - .3); mix[ms] *= .25
a, b2 = int(tot * SR), int(cor * SR); mix[a - 240:a] *= np.linspace(1, 0, 240)[:, None]; mix[a:b2] = 0
mix = mix[: int(DUR * SR)]
mix = mix / max(np.abs(mix).max(), 1e-6) * .9
mix = np.stack([limit(mix[:, ch], .95) for ch in range(2)], 1)
sf.write(os.path.join(HERE, 'out', 'mix.wav'), mix.astype(np.float32), SR)
print('mix', mix.shape, 'peak', float(np.abs(mix).max()), 'silence', tot, cor)
used = ['contrabass_pizz', 'contrabass', 'cellos_pizz', 'cellos', 'log_drum', 'woodblock', 'timpani', 'gong', 'frame_drum', 'gran_cassa']
open(os.path.join(HERE, 'out', 'music-credits.txt'), 'w', encoding='utf8').write('\n'.join(S.credits(used)))
