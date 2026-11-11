import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controllaACarico, lamineComprate, leggiACarico, pezziFatturati, situazioneLamine, togliPezzi, type LaminaComprata } from '../src/engine/lamine-fatturazione.js';
import { elencoControlli, type DatiControlli } from '../src/engine/controlli.js';
import type { RigaClassificata } from '../src/engine/analisi-costi.js';

const comprata = (data: string, pezzi = 1): LaminaComprata => ({ data, fornitore: 'LOPAR', descrizione: 'LAMINA', pezzi, importo: 75 * pezzi });

test('lamine: le fatturate e le non da fatturare coprono le comprate dalla più vecchia', () => {
  const s = situazioneLamine([comprata('2026-03-01', 2), comprata('2026-10-20'), comprata('2026-09-01')], 1, [{ data: '2026-06-30', pezzi: 1, motivo: 'accordo' }], '2026-11-11');
  assert.equal(s.comprate, 4);
  assert.deepEqual(s.daFatturare.map(l => [l.data, l.pezzi]), [['2026-09-01', 1], ['2026-10-20', 1]]);
  assert.deepEqual(s.inRitardo.map(l => l.data), ['2026-09-01']);   // la lamina di 22 giorni fa non è ancora in ritardo
  // a carico prima del 2026 non conta; più fatturate che comprate = niente da fatturare
  assert.equal(situazioneLamine([comprata('2026-03-01')], 0, [{ data: '2025-12-01', pezzi: 1, motivo: 'x' }], '2026-11-11').daFatturare.length, 1);
  assert.equal(situazioneLamine([comprata('2026-03-01')], 5, [], '2026-11-11').daFatturare.length, 0);
  // una riga di 3 lamine coperta a metà
  assert.equal(situazioneLamine([comprata('2026-03-01', 3)], 2, [], '2026-11-11').daFatturare[0].pezzi, 1);
});

test('lamine comprate: categoria Lamine, descrizione da lamina, dal 2026, importo positivo', () => {
  const r = (data: string, descrizione: string, categoria = 'lamine', importo = 75, quantita: number | null = 1) =>
    ({ data, descrizione, categoria, importo, quantita, fornitore: 'LOPAR', anno: Number(data.slice(0, 4)) }) as unknown as RigaClassificata;
  const c = lamineComprate([r('2026-02-01', 'Lamina serigrafica', 'lamine', 150, 2), r('2026-02-01', 'Trasporto'), r('2026-02-01', 'circuito stampato cod. LA26-010'),
    r('2025-12-01', 'Lamina'), r('2026-02-01', 'Lamina', 'pcb'), r('2026-03-01', 'Lamina', 'lamine', -75)]);
  assert.deepEqual(c.map(l => [l.descrizione, l.pezzi]), [['Lamina serigrafica', 2], ['circuito stampato cod. LA26-010', 1]]);
});

test('lamine fatturate: a parte, dentro le una tantum, segnate a mano, NC in negativo, dal 2026', () => {
  const r = (data: string, descrizione: string, importo: number, quantita = 1, lamine: number | null = null, codice = '') => ({ anno: 0, data, codice, descrizione, quantita, importo, lamine });
  assert.equal(pezziFatturati([r('2026-02-01', 'Lamina serigrafica', 110), r('2026-02-01', 'Avvio produzione - programmazione - 2 lamine', 400),
    r('2026-03-01', 'Costi una tantum', 300, 1, 1), r('2026-04-01', 'Lamina', -110, -1), r('2025-12-01', 'Lamina', 110), r('2026-05-01', 'Lamina', 0)]), 3);
});

test('lamine: da non fatturare letti e controllati, pezzi già in bozza tolti', () => {
  assert.deepEqual(leggiACarico([{ data: '2026-06-30', pezzi: 3, motivo: 'Univac' }, { data: 'x', pezzi: 1 }, { data: '2026-01-01', pezzi: 0 }, null]), [{ data: '2026-06-30', pezzi: 3, motivo: 'Univac' }]);
  assert.equal(leggiACarico('niente').length, 0);
  assert.equal(controllaACarico('2026-06-30', '3', 'accordo'), null);
  assert.match(controllaACarico('', '3', 'accordo')!, /data/);
  assert.match(controllaACarico('2026-06-30', '0', 'accordo')!, /quante/);
  assert.match(controllaACarico('2026-06-30', '1', '')!, /motivo/);
  assert.deepEqual(togliPezzi([comprata('2026-01-01', 2), comprata('2026-02-01')], 1).map(l => l.pezzi), [1, 1]);
  assert.equal(togliPezzi([comprata('2026-01-01')], 3).length, 0);
});

test('controllo settimanale: lamine comprate da più di un mese senza fattura', () => {
  const vuoti: DatiControlli = { oggi: '2026-11-11', ddtDaFatturare: [], ordiniSenzaConsegna: [], prodottiSenzaPrezzo: [], clientiSenzaRecapitoSdi: [], fattureFornitoriSenzaScadenza: [],
    preventiviFermi: [], commesseOltreConsegna: [], tempiApertiVecchi: [] };
  assert.ok(!elencoControlli(vuoti).some(c => c.chiave === 'lamine-da-fatturare'));
  const c = elencoControlli({ ...vuoti, lamineNonFatturate: [{ data: '2026-09-30', fornitore: 'I-TRONIK', descrizione: 'LAMINA ZELFLEX', pezzi: 1, giorni: 42 }] }).find(x => x.chiave === 'lamine-da-fatturare')!;
  assert.equal(c.livello, 'urgente');
  assert.match(c.righe[0].testo, /1 lamina · I-TRONIK/);
  assert.match(c.righe[0].dettaglio!, /30\/09\/2026, 42 gg fa/);
});
