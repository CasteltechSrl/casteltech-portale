import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codiciDiversiPerAnno, codiciPerAnno, fatturatoPerAnno, giorniMediIncasso, situazioneIncassi } from '../src/engine/scheda-cliente.js';

test('scheda cliente: fatturato per anno = fatture meno note di credito, fuori bozze/annullate/scartate, ultimi 3 anni', () => {
  const docs = [
    { tipo: 'fattura', anno: 2026, data: '2026-03-01', stato: 'consegnato', imponibile: 1000, totale: 1220 },
    { tipo: 'nota_credito', anno: 2026, data: '2026-04-01', stato: 'consegnato', imponibile: 100, totale: 122 },
    { tipo: 'fattura', anno: 2026, data: '2026-05-01', stato: 'bozza', imponibile: 999, totale: 0 },
    { tipo: 'fattura', anno: 2026, data: '2026-05-02', stato: 'scartato', imponibile: 999, totale: 0 },
    { tipo: 'ddt', anno: 2026, data: '2026-05-03', stato: 'emesso', imponibile: 500, totale: 500 },
    { tipo: 'fattura', anno: 2025, data: '2025-03-01', stato: 'consegnato', imponibile: 800, totale: 976 },
    { tipo: 'fattura', anno: 2022, data: '2022-03-01', stato: 'consegnato', imponibile: 5, totale: 6 },
  ];
  assert.deepEqual(fatturatoPerAnno(docs, 2026), [{ anno: 2024, importo: 0 }, { anno: 2025, importo: 800 }, { anno: 2026, importo: 900 }]);
});

test('scheda cliente: incassi scaduti e a scadere, giorni medi di incasso', () => {
  const rate = [
    { data: '2026-10-01', importo: 100, pagata: false }, { data: '2026-10-20', importo: 50, pagata: false },
    { data: '2026-12-01', importo: 300, pagata: false }, { data: '2026-09-01', importo: 70, pagata: true },
  ];
  assert.deepEqual(situazioneIncassi(rate, '2026-11-02'), { scaduto: 150, scaduteN: 2, aScadere: 300, aScadereN: 1 });
  assert.equal(giorniMediIncasso([{ dataFattura: '2026-01-01', pagataIl: '2026-03-02' }, { dataFattura: '2026-02-01', pagataIl: '2026-03-03' }, { dataFattura: '2026-05-01', pagataIl: null }]), 45);
  assert.equal(giorniMediIncasso([{ dataFattura: '2026-05-01', pagataIl: null }]), null);
});

test('scheda cliente: la nota di credito aperta toglie dal credito ma non conta come rata (Adriano 1/11/2026)', () => {
  const r = situazioneIncassi([{ data: '2026-10-01', importo: 1000, pagata: false }, { data: '2026-10-01', importo: -200, pagata: false }], '2026-11-02');
  assert.deepEqual(r, { scaduto: 800, scaduteN: 1, aScadere: 0, aScadereN: 0 });
});

test('scheda cliente: codici prodotti per anno = DDT di vendita/reso lavorato + fatture senza DDT, fuori servizi, resi e garanzie (Adriano 5/11/2026)', () => {
  const righe = [
    { tipo: 'ddt', anno: 2026, codice: 'WPAJZERO6', descrizione: 'JZERO6\nOrdine 112', quantita: 300, causale: 'RESO LAVORATO' },
    { tipo: 'ddt', anno: 2026, codice: 'wpajzero6', descrizione: 'JZERO6', quantita: 100, causale: 'RESO LAVORATO' },
    { tipo: 'ddt', anno: 2026, codice: 'WPAJZERO6', descrizione: 'JZERO6', quantita: 5, causale: 'Reso da riparazione in garanzia' },
    { tipo: 'ddt', anno: 2026, codice: '', descrizione: 'CSM10uD25VP', quantita: 1000, causale: 'RESO NON LAVORATO' },
    { tipo: 'ddt', anno: 2026, codice: '001', descrizione: 'LAMINA SERIGRAFICA', quantita: 2, causale: 'RESO LAVORATO' },
    { tipo: 'ddt', anno: 2026, codice: 'WPACAMJR3', descrizione: 'CAMJR3\nMontaggio e spedizione', quantita: 50, causale: '' },
    { tipo: 'ddt', anno: 2025, codice: '', descrizione: 'PCBA JZERO6\nMontaggio e spedizione', quantita: 20, causale: 'RESO LAVORATO' },
    { tipo: 'ddt', anno: 2025, codice: 'WPACAMJR3', descrizione: 'CAMJR3', quantita: 540, causale: 'VENDITA' },
    { tipo: 'ddt', anno: 2023, codice: 'WPAVECCHIO', descrizione: 'vecchio', quantita: 9, causale: 'RESO LAVORATO' },
    { tipo: 'fattura', anno: 2026, codice: 'WPAJZERO6', descrizione: 'JZERO6', quantita: 300, citaDdt: true },
    { tipo: 'fattura', anno: 2026, codice: 'WPACAMJR3', descrizione: 'CAMJR3', quantita: 35, ddtId: 7 },
    { tipo: 'fattura', anno: 2026, codice: 'WPADIRETTO', descrizione: 'Fatturato senza DDT', quantita: 10 },
    { tipo: 'fattura', anno: 2026, codice: 'UT-LAMINA', descrizione: 'Lamina', quantita: 1 },
    { tipo: 'fattura', anno: 2026, codice: 'SPED', descrizione: 'SPEDIZIONE', quantita: 1, prodottoId: 3, descrizioneAnagrafica: 'SPEDIZIONE DEDICATA' },
  ];
  const r = codiciPerAnno(righe, 2026);
  assert.deepEqual(r.anni, [2024, 2025, 2026]);
  assert.deepEqual(r.codici.map(c => [c.codice, c.senzaCodice, c.pezzi]), [
    ['WPAJZERO6', false, { 2026: 400 }],
    ['WPACAMJR3', false, { 2025: 540, 2026: 50 }],
    ['WPADIRETTO', false, { 2026: 10 }],
    ['SPED', false, { 2026: 1 }],            // collegata a un prodotto dell'anagrafica: conta anche se sembra un servizio
    ['PCBA JZERO6', true, { 2025: 20 }],
  ]);
  assert.deepEqual(codiciDiversiPerAnno(r), { 2024: 0, 2025: 2, 2026: 4 });
  // descrizione: dall'anagrafica se c'è, altrimenti dalla prima riga passata (la più recente)
  assert.equal(r.codici.find(c => c.codice === 'SPED')?.descrizione, 'SPEDIZIONE DEDICATA');
  assert.equal(r.codici.find(c => c.codice === 'WPAJZERO6')?.descrizione, 'JZERO6');
  const tutti = codiciPerAnno(righe, 2026, 0);
  assert.deepEqual(tutti.anni, [2023, 2025, 2026]);
  assert.equal(tutti.codici.find(c => c.codice === 'WPAVECCHIO')?.pezzi[2023], 9);
});
