/**
 * Per i preventivi che non coincidono: controlla se i totali salvati sono "vecchi",
 * cioè calcolati prima che qualcuno modificasse i dati (il vecchio portale ricalcolava
 * e salvava i totali solo aprendo la pagina "calcola", non salvando la modifica).
 * Confronta i tempi/costi di fase salvati con quelli ottenuti dai dati attuali.
 */
import { readFileSync } from 'node:fs';
import { calcolaPreventivo } from '../src/engine/calcolo.js';
import { FASI_LEGACY, VOCI_LEGACY, daDocumentoLegacy } from '../src/catalogo/legacy.js';

const docs: any[] = JSON.parse(readFileSync(process.argv[2], 'utf8'));
let coerentiConDatiAttuali = 0, totaliVecchi = 0;
const spiegati: Record<string, number> = {};
const nonSpiegati: string[] = [];
for (const d of docs) {
  const { tariffe, input } = daDocumentoLegacy(d);
  const r = calcolaPreventivo(FASI_LEGACY, VOCI_LEGACY, tariffe, input);
  const tf = d.totaliFinali;
  if (Math.abs(tf.totalePrimoLotto - r.totali.totalePrimoLotto) < 0.001 && Math.abs(tf.guadagnoAlotto - r.totali.guadagnoLotto) < 0.001) { coerentiConDatiAttuali++; continue; }
  const motivi: string[] = [];
  for (const f of r.fasi) {
    const s = d.fase?.[f.codice]?.CustomSchema;
    if (s && Math.abs((s.secNecessariPerUnaPCB ?? 0) - f.secondiCiclo) > 0.01) { motivi.push('tempi di fase cambiati'); break; }
  }
  for (const v of r.voci) {
    const s = d.fase3?.[v.codice]?.CustomSchema2;
    if (s && Math.abs((s.costi ?? 0) - v.costo) > 0.001) { motivi.push('costi materiali/spedizione cambiati'); break; }
  }
  const ut = ['programmazionePep', 'programmazioneAoi', 'programmazioneArmadi', 'programmazioneSerigrafia', 'preparazioneDocne'];
  const salvUT = ut.reduce((a, k) => a + (d.fase2?.[k]?.CustomUnaTantum?.costi ?? 0), 0);
  const attUT = r.fasi.filter(f => f.unaTantum).reduce((a, f) => a + f.costo, 0);
  if (Math.abs(salvUT - attUT) > 0.01) motivi.push('costi una tantum cambiati');
  const coppie = [...Object.values(d.fase3 ?? {}).map((x: any) => x?.CustomSchema2), ...Object.values(d.fase2 ?? {}).map((x: any) => x?.CustomUnaTantum)];
  if (coppie.some((c: any) => c?.costi > 1 && c.prezzoTotale && Math.abs(c.prezzoTotale / c.costi - tariffe.ricarico) > 0.01)) motivi.push('ricarico cambiato');
  if (motivi.length) { totaliVecchi++; for (const m of motivi) spiegati[m] = (spiegati[m] ?? 0) + 1; }
  else nonSpiegati.push(`${d._id.$oid} ${d.cliente} ${d.codice} ${d.data?.$date?.slice(0, 10)} salvato ${tf.totalePrimoLotto} nuovo ${r.totali.totalePrimoLotto}`);
}
console.log({ coerentiConDatiAttuali, totaliVecchi, motivi: spiegati, nonSpiegati: nonSpiegati.length });
console.log(nonSpiegati.join('\n'));
