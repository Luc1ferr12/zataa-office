"""Kapal Hantu Ourang Medan · score + foley + voice → out/mix.wav (run from the library root with $LIB/.venv/bin/python).
Percussion first, a wayang night: kendang (hand drum / log drum), gong ageng, small gong, metallophone bars in a pelog-like
scale (synthesised bronze), a synthetic nasal fiddle (rebab-like). Foley: rods on cloth, leather, lamp, fire, water.
"""
import json, os, sys
import numpy as np, soundfile as sf
HERE = os.path.dirname(os.path.abspath(__file__))
LIB = os.environ.get('LIB') or os.getcwd()
sys.path.insert(0, LIB)
from core.audio import sampler as S
from core.audio.sfx import SR, add, bp, lp, hp, noise, brown, clack, thump, whoosh, pop, compress, limit, t_

S.seed(23)
J = json.load(open(os.path.join(HERE, 'events.json'), encoding='utf8'))
DUR = J['dur']; EV = J['ev']
ev = lambda typ: [e for e in EV if e['type'] == typ]
first = lambda typ: ev(typ)[0]['t']
VOT = {e['id']: e['t'] for e in EV if e['type'] == 'vo'}
CUT = {e['id']: e['t'] for e in EV if e['type'] == 'cut'}
N = int((DUR + 1) * SR)
music = np.zeros((N, 2), np.float32); fol = np.zeros((N, 2), np.float32); vox = np.zeros((N, 2), np.float32)
rng = np.random.default_rng(9)
f32 = lambda x: np.asarray(x, np.float32)

# ------------------------------------------------------------------ voices
def bar(f, d=2.2, v=1.0):
    """struck bronze bar (saron-like): near-harmonic partials, beating pair, mallet click"""
    t = t_(d); x = np.zeros_like(t)
    for r, a, tau in [(1, 1, d * .4), (1.006, .5, d * .38), (2.76, .25, d * .12), (5.2, .1, d * .05)]:
        x += a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / tau)
    x[:240] += bp(noise(240 / SR), 2000, 6000)[:240] * np.exp(-np.arange(240) / 40) * .5
    return f32(x / np.abs(x).max() * v)

def gong(f=55, d=7.0, v=1.0, fall=-.03):
    """gong ageng: low hum with slow beating, pitch falling a little"""
    t = t_(d); ff = f * (1 + fall * (1 - np.exp(-t / 1.5)))
    ph = 2 * np.pi * np.cumsum(ff) / SR
    x = np.sin(ph) * np.exp(-t / (d * .5)) * (1 + .3 * np.sin(2 * np.pi * 1.3 * t)) + .45 * np.sin(2.01 * ph) * np.exp(-t / (d * .3)) + .2 * np.sin(2.76 * ph) * np.exp(-t / (d * .15))
    x[:600] += lp(noise(600 / SR), 400)[:600] * np.exp(-np.arange(600) / 120)
    return f32(x / np.abs(x).max() * v)

def rebab(notes, v=.25):
    """nasal fiddle: sawtooth with vibrato and slides, formant around 1.4 kHz"""
    d = sum(n[1] for n in notes); t = t_(d); f = np.zeros_like(t); i0 = 0
    for k, (hz, dur) in enumerate(notes):
        n = int(dur * SR); prev = notes[k - 1][0] if k else hz
        seg = np.linspace(0, 1, n); glide = np.clip(seg / .15, 0, 1)
        f[i0:i0 + n] = prev * (hz / prev) ** glide; i0 += n
    f = f[:len(t)] * (1 + .012 * np.sin(2 * np.pi * 5.5 * t) * np.clip(t / .4, 0, 1))
    ph = np.cumsum(f) / SR; x = 2 * (ph % 1) - 1
    x = bp(x, 500, 3500) + 1.4 * bp(x, 1200, 1700)
    env = np.minimum(1, t / .3) * np.minimum(1, (d - t) / .6)
    return f32(x / np.abs(x).max() * env * v)

def rod(v=.5):     # wooden rod tapping the cloth
    return f32(clack(1.3, v) * .7 + thump(.25, 180)[:len(clack(1.3, v))] * .3) if False else f32(clack(1.25, v))
def leather(d=.35, v=.4):   # dry hide flap
    t = t_(d); x = bp(noise(d), 300, 2500) * np.exp(-t / .07) + bp(noise(d), 120, 600) * np.exp(-t / .12) * .6
    return f32(x / np.abs(x).max() * v)
def roar(d, v=.4):
    t = t_(d); x = lp(brown(d), 900) + .3 * bp(noise(d), 1500, 4000) * (rng.random(len(t)) > .997)
    return f32(x / np.abs(x).max() * v * np.minimum(1, t / 1.2) * np.minimum(1, (d - t) / .2))
def morse_times(t0, dur):
    out = []; x = 0.0; unit = .12
    for ch in '... .- -.-- .-   -- .- - ..      ':
        d = 1 if ch == '.' else 3 if ch == '-' else 0
        if d: out.append((t0 + x, d * unit))
        if d: x += d * unit
        x += unit * (2 if ch == ' ' else 1)
        if x > dur: break
    return out

PELOG = [293.7, 311.1, 349.2, 440.0, 466.2, 587.3]   # D Eb F A Bb D (pelog-like)

# ------------------------------------------------------------------ I · the signal
for e in ev('morse'):
    for (tt, d) in morse_times(e['t'], e['dur']):
        add(fol, f32(bp(noise(d), 900, 1800) * .0 + np.sin(2 * np.pi * 820 * t_(d)) * np.minimum(1, t_(d) / .005) * np.minimum(1, (d - t_(d)) / .01) * .22), tt, 1, .2)
        add(fol, clack(1.6, .35), tt, .5, .2)
for e in ev('press'): add(fol, leather(.3, .5), e['t'], .8, -.1); add(fol, rod(.5), e['t'] + .12, .6, -.2)
add(music, gong(110, 4.0, .6, -.01), 1.4, .45, 0)                     # small gong as the title presses on
add(fol, whoosh(.6, .4), first('lift') - .1, .5, 0); add(fol, leather(.5, .4), first('lift'), .7, .3)

# ------------------------------------------------------------------ II · the sea and the radio room
sea0, sea1 = CUT['sea'] - .5, CUT['radio'] + .3
d = sea1 - sea0; bed = lp(brown(d), 350); bed = bed / np.abs(bed).max() * np.minimum(1, t_(d) / .6) * np.minimum(1, (d - t_(d)) / .4)
add(fol, f32(bed * .35), sea0, 1, 0)
BEAT = .9
t = CUT['sea']; k = 0
while t < CUT['dead'] - .2:
    if k % 4 == 0: add(music, S.hit('frame_drum', 'large_muted', .55).astype(np.float32), t, .5, -.3)
    if k % 2 == 1: add(music, bar(PELOG[(k * 3) % 5], 1.6, .8), t, .22, .35)
    t += BEAT; k += 1
add(music, rebab([(440, 1.2), (466.2, .9), (440, .8), (349.2, 1.6), (293.7, 2.4)], .18), CUT['sea'] + 1.5, 1, -.2)
for c in ('sea', 'radio', 'dead', 'fire', 'theory'): add(music, S.hit('log_drum', 'lo', .7).astype(np.float32), CUT[c], .7, -.2)
add(fol, f32(lp(noise(5.0), 600) * .02), CUT['radio'], 1, 0)            # radio-room hum

# ------------------------------------------------------------------ III · the deck of the dead (rebab sorrow, heartbeat drum)
for e in ev('tap'): add(fol, rod(.6), e['t'], .7, rng.uniform(-.4, .4))
crash = first('crash'); add(music, gong(147, 3.0, .9, .02), crash, .6, 0); add(music, S.hit('frame_drum', 'large', .9).astype(np.float32), crash, .8, 0)
add(music, rebab([(587.3, 1.4), (554.4, .8), (466.2, 1.2), (440, 1.0), (392, .9), (349.2, 2.2), (293.7, 2.8)], .2), CUT['dead'] + 1.2, 1, .2)
t = CUT['dead'] + .5
while t < CUT['fire'] - .3:                                             # heartbeat on the drum
    add(music, S.hit('frame_drum', 'large_muted', .45).astype(np.float32), t, .45, 0); add(music, S.hit('frame_drum', 'large_muted', .3).astype(np.float32), t + .28, .3, 0)
    t += 1.35
wind = lp(noise(CUT['fire'] - CUT['dead']), 500); add(fol, f32(wind / np.abs(wind).max() * .08), CUT['dead'], 1, .3)

# ------------------------------------------------------------------ IV · fire, silence, the gong, the sinking
fire = ev('fire')[0]; boom = first('boom'); still = ev('silence')[0]
add(fol, roar(still['t'] - fire['t'], .5), fire['t'], 1, .1)
for k in range(6): add(fol, whoosh(.4, .3), fire['t'] + k * .45, .5, rng.uniform(-.5, .5))   # lamps flaring one by one ("fwoomp")
t = fire['t']; gap = .45
while t < still['t'] - .05:                                            # kendang roll accelerating into the silence
    u = (t - fire['t']) / (still['t'] - fire['t'])
    add(music, S.hit('frame_drum', 'hand', .4 + .5 * u).astype(np.float32), t, .3 + .5 * u, rng.uniform(-.3, .3))
    t += gap; gap = max(.07, gap * .86)
add(music, gong(55, 8.0, 1.0, -.04), boom, 1.0, 0); add(music, S.hit('gong', None, .9).astype(np.float32), boom, .5, 0)
add(fol, thump(1.0, 45), boom, .9, 0); add(fol, roar(2.0, .7), boom, .8, 0)
sk = ev('sink')[0]; d = sk['dur']; gurgle = lp(brown(d), 260) * np.linspace(1, .2, int(round(d * SR)))
add(fol, f32(gurgle / np.abs(gurgle).max() * .4), sk['t'], 1, 0)
for k in range(10): add(fol, pop(.4), sk['t'] + .2 + k * .2 + rng.random() * .1, .25, rng.uniform(-.5, .5))

# ------------------------------------------------------------------ V · theory, backstage, the lamp snuffed
add(music, rebab([(293.7, 2.0), (311.1, 1.4), (293.7, 2.2)], .14), CUT['theory'] + .3, 1, -.3)
for k in range(4): add(music, bar(PELOG[k % 3], 2.0, .6), CUT['theory'] + .2 + k * .25, .2, .3)
back = first('back')
add(fol, f32(lp(noise(CUT['end'] - back), 300) * .05), back, 1, 0)     # backstage room tone
add(fol, f32(bp(noise(1.2), 800, 4000) * np.sin(np.pi * t_(1.2) / 1.2) * .15), back + .1, 1, -.4)   # cloth rustle
add(music, f32(np.sin(2 * np.pi * 73.4 * t_(6.5)) * np.minimum(1, t_(6.5) / 1.5) * np.minimum(1, (6.5 - t_(6.5)) / 1.0) * .25), back, .6, 0)
for k in range(3): add(fol, rod(.35), back + 1.3 + k * 1.6, .4, .5)
sn = first('snuff')
add(fol, f32(hp(noise(.5), 1500) * np.exp(-t_(.5) / .1) * .5), sn + .05, .6, 0)                 # "pfft"
add(fol, f32(bp(noise(1.5), 2500, 8000) * np.exp(-t_(1.5) / .5) * .08), sn + .1, 1, .2)        # wick sizzle
add(music, bar(293.7, 4.5, .8), first('press') if False else ev('press')[-1]['t'], .35, 0)
add(music, gong(55, 6.0, .7, -.03), ev('press')[-1]['t'] + .1, .5, 0)

# ------------------------------------------------------------------ voice: small-theatre reverb, compressed
dur = {}
for e in ev('vo'):
    x, sr = sf.read(os.path.join(HERE, 'out', 'vo', e['id'].lower() + '.wav'), dtype='float32')
    if x.ndim > 1: x = x.mean(1)
    if sr != SR:
        import soxr; x = soxr.resample(x, sr, SR)
    x = compress(x / (np.abs(x).max() + 1e-9) * .8, thr=.2, ratio=3.5)
    add(vox, f32(x), e['t'], 1, 0); dur[e['id']] = len(x) / SR
vox = S.room(vox, size=.3, mix=.12)

# ------------------------------------------------------------------ mix
tt = np.arange(N) / SR; under = np.zeros(N, np.float32)
for e in ev('vo'): under[(tt >= e['t'] - .15) & (tt < e['t'] + dur[e['id']] + .2)] = 1
k = int(.12 * SR); under = np.convolve(under, np.ones(k) / k, 'same')
duckM = 10 ** (-12 * under / 20); duckF = 10 ** (-4 * under / 20)
def rms(x): m = np.abs(x).max(1) > 1e-4; return np.sqrt(np.mean(x[m] ** 2)) if m.any() else 1
music *= .12 / max(rms(music), 1e-6); fol *= .10 / max(rms(fol), 1e-6); vox *= .45 / max(rms(vox), 1e-6)
music = S.room(music, size=.45, mix=.16)
mix = music * duckM[:, None] + fol * duckF[:, None] + vox
# hard silence before the explosion gong (the bed is cut, tails included), and before the last question
a, b = int(still['t'] * SR), int(boom * SR); mix[a - 120:a] *= np.linspace(1, 0, 120)[:, None]; mix[a:b] = 0
mix = mix[: int(DUR * SR)]
mix = mix / max(np.abs(mix).max(), 1e-6) * .9
mix = np.stack([limit(mix[:, ch], .95) for ch in range(2)], 1)
sf.write(os.path.join(HERE, 'out', 'mix.wav'), mix.astype(np.float32), SR)
print('mix', mix.shape, 'silence', still['t'], boom)
open(os.path.join(HERE, 'out', 'music-credits.txt'), 'w', encoding='utf8').write('\n'.join(S.credits(['frame_drum', 'log_drum', 'gong'])))
