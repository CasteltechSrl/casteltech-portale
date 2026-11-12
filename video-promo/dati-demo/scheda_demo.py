"""Genera i file INVENTATI di una scheda demo (Gerber, foratura, BOM, pick and place) per il video.
Uso: python3 scheda_demo.py <cartella_di_uscita>
Scheda "NE-MC410" di Nordelettra (cliente finto), 80 x 60 mm, SMD sopra e sotto + qualche THT.
Fiducial FID1-3. Due errori voluti per il video: R7 con valore diverso tra BOM e pick and place, C12 nella BOM ma non nel pick and place.
"""
import os, random, sys

random.seed(410)
out = sys.argv[1]
os.makedirs(out, exist_ok=True)
L, H = 80.0, 60.0

comp = []  # (ref, valore, impronta, x, y, rot, lato, mpn, produttore, tht_pins)
def add(ref, val, fp, x, y, rot=0, lato='top', mpn='', prod='', pins=None):
    comp.append(dict(ref=ref, val=val, fp=fp, x=x, y=y, rot=rot, lato=lato, mpn=mpn, prod=prod, pins=pins))

add('U1', 'STM32G431CBT6', 'LQFP-48_7x7mm_P0.5mm', 40, 32, 0, mpn='STM32G431CBT6', prod='ST')
add('U2', 'TJA1051T/3', 'SOIC-8_3.9x4.9mm_P1.27mm', 62, 40, 90, mpn='TJA1051T/3,118', prod='NXP')
add('U3', 'AP2112K-3.3', 'SOT-23-5', 18, 46, 0, mpn='AP2112K-3.3TRG1', prod='Diodes')
add('U4', 'DRV8701', 'VQFN-24_4x4mm_P0.5mm', 58, 18, 0, mpn='DRV8701PRGER', prod='TI')
add('Y1', '8MHz', 'Crystal_SMD_3225-4Pin', 30, 22, 0, mpn='ABM8-8.000MHZ-B2-T', prod='Abracon')
vals_r = ['10K', '4K7', '1K', '100R', '22R', '47K', '2K2', '330R']
k = 0
for i in range(1, 25):
    v = vals_r[i % len(vals_r)]
    x, y = (14 + (i % 8) * 7.5, 10 + (i // 8) * 6) if i < 16 else (24 + (i - 16) * 5, 56)
    add(f'R{i}', v, 'R_0603_1608Metric', x, y, 90 if i % 3 == 0 else 0, mpn=f'RC0603FR-07{v}L', prod='Yageo')
vals_c = ['100nF', '1uF', '10uF', '22pF', '4.7uF']
for i in range(1, 31):
    v = vals_c[i % len(vals_c)]
    fp = 'C_0402_1005Metric' if v in ('100nF', '22pF') else 'C_0603_1608Metric'
    x, y = (24 + (i % 10) * 3.6, 40 + (i // 10) * 3.2) if i < 20 else (24 + (i - 20) * 3.0, 26)
    add(f'C{i}', v, fp, x, y, 0 if i % 2 else 90, mpn=f'GRM-{v}', prod='Murata')
for i in range(1, 5):
    add(f'D{i}', 'LED verde', 'LED_0603_1608Metric', 70, 10 + i * 4, 180, mpn='150060GS75000', prod='Wurth')
for i in range(40, 48):
    add(f'C{i}', '100nF', 'C_0402_1005Metric', 34 + (i - 40) * 2.2, 32, 90, lato='bottom', mpn='GRM155R71C104KA88', prod='Murata')
add('Q1', 'BSC010N04', 'TDSON-8', 50, 50, 0, lato='bottom', mpn='BSC010N04LS', prod='Infineon')
add('Q2', 'BSC010N04', 'TDSON-8', 58, 50, 0, lato='bottom', mpn='BSC010N04LS', prod='Infineon')
# THT
add('J1', 'Conn 2x05', 'PinHeader_2x05_P2.54mm', 8, 20, 0, mpn='61201021621', prod='Wurth', pins=[(8 + c * 2.54, 20 + r * 2.54) for r in range(5) for c in range(2)])
add('J2', 'Morsetto 3 poli', 'TerminalBlock_P5.08mm_3', 72, 52, 0, mpn='691137710003', prod='Wurth', pins=[(66 + i * 5.08, 54) for i in range(3)])
add('C31', '470uF 35V', 'CP_Radial_D10.0mm_P5.00mm', 10, 50, 0, mpn='EEU-FR1V471', prod='Panasonic', pins=[(8, 50), (13, 50)])

# ── pad per impronta ──
def pads(c):
    fp, x, y = c['fp'], c['x'], c['y']
    if '0402' in fp: return [(x - .5, y, .6, .5), (x + .5, y, .6, .5)]
    if '0603' in fp: return [(x - .8, y, .9, .95), (x + .8, y, .9, .95)]
    if 'SOT-23' in fp: return [(x - .95, y + 1.1, .6, .9), (x, y + 1.1, .6, .9), (x + .95, y + 1.1, .6, .9), (x - .95, y - 1.1, .6, .9), (x + .95, y - 1.1, .6, .9)]
    if 'SOIC-8' in fp: return [(x - 2.7, y - 1.905 + i * 1.27, 1.5, .6) for i in range(4)] + [(x + 2.7, y - 1.905 + i * 1.27, 1.5, .6) for i in range(4)]
    if 'LQFP-48' in fp:
        p = []
        for i in range(12):
            o = -2.75 + i * .5
            p += [(x - 4.2, y + o, 1.4, .3), (x + 4.2, y + o, 1.4, .3), (x + o, y - 4.2, .3, 1.4), (x + o, y + 4.2, .3, 1.4)]
        return p
    if 'VQFN' in fp:
        p = [(x, y, 2.6, 2.6)]
        for i in range(6):
            o = -1.25 + i * .5
            p += [(x - 2, y + o, .8, .25), (x + 2, y + o, .8, .25), (x + o, y - 2, .25, .8), (x + o, y + 2, .25, .8)]
        return p
    if '3225' in fp: return [(x - 1.1, y - .8, 1.4, 1.2), (x + 1.1, y - .8, 1.4, 1.2), (x - 1.1, y + .8, 1.4, 1.2), (x + 1.1, y + .8, 1.4, 1.2)]
    if 'TDSON' in fp: return [(x - .95 + i * 1.27 - .95, y - 2.8, .7, 1) for i in range(4)] + [(x, y + .8, 4.2, 3.6)]
    if c['pins']: return [(px, py, 1.7, 1.7) for px, py in c['pins']]
    return []

def gerber(nome, funzione, lato, solo_pad=True, piste=False, contorno=False, pasta=False):
    ap, righe = {}, []
    def apertura(w, h):
        k = (round(w, 3), round(h, 3))
        if k not in ap: ap[k] = 20 + len(ap)
        return ap[k]
    def c(v): return str(int(round(v * 1e6)))
    if contorno:
        righe += ['D12*', f'X{c(0)}Y{c(0)}D02*', f'X{c(L)}Y{c(0)}D01*', f'X{c(L)}Y{c(H)}D01*', f'X{c(0)}Y{c(H)}D01*', f'X{c(0)}Y{c(0)}D01*']
    else:
        for cp in comp:
            tht = bool(cp['pins'])
            if (cp['lato'] != lato and not tht) or (pasta and tht): continue
            for px, py, w, h in pads(cp):
                righe += [f'D{apertura(w, h)}*', f'X{c(px)}Y{c(H - py)}D03*']
        if lato == 'top' and not pasta:
            for fx, fy in ((3, 3), (77, 3), (3, 57)):
                righe += [f'D{apertura(1.0, 1.0)}*', f'X{c(fx)}Y{c(H - fy)}D03*']
        if piste:
            righe.append('D11*')
            smd = [cp for cp in comp if cp['lato'] == lato and not cp['pins']]
            for _ in range(140 if lato == 'top' else 40):
                a, b = random.sample(smd, 2)
                (ax, ay, *_), (bx, by, *_) = pads(a)[0], pads(b)[-1]
                righe += [f'X{c(ax)}Y{c(H - ay)}D02*', f'X{c(bx)}Y{c(H - ay)}D01*', f'X{c(bx)}Y{c(H - by)}D01*']
    testa = ['G04 Scheda demo per il video (dati inventati)*', f'%TF.FileFunction,{funzione}*%', '%FSLAX46Y46*%', '%MOMM*%', '%LPD*%',
             '%ADD11C,0.250000*%', '%ADD12C,0.150000*%']
    testa += [f'%ADD{n}R,{w:.6f}X{h:.6f}*%' for (w, h), n in ap.items()]
    open(os.path.join(out, nome), 'w').write('\n'.join(testa + righe + ['M02*']) + '\n')

gerber('NE-MC410-F_Cu.gbr', 'Copper,L1,Top', 'top', piste=True)
gerber('NE-MC410-B_Cu.gbr', 'Copper,L2,Bot', 'bottom', piste=True)
gerber('NE-MC410-F_Paste.gbr', 'Paste,Top', 'top', pasta=True)
gerber('NE-MC410-B_Paste.gbr', 'Paste,Bot', 'bottom', pasta=True)
gerber('NE-MC410-F_Mask.gbr', 'Soldermask,Top', 'top')
gerber('NE-MC410-B_Mask.gbr', 'Soldermask,Bot', 'bottom')
gerber('NE-MC410-Edge_Cuts.gbr', 'Profile,NP', 'top', contorno=True)

# foratura: vias + piedini THT
via = [(random.uniform(5, L - 5), random.uniform(5, H - 5)) for _ in range(90)]
tht = [p for cp in comp if cp['pins'] for p in cp['pins']]
dr = ['M48', 'METRIC,TZ', 'T1C0.300', 'T2C1.000', '%', 'G90', 'G05', 'T1'] + [f'X{x:.3f}Y{H - y:.3f}' for x, y in via] + ['T2'] + [f'X{x:.3f}Y{H - y:.3f}' for x, y in tht] + ['M30']
open(os.path.join(out, 'NE-MC410-PTH.drl'), 'w').write('\n'.join(dr) + '\n')

# pick and place KiCad (.pos): R7 con un valore diverso, C12 mancante (errori voluti)
pos = ['### Module positions - created for demo', '## Unit = mm, Angle = deg.', '## Side : All',
       '# Ref     Val       Package                PosX       PosY       Rot  Side']
for cp in comp:
    if cp['pins'] or cp['ref'] == 'C12': continue
    val = '47K' if cp['ref'] == 'R7' else cp['val']
    pos.append(f"{cp['ref']:<8} {val.replace(' ', '_'):<9} {cp['fp']:<22} {cp['x']:>9.4f} {-cp['y']:>10.4f} {cp['rot']:>8.4f}  {cp['lato']}")
for n, (fx, fy) in enumerate(((3, 3), (77, 3), (3, 57)), 1):
    pos.append(f'FID{n:<5} Fiducial  Fiducial_1mm           {fx:>9.4f} {-fy:>10.4f} {0:>8.4f}  top')
pos.append('## End')
open(os.path.join(out, 'NE-MC410-all.pos'), 'w').write('\n'.join(pos) + '\n')

# BOM raggruppata per valore
gruppi = {}
for cp in comp:
    gruppi.setdefault((cp['val'], cp['fp'], cp['mpn'], cp['prod']), []).append(cp['ref'])
b = ['"Reference","Value","Footprint","Qty","Manufacturer","MPN"']
for (val, fp, mpn, prod), refs in gruppi.items():
    b.append(f'"{",".join(refs)}","{val}","{fp}","{len(refs)}","{prod}","{mpn}"')
open(os.path.join(out, 'NE-MC410_BOM_revB.csv'), 'w').write('\n'.join(b) + '\n')
print(f'{len(comp)} componenti scritti in {out}')
