"""Dry up a TTS line: single-channel WPE dereverb + gentle tail gate + presence EQ.
python dry.py in.wav out.wav"""
import sys, numpy as np, soundfile as sf
from nara_wpe.wpe import wpe
from nara_wpe.utils import stft, istft
from scipy.signal import butter, sosfilt
x, sr = sf.read(sys.argv[1]); x = x.mean(1) if x.ndim > 1 else x
Y = stft(x[None], size=1024, shift=256).transpose(2, 0, 1)
Z = wpe(Y, taps=12, delay=3, iterations=5, statistics_mode='full').transpose(1, 2, 0)
y = istft(Z, size=1024, shift=256)[0][:len(x)]
# gate: duck frames well below the local speech level (kills the smeared tail)
h = 256; n = len(y) // h; fr = y[:n*h].reshape(n, h); e = 20*np.log10(np.sqrt((fr**2).mean(1)) + 1e-9)
g = np.clip((e - (e.max() - 38)) / 10, 0, 1) ** 1.5
g = np.convolve(g, np.ones(3)/3, 'same'); y[:n*h] = (fr * g[:, None]).ravel()
y = sosfilt(butter(2, 90, 'hp', fs=sr, output='sos'), y)
pres = sosfilt(butter(2, [2500, 5000], 'bp', fs=sr, output='sos'), y); y = y + .25 * pres
y = y / np.abs(y).max() * .9
sf.write(sys.argv[2], y.astype(np.float32), sr)
