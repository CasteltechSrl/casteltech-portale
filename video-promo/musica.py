"""Musica di sottofondo generata (niente diritti d'autore): pad morbido + arpeggio + battito leggero.
Uso: python3 musica.py <durata_secondi> <uscita.wav>
Prima parte (problema, 0-6 s) più cupa e tesa, poi dal "reveal" accordi aperti e ritmo.
"""
import sys, wave
import numpy as np

DUR = float(sys.argv[1]); OUT = sys.argv[2]
SR = 44100
t = np.arange(int(DUR * SR)) / SR
rng = np.random.default_rng(3)
BPM = 104; beat = 60 / BPM; bar = beat * 4
REVEAL = 10.0  # secondi: entra il ritmo

def nota(n):  # numero MIDI -> Hz
    return 440 * 2 ** ((n - 69) / 12)

# progressione (MIDI): Am, F, C, G -> sensazione positiva e moderna
ACCORDI = [[57, 60, 64, 69], [53, 57, 60, 65], [48, 55, 60, 64], [55, 59, 62, 67]]
mix = np.zeros_like(t)

# pad: onde morbide con leggero detune, inviluppo per ogni battuta
for i in range(int(DUR / bar) + 1):
    a0 = i * bar; acc = ACCORDI[i % 4] if a0 >= REVEAL - bar else [57, 60, 63, 69]
    s = (t >= a0) & (t < a0 + bar + 0.6)
    tt = t[s] - a0
    env = np.minimum(1, tt / 0.5) * np.exp(-np.maximum(0, tt - bar) * 4)
    for n in acc:
        f = nota(n)
        v = np.sin(2 * np.pi * f * tt) + 0.5 * np.sin(2 * np.pi * f * 1.003 * tt) + 0.25 * np.sin(2 * np.pi * f * 2 * tt)
        mix[s] += 0.05 * env * v

# arpeggio pluck dopo il reveal
step = beat / 2
for k in range(int(DUR / step)):
    a0 = k * step
    if a0 < REVEAL: continue
    acc = ACCORDI[int(a0 / bar) % 4]
    n = acc[[0, 2, 1, 3, 2, 1, 3, 2][k % 8]] + 12
    s = (t >= a0) & (t < a0 + 0.5)
    tt = t[s] - a0
    mix[s] += 0.045 * np.exp(-tt * 9) * (np.sin(2 * np.pi * nota(n) * tt) + 0.3 * np.sin(2 * np.pi * nota(n) * 3 * tt))

# basso e battito leggero
for k in range(int(DUR / beat)):
    a0 = k * beat
    if a0 < REVEAL: continue
    s = (t >= a0) & (t < a0 + 0.35)
    tt = t[s] - a0
    f = 50 * np.exp(-tt * 18) + 45
    mix[s] += 0.22 * np.exp(-tt * 10) * np.sin(2 * np.pi * np.cumsum(f) / SR)  # cassa morbida
    if k % 2 == 1:  # charleston leggero in levare
        s2 = (t >= a0 + beat / 2) & (t < a0 + beat / 2 + 0.05)
        mix[s2] += 0.02 * rng.standard_normal(s2.sum()) * np.exp(-(t[s2] - a0 - beat / 2) * 80)
    root = ACCORDI[int(a0 / bar) % 4][0] - 12
    s3 = (t >= a0) & (t < a0 + beat * 0.9)
    tt3 = t[s3] - a0
    mix[s3] += 0.07 * np.exp(-tt3 * 2.5) * np.sin(2 * np.pi * nota(root) * tt3)

# tensione iniziale: rumore filtrato che sale fino al reveal, poi "whoosh"
s = t < REVEAL
noise = np.convolve(rng.standard_normal(s.sum()), np.ones(40) / 40, mode='same')
mix[s] += 0.05 * (t[s] / REVEAL) ** 2 * noise

# dissolvenza finale e normalizzazione
fade = np.clip((DUR - t) / 3.0, 0, 1); mix *= fade
mix *= np.clip(t / 0.8, 0, 1)
mix = mix / np.max(np.abs(mix)) * 0.8
stereo = np.stack([mix, np.roll(mix, 220)], axis=1)
with wave.open(OUT, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((stereo * 32767).astype(np.int16).tobytes())
print('musica scritta', OUT)
