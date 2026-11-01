import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SEZIONI_QUALITA, sezioneQualita, preparaVoce, leggiMesi, scriviMesi, prossimaScadenza, statoScadenza, riepilogoQualita,
  prossimoNumeroNc, punteggi, livelloRischio, ordinaVoci, difettiFrequenti, chiaveImport, controllaFileQualita,
} from '../src/engine/qualita.js';
import { gruppoAttivo, MENU_GRUPPI } from '../src/server/views/layout.js';
import { cercaGuida } from '../src/engine/guida.js';

const S = (k: string) => sezioneQualita(k)!;
const OGGI = '2026-11-01';

test('qualità: sezioni con chiavi uniche, colonne e chiavi di caricamento tra i campi', () => {
  const chiavi = SEZIONI_QUALITA.map(s => s.chiave);
  assert.equal(new Set(chiavi).size, chiavi.length);
  for (const s of SEZIONI_QUALITA) {
    const campi = s.campi.map(c => c.chiave);
    for (const c of s.colonne) assert.ok(campi.includes(c) || ['prossima', 'opportunita', 'rischio'].includes(c), `${s.chiave}: colonna ${c}`);
    for (const c of s.chiaveImport) assert.ok(campi.includes(c), `${s.chiave}: chiave ${c}`);
    if (s.scadenza === 'campo') assert.ok(campi.includes(s.campoScadenza!), s.chiave);
    if (s.colonne.includes('prossima')) assert.ok(s.scadenza, `${s.chiave}: colonna scadenza senza regola`);
  }
});

test('qualità: il modulo si ripulisce (date, numeri con la virgola, MAIUSCOLO, scelte ammesse, obbligatori)', () => {
  const { dati, errore } = preparaVoce(S('strumenti'), { codice: ' rp017 ', descrizione: 'centralina  saldatore', frequenza_mesi: '12', ultima: '30/08/2015', esito: 'boh' });
  assert.equal(errore, null);
  assert.equal(dati.codice, 'RP017');
  assert.equal(dati.descrizione, 'CENTRALINA SALDATORE');
  assert.equal(dati.frequenza_mesi, 12);
  assert.equal(dati.ultima, '2015-08-30');
  assert.equal(dati.esito, 'positivo', 'scelta sconosciuta = la prima');
  assert.match(preparaVoce(S('strumenti'), { codice: 'X' }).errore!, /Strumento/);
  assert.equal(preparaVoce(S('rischi'), { oggetto: 'a', danno: '7,5' }).dati.danno, 7.5);
});

test('qualità: mesi previsti scritti in tanti modi', () => {
  assert.deepEqual(leggiMesi('1, 8'), [1, 8]);
  assert.deepEqual(leggiMesi('8;1;8'), [1, 8]);
  assert.deepEqual(leggiMesi('1-12'), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(leggiMesi('gennaio agosto'), [1, 8]);
  assert.deepEqual(leggiMesi('tutti i mesi').length, 12);
  assert.deepEqual(leggiMesi('13, 0, 5'), [5]);
  assert.equal(scriviMesi([2, 8]), 'feb, ago');
  assert.equal(scriviMesi([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), 'tutti i mesi');
});

test('qualità: prossima taratura = ultima + ogni quanti mesi; senza ultima scade oggi', () => {
  const s = S('strumenti');
  assert.equal(prossimaScadenza(s, { frequenza_mesi: 12, ultima: '2025-11-15' }, OGGI), '2026-11-15');
  assert.equal(prossimaScadenza(s, { frequenza_mesi: 6, ultima: '2026-08-31' }, OGGI), '2027-02-28');
  assert.equal(prossimaScadenza(s, { frequenza_mesi: 12 }, OGGI), OGGI);
  assert.equal(prossimaScadenza(s, { ultima: '2025-01-01' }, OGGI), null);
  assert.equal(statoScadenza(s, '2026-10-31', OGGI), 'scaduta');
  assert.equal(statoScadenza(s, '2026-11-15', OGGI), 'vicina');
  assert.equal(statoScadenza(s, '2027-01-15', OGGI), 'ok');
});

test('qualità: manutenzioni e ESD scadono nel mese previsto dopo l\'ultima volta', () => {
  const s = S('manutenzioni');
  assert.equal(prossimaScadenza(s, { mesi: [1, 8], ultima: '2026-01-20' }, OGGI), '2026-08-01');
  assert.equal(prossimaScadenza(s, { mesi: [1, 8], ultima: '2026-08-05' }, OGGI), '2027-01-01');
  assert.equal(prossimaScadenza(s, { mesi: [1, 8] }, OGGI), '2026-01-01', 'mai fatta: il primo mese previsto dell\'anno');
  assert.equal(statoScadenza(s, '2026-08-01', OGGI), 'scaduta');
  assert.equal(statoScadenza(s, '2026-11-01', OGGI), 'vicina', 'il mese in corso');
  assert.equal(statoScadenza(s, '2026-12-01', OGGI), 'vicina', 'il mese prossimo');
  assert.equal(statoScadenza(s, '2027-01-01', OGGI), 'ok');
});

test('qualità: le non conformità chiuse non scadono; numero NC-anno-progressivo', () => {
  const s = S('non_conformita');
  assert.equal(prossimaScadenza(s, { stato: 'aperta', scadenza_azione: '2026-10-01' }, OGGI), '2026-10-01');
  assert.equal(prossimaScadenza(s, { stato: 'chiusa', scadenza_azione: '2026-10-01' }, OGGI), null);
  assert.equal(prossimoNumeroNc([], 2026), 'NC-2026-001');
  assert.equal(prossimoNumeroNc(['NC-2026-004', 'NC-2025-010', null, 'RPC 1'], 2026), 'NC-2026-005');
});

test('qualità: punteggi dei rischi come la vecchia tabella (valore × frequenza)', () => {
  assert.deepEqual(punteggi({ vantaggio: 9, frequenza_o: 8, danno: 9, frequenza_r: 6 }), { opportunita: 72, rischio: 54 });
  assert.equal(livelloRischio(54), 'alto');
  assert.equal(livelloRischio(27), 'medio');
  assert.equal(livelloRischio(10), 'basso');
  const ordinati = ordinaVoci(S('rischi'), [
    { id: 1, dati: { danno: 2, frequenza_r: 2 } }, { id: 2, dati: { danno: 9, frequenza_r: 6 } }, { id: 3, dati: { danno: 5, frequenza_r: 5 } }]);
  assert.deepEqual(ordinati.map(v => v.id), [2, 3, 1], 'rischio più alto in cima');
});

test('qualità: cruscotto con scadute, vicine, non conformità aperte e difetti più frequenti', () => {
  const r = riepilogoQualita([
    { id: 1, sezione: 'strumenti', dati: { codice: 'RP017', descrizione: 'SALDATORE', frequenza_mesi: 12, ultima: '2015-08-30' } },
    { id: 2, sezione: 'manutenzioni', dati: { macchina: 'FORNO', intervento: 'FILTRI', mesi: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], ultima: '2026-10-10' } },
    { id: 3, sezione: 'non_conformita', dati: { numero: 'NC-2026-001', descrizione: 'CORTI', stato: 'aperta', difetto: '90' } },
    { id: 4, sezione: 'non_conformita', dati: { numero: 'NC-2026-002', descrizione: 'X', stato: 'chiusa', difetto: '90' } },
    { id: 5, sezione: 'difetti', dati: { codice: '10' } },
  ], OGGI);
  assert.equal(r.conteggi.strumenti, 1);
  assert.equal(r.conteggi.non_conformita, 2);
  assert.equal(r.ncAperte, 1);
  assert.deepEqual(r.scadute.map(x => x.id), [1]);
  assert.deepEqual(r.vicine.map(x => x.id), [2]);
  assert.match(r.scadute[0].titolo, /RP017/);
  assert.deepEqual(difettiFrequenti([{ difetto: '90', quantita_difettosa: 2 }, { difetto: '90', quantita_difettosa: 3 }, { difetto: '10' }]),
    [{ codice: '90', volte: 2, pezzi: 5 }, { codice: '10', volte: 1, pezzi: 0 }]);
});

test('qualità: caricare di nuovo il file aggiorna le stesse righe (chiave) e rifiuta sezioni sconosciute', () => {
  const s = S('manutenzioni');
  assert.equal(chiaveImport(s, { macchina: 'FORNO', identificazione: 'HB', intervento: 'FILTRI' }), chiaveImport(s, { macchina: 'forno', identificazione: 'hb', intervento: 'filtri', ultima: '2026-01-01' }));
  assert.notEqual(chiaveImport(s, { macchina: 'FORNO', intervento: 'A' }), chiaveImport(s, { macchina: 'FORNO', intervento: 'B' }));
  assert.throws(() => controllaFileQualita({ sezioni: { pippo: [] } }), /sconosciute/);
  assert.throws(() => controllaFileQualita({}), /sezioni/);
  assert.deepEqual(Object.keys(controllaFileQualita({ sezioni: { difetti: [{ codice: '10', descrizione: 'X' }] } }).sezioni), ['difetti']);
});

test('qualità: gruppo Qualità nel menu, sezione montata, guida', () => {
  const g = MENU_GRUPPI.find(x => x.chiave === 'qualita')!;
  assert.ok(g.voci.some(([, h]) => h === '/qualita'));
  for (const [, h] of g.voci.slice(1)) assert.ok(sezioneQualita(h.split('/')[2]), h);
  assert.equal(gruppoAttivo('qualita'), 'qualita');
  const index = readFileSync(new URL('../src/server/index.ts', import.meta.url), 'utf8');
  assert.match(index, /app\.use\('\/qualita', soloUfficio, rotteQualita\(\)\)/);
  assert.ok(cercaGuida('registrare un reclamo del cliente').slice(0, 2).some(r => r.argomento.id === 'non-conformita'));
  assert.ok(cercaGuida('taratura saldatore scaduta').slice(0, 2).some(r => r.argomento.id === 'tarature-manutenzioni'));
});
