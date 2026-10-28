/**
 * Stampa della documentazione di produzione dai documenti del cliente (Adriano 28/10/2026), A4 orizzontale:
 *  - SMD TOP / SMD BOT: disegno del lato (rame chiaro, serigrafia, contorno) con i riferimenti, piedino 1 se c'è il CAD,
 *    componenti critici in rosso; sotto la BOM del lato (solo SMD) con note del cliente e segnalazioni.
 *  - THT: solo i THT, stesso colore per i componenti uguali, legenda con note e segnalazioni.
 *  - Protezioni per l'onda: lato saldature (specchiato), fori e zone segnate dall'ufficio, numerati.
 * Il disegno viene dal lettore Gerber del portale (solo numeri e forme); i testi passano da html`` (protetti).
 */
import { html, raw, data, num, type Raw } from './html.js';
import { VERSIONE } from './layout.js';
import type { AnalisiScheda } from '../../engine/scheda/analisi.js';
import { latoFoglio, righeFoglio, TITOLI_FOGLIO, type Foglio, type RigaMontaggio } from '../../engine/scheda/documentazione.js';
import type { Lato } from '../../engine/scheda/pick-place.js';
import type { Disegno, StratoDisegno } from '../schede-cliente-servizio.js';

export interface Protezioni { fori: { x: number; y: number; d: number }[]; zone: { x0: number; y0: number; x1: number; y1: number }[] }

const f3 = (n: number) => String(Math.round(n * 1000) / 1000);

/** Strati da mostrare per il foglio: contorno, rame del lato, serigrafia del lato (il primo file di ciascuno). */
function stratiFoglio(d: Disegno, lato: Lato, foglio: Foglio): { s: StratoDisegno; classe: string }[] {
  const primo = (ruolo: string, l: Lato | null) => d.strati.find(s => s.ruolo === ruolo && (l == null || s.lato === l));
  const out: { s: StratoDisegno; classe: string }[] = [];
  const rame = primo('rame', lato) ?? (d.strati.filter(s => s.ruolo === 'rame').length === 1 ? primo('rame', null) : undefined);
  if (rame) out.push({ s: rame, classe: 'st-rame' });
  const seri = primo('serigrafia', lato);
  if (seri && foglio !== 'protezioni') out.push({ s: seri, classe: 'st-serigrafia' });
  const contorno = primo('contorno', null);
  if (contorno) out.push({ s: contorno, classe: 'st-contorno' });
  return out;
}

function svgFoglio(a: AnalisiScheda, d: Disegno, foglio: Foglio, righe: RigaMontaggio[], prot: Protezioni | null): Raw {
  const r = d.riquadro;
  if (!r) return html`<p>Disegno non disponibile (mancano i Gerber).</p>`;
  const lato = latoFoglio(a, foglio);
  const bot = lato === 'BOT';
  const m = Math.max(r.x1 - r.x0, r.y1 - r.y0) * 0.03;
  const w = r.x1 - r.x0 + 2 * m, h = r.y1 - r.y0 + 2 * m;
  const vx = bot ? -(r.x1 + m) : r.x0 - m, vy = -(r.y1 + m);
  const P = (x: number, y: number) => `x="${f3(bot ? -x : x)}" y="${f3(-y)}"`;
  const C = (x: number, y: number) => `cx="${f3(bot ? -x : x)}" cy="${f3(-y)}"`;
  // grandezza delle scritte: dalla scheda, ma più piccola dove i componenti sono fitti (distanza tipica dal più vicino)
  const punti = righe.flatMap(rg => rg.componenti.map(c => c.pp)).filter((p): p is NonNullable<typeof p> => !!p);
  const vicini = punti.length > 1 && punti.length <= 3000
    ? punti.map(p => Math.min(...punti.filter(q => q !== p).map(q => Math.hypot(q.x - p.x, q.y - p.y)))).sort((x, y) => x - y)
    : [];
  const mediana = vicini.length ? vicini[Math.floor(vicini.length / 2)] : Infinity;
  const fs = Math.min(1.6, Math.max(0.3, Math.min(Math.hypot(w, h) * 0.009, mediana * 0.45)));
  const strati = stratiFoglio(d, lato, foglio);
  const segni: string[] = [];
  const testo = (x: number, y: number, t: string, classe: string, dy = 0) =>
    `<text ${P(x, y)} dy="${f3(dy)}" font-size="${f3(fs)}" stroke-width="${f3(fs * 0.22)}" class="${classe}">${t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))}</text>`;
  if (foglio === 'protezioni') {
    const fori = d.forature.filter(x => x.metallizzato !== false && x.d >= 0.7);
    for (const fo of fori) segni.push(`<circle ${C(fo.x, fo.y)} r="${f3(Math.max(fo.d / 2, 0.2))}" class="foro"/>`);
    (prot?.zone ?? []).forEach((z, i) => {
      const x = bot ? -z.x1 : z.x0;
      segni.push(`<rect x="${f3(x)}" y="${f3(-z.y1)}" width="${f3(z.x1 - z.x0)}" height="${f3(z.y1 - z.y0)}" class="zona"/>`);
      segni.push(testo((z.x0 + z.x1) / 2, (z.y0 + z.y1) / 2, `Z${i + 1}`, 'etichetta protetta', fs * 0.35));
    });
    (prot?.fori ?? []).forEach((fo, i) => {
      segni.push(`<circle ${C(fo.x, fo.y)} r="${f3(Math.max(fo.d / 2, 0.3) + fs * 0.35)}" class="protetto" stroke-width="${f3(fs * 0.25)}"/>`);
      segni.push(testo(fo.x, fo.y + Math.max(fo.d / 2, 0.3) + fs * 0.9, String(i + 1), 'etichetta protetta'));
    });
  } else {
    for (const riga of righe) for (const c of riga.componenti) {
      if (!c.pp) continue;
      const critico = c.segnalazioni.length > 0 || riga.note.length > 0;
      if (riga.colore) segni.push(`<circle ${C(c.pp.x, c.pp.y)} r="${f3(fs * 0.8)}" fill="${riga.colore}" class="segno-tht"/>`);
      if (critico) segni.push(`<circle ${C(c.pp.x, c.pp.y)} r="${f3(fs * 1.5)}" class="cerchio-critico" stroke-width="${f3(fs * 0.15)}"/>`);
      if (c.pin1) segni.push(`<circle ${C(c.pin1.x, c.pin1.y)} r="${f3(fs * 0.3)}" class="pin1"/>`);
      segni.push(testo(c.pp.x, c.pp.y, c.ref, `etichetta${critico ? ' critico' : ''}`, riga.colore ? -fs * 0.95 : fs * 0.35));
    }
  }
  return raw(`<svg class="disegno-stampa" xmlns="http://www.w3.org/2000/svg" viewBox="${f3(vx)} ${f3(vy)} ${f3(w)} ${f3(h)}">
<defs>${strati.map(x => x.s.defs).join('')}</defs>
<g transform="${bot ? 'scale(-1,-1)' : 'scale(1,-1)'}">${strati.map(x => `<g class="${x.classe}" fill="currentColor">${x.s.corpo}</g>`).join('')}</g>
<g class="segni">${segni.join('')}</g></svg>`);
}

export function paginaStampa(p: { id: number; nome: string; cliente: string | null }, a: AnalisiScheda, d: Disegno, foglio: Foglio, prot: Protezioni | null): string {
  const righe = righeFoglio(a, foglio);
  const lato = latoFoglio(a, foglio);
  const totale = righe.reduce((s, r) => s + r.quantita, 0);
  const legenda = foglio === 'protezioni'
    ? html`Vista dal lato ${lato} (lato saldature, specchiato). In magenta i fori e le zone da proteggere prima dell'onda; in grigio gli altri fori metallizzati.`
    : html`Vista dal lato ${lato}${lato === 'BOT' ? ' (specchiato, come si vede girando la scheda)' : ''}. ${a.componenti.some(c => c.pin1) ? html`<span class="pallino-pin1"></span> piedino 1 (dal file CAD); ` : ''}il verso dei componenti polarizzati si legge anche sulla serigrafia. In rosso i componenti con note o segnalazioni.`;
  const tabella = foglio === 'protezioni'
    ? html`<table class="bom-stampa"><thead><tr><th>N.</th><th>Cosa</th><th>Posizione (mm)</th><th>Misura</th></tr></thead><tbody>
        ${(prot?.fori ?? []).map((fo, i) => html`<tr><td>${i + 1}</td><td>Foro</td><td>X ${num(fo.x, 2)} · Y ${num(fo.y, 2)}</td><td>Ø ${num(fo.d, 2)} mm</td></tr>`)}
        ${(prot?.zone ?? []).map((z, i) => html`<tr><td>Z${i + 1}</td><td>Zona</td><td>X ${num(z.x0, 1)}–${num(z.x1, 1)} · Y ${num(z.y0, 1)}–${num(z.y1, 1)}</td><td>${num(z.x1 - z.x0, 1)} × ${num(z.y1 - z.y0, 1)} mm</td></tr>`)}
        ${!(prot?.fori.length || prot?.zone.length) ? html`<tr><td colspan="4">Nessuna protezione segnata: si segnano sul disegno della pagina dei documenti («Segna le protezioni»).</td></tr>` : ''}
      </tbody></table>`
    : html`<table class="bom-stampa"><thead><tr>${foglio === 'THT' ? html`<th></th>` : ''}<th>Item</th><th>Q.tà</th><th>Riferimenti</th><th>Valore</th><th>Codice cliente</th><th>Impronta</th><th>Note di montaggio / segnalazioni</th><th>✓</th></tr></thead><tbody>
        ${righe.map(rg => html`<tr class="${rg.critico ? 'critico' : ''}">
          ${rg.colore ? html`<td class="campione">${raw(`<svg viewBox="0 0 10 10" width="12" height="12"><circle cx="5" cy="5" r="5" fill="${rg.colore}"/></svg>`)}</td>` : ''}
          <td>${rg.item}</td><td>${rg.quantita}</td><td class="refs">${rg.refs.join(', ')}</td><td>${rg.valore}</td><td class="codice">${rg.codice}</td><td>${rg.impronta}</td>
          <td>${rg.note.map(n => html`<div class="nota-cliente">${n}</div>`)}${rg.segnalazioni.map(s => html`<div class="segnalazione">⚠ ${s}</div>`)}</td><td class="spunta"></td></tr>`)}
      </tbody></table>`;
  return String(html`<!doctype html>
<html lang="it"><head><meta charset="utf-8"><title>${TITOLI_FOGLIO[foglio]} · ${p.nome}</title>
<link rel="icon" href="/static/favicon.svg"><link rel="stylesheet" href="/static/stampa-scheda.css?v=${VERSIONE}"></head>
<body>
<div class="barra-stampa"><button id="stampa">Stampa / salva PDF</button> <a href="/preventivi/documenti/${p.id}">← torna ai documenti</a>
  ${(['TOP', 'BOT', 'THT', 'protezioni'] as Foglio[]).map(x => x === foglio ? html`<b>${TITOLI_FOGLIO[x]}</b>` : html`<a href="?foglio=${x}">${TITOLI_FOGLIO[x]}</a>`)}</div>
<section class="pagina">
  <header class="testata-doc"><img src="/static/logo-casteltech.png" alt="Casteltech" class="logo">
    <div class="titolo-doc">${TITOLI_FOGLIO[foglio]}<span>${p.nome}${p.cliente ? ` · ${p.cliente}` : ''}</span></div>
    <div class="dati-doc">${foglio === 'protezioni' ? html`${(prot?.fori.length ?? 0)} fori · ${(prot?.zone.length ?? 0)} zone` : html`${totale} componenti · ${righe.length} codici`}<br>${data(new Date())}</div></header>
  ${svgFoglio(a, d, foglio, righe, prot)}
  <p class="legenda">${legenda}</p>
</section>
<section class="pagina tabella">${tabella}</section>
<script src="/static/stampa.js?v=${VERSIONE}" defer></script>
</body></html>`);
}
