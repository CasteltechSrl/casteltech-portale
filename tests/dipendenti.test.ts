import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  tipoDocumentoPaghe, periodoDaNome, numeroIt, leggiNotaContabile, leggiBilancino, costoAzienda, normalizzaNotaIa, normalizzaF24Ia,
  sbloccoValido, puoAprireRiservata, controllaPasswordPaghe, kmRiga, rimborsoRiga, totaliNotaSpese, rigaNotaDaModulo, riepilogoAnno, tabellaCosti, righeCostiValide,
  TIPI_RISERVATI,
} from '../src/engine/dipendenti.js';
import { cercaGuida } from '../src/engine/guida.js';

// Tutti i numeri e i nomi qui sotto sono inventati: i dati veri delle paghe non vanno mai nel repository.

test('documenti dello studio paghe riconosciuti dal nome', () => {
  assert.equal(tipoDocumentoPaghe('Casteltech - ced 05-2026 definitivi.pdf'), 'cedolini');
  assert.equal(tipoDocumentoPaghe('Casteltech - ced. 08-2026.pdf'), 'cedolini');
  assert.equal(tipoDocumentoPaghe('Casteltech - cedolini 02-2026 definitivi.pdf'), 'cedolini');
  assert.equal(tipoDocumentoPaghe('Casteltech - riepilogo 08-2026.pdf'), 'riepilogo');
  assert.equal(tipoDocumentoPaghe('Casteltech - nc 08-2026.pdf'), 'nota_contabile');
  assert.equal(tipoDocumentoPaghe('NOTA CONTABILE 09-26.pdf'), 'nota_contabile');
  assert.equal(tipoDocumentoPaghe('NC 01-2022.pdf'), 'nota_contabile');
  assert.equal(tipoDocumentoPaghe('Casteltech - f24 del 16-09-26.pdf'), 'f24');
  assert.equal(tipoDocumentoPaghe('Casteltech - f24 inail del 16-02-26.pdf'), 'f24');
  // ordini, note di credito, file non PDF: restano in Ordini → Da acquisire
  assert.equal(tipoDocumentoPaghe('Ordine 037-26 del 30-10-2026 - Montaggio schede.pdf'), null);
  assert.equal(tipoDocumentoPaghe('Nota di credito 12-2026.pdf'), null);
  assert.equal(tipoDocumentoPaghe('Report 2026-09-03 15_28_12.xlsx'), null);
  assert.equal(tipoDocumentoPaghe('Riepilogo ordini.pdf'), null);
  assert.deepEqual(TIPI_RISERVATI, ['cedolini', 'riepilogo']);
});

test('mese di competenza dal nome; l\'F24 del 16 settembre è delle paghe di agosto', () => {
  assert.deepEqual(periodoDaNome('Casteltech - nc 08-2026.pdf', 'nota_contabile'), { anno: 2026, mese: 8 });
  assert.deepEqual(periodoDaNome('NOTA CONTABILE 09-26.pdf', 'nota_contabile'), { anno: 2026, mese: 9 });
  assert.deepEqual(periodoDaNome('NOTA 03.2019.pdf', 'nota_contabile'), { anno: 2019, mese: 3 });
  assert.deepEqual(periodoDaNome('Casteletch - riepilogo -10-2026.pdf', 'riepilogo'), { anno: 2026, mese: 10 });
  assert.deepEqual(periodoDaNome('Casteltech - f24 del 16-09-26.pdf', 'f24'), { anno: 2026, mese: 8, scadenza: '2026-09-16' });
  assert.deepEqual(periodoDaNome('Casteltech - f24 del 16-01-26.pdf', 'f24'), { anno: 2025, mese: 12, scadenza: '2026-01-16' });
});

test('importi all\'italiana', () => {
  assert.equal(numeroIt('4.961,41'), 4961.41);
  assert.equal(numeroIt('-101,92'), -101.92);
  assert.equal(numeroIt('249,62-'), -249.62);
});

const NOTA = `Data di stampa : 15/09/2026
--------------------------------------------------------------------------------
                            N O T A   C O N T A B I L E
--------------------------------------------------------------------------------
  Periodo competenza : Agosto     08/2026
  Qualifica : OPERAIO                                      Reparto
  Comp. carico ditta                              1.000,00
 TOTALE RETRIBUZIONI LORDE                      1.000,00
 Tratt. fine rapporto                             100,00
 Tratt. fine rapp. netto                           90,00
  TOTALI NETTI IN BUSTA                                                800,00
  Contributi lordi INPS                            400,00
  DI CUI A CARICO AZIENDA                300,00
  METASALUTE
                                                      13,00
                            N O T A   C O N T A B I L E
  Periodo competenza : Agosto     08/2026
  Qualifica : OPERAIO                                      Reparto
                            N O T A   C O N T A B I L E
  Periodo competenza : Agosto     08/2026
  Qualifica : IMPIEGATO                                    Reparto
 TOTALE RETRIBUZIONI LORDE                      2.000,00
  TOTALI NETTI IN BUSTA                                              1.500,00
  DI CUI A CARICO AZIENDA                600,00
 TOTALE VERSAMENTO EBNA                            20,00
  TOTALE VERSAMENTO SAN.ARTI                        10,00
  TOTALE VERSAMENTI AGGIUNTIVI                      30,00
                            N O T A   C O N T A B I L E
  Periodo competenza : Agosto     08/2026
  Qualifica : TUTTE                                        Reparto
 TOTALE RETRIBUZIONI LORDE                      3.000,00
  DI CUI A CARICO AZIENDA                900,00
`;

test('nota contabile: costo per qualifica (lordo, contributi azienda, TFR, altri), TUTTE solo come controllo', () => {
  const n = leggiNotaContabile(NOTA)!;
  assert.equal(n.anno, 2026); assert.equal(n.mese, 8);
  assert.deepEqual(n.qualifiche.map(q => q.qualifica), ['OPERAIO', 'IMPIEGATO']);
  const [op, imp] = n.qualifiche;
  assert.deepEqual({ ...op }, { qualifica: 'OPERAIO', lordo: 1000, contributi: 300, tfr: 100, altri: 13, netto: 800 });
  // EBNA + SAN.ARTI non si contano due volte con il "TOTALE VERSAMENTI AGGIUNTIVI"
  assert.equal(imp.altri, 30);
  assert.equal(costoAzienda(op), 1413);
  assert.deepEqual(n.avvisi, []);
  // totale che non torna: avviso
  assert.equal(leggiNotaContabile(NOTA.replace('3.000,00', '3.500,00'))!.avvisi.length, 1);
  assert.equal(leggiNotaContabile('un ordine qualsiasi'), null);
});

const BILANCINO = `                                         BILANCINO DI VERIFICA MESE Dicembre   2019
       44601   Erario c/ritenute 1001
               FI-0000 Tr.fisc.   Trattenute fiscali             44801                          100,00
                                                  TOTALI CONTO.......:                           100,00          100,00-
       54241   Costo T.F.R.
                                                  TOTALI CONTO.......:            50,00                           50,00
       55101   Salari e stipendi
                                                  TOTALI CONTO.......:         1.000,00                        1.000,00
55413                              Compensi Collaboratori(cococo)
                                                                                                 TOTALI CONTO:                2.000,00                                2.000,00
       56201   Contributi su salari e stip.
                                                  TOTALI CONTO.......:           200,00                          200,00
       56239   Contributi SAN.ARTI
                                                  TOTALI CONTO.......:            10,00                           10,00
`;

test('bilancino del vecchio studio (2019–2021): solo i conti di costo 5xxxx, divisi per gruppo', () => {
  const n = leggiBilancino(BILANCINO)!;
  assert.equal(n.anno, 2019); assert.equal(n.mese, 12);
  const dip = n.qualifiche.find(q => q.qualifica === 'DIPENDENTI')!;
  assert.deepEqual([dip.lordo, dip.contributi, dip.tfr, dip.altri], [1000, 200, 50, 10]);
  assert.equal(n.qualifiche.find(q => q.qualifica === 'SOCI E COLLABORATORI')!.lordo, 2000);
  assert.equal(n.qualifiche.reduce((s, q) => s + costoAzienda(q), 0), 3260);
  assert.equal(leggiBilancino(BILANCINO.replace('MESE Dicembre   2019', '').replace('BILANCINO DI VERIFICA', 'Bilancino di verifica\nPeriodo di elaborazione: Agosto 2020 Norm.'))!.mese, 8);
});

test('lettura dell\'IA ripulita: niente TUTTE insieme alle qualifiche, importi numerici, F24 con totale', () => {
  const n = normalizzaNotaIa({ anno: 2026, mese: 9, qualifiche: [{ qualifica: 'operaio', lordo: '1.000,00', contributi: 300 }, { qualifica: 'TUTTE', lordo: 1000 }] })!;
  assert.deepEqual(n.qualifiche.map(q => [q.qualifica, q.lordo]), [['OPERAIO', 1000]]);
  assert.equal(normalizzaNotaIa({ anno: 2026, mese: 13 }), null);
  const f = normalizzaF24Ia({ scadenza: '2026-09-16', righe: [{ sezione: 'ERARIO', codice: '1001', importo: 100 }, { sezione: 'INPS', codice: 'DM10', importo: '50,50' }] });
  assert.equal(f.totale, 150.5);
  assert.equal(f.scadenza, '2026-09-16');
});

test('area riservata: permesso dell\'amministratore + password, aperta 15 minuti', () => {
  assert.equal(puoAprireRiservata({ email: 'Admin@Esempio.it', paghe: false }, 'admin@esempio.it'), true);
  assert.equal(puoAprireRiservata({ email: 'altro@esempio.it', paghe: false }, 'admin@esempio.it'), false);
  assert.equal(puoAprireRiservata({ email: 'altro@esempio.it', paghe: true }, 'admin@esempio.it'), true);
  assert.equal(puoAprireRiservata({ email: 'admin@esempio.it' }, undefined), false);
  const ora = Date.now();
  assert.equal(sbloccoValido(ora - 14 * 60_000, ora), true);
  assert.equal(sbloccoValido(ora - 16 * 60_000, ora), false);
  assert.equal(sbloccoValido(undefined, ora), false);
  assert.ok(controllaPasswordPaghe('corta1'));
  assert.ok(controllaPasswordPaghe('sololettere'));
  assert.equal(controllaPasswordPaghe('bustepaga2026'), null);
});

test('area riservata: i documenti si aprono solo con l\'area aperta, la sezione è solo dell\'ufficio', () => {
  const rotte = readFileSync(new URL('../src/server/rotte/dipendenti.ts', import.meta.url), 'utf8');
  for (const p of ["r.get('/riservata/documenti/:id'", "r.post('/riservata/storico'", "r.post('/riservata/documenti/:id/elimina'",
    "r.get('/riservata/persona'", "r.get('/riservata/cedolini/:id'"]) {
    const dopo = rotte.split(p)[1];
    assert.ok(dopo && /^[^\n]*\n\s*if \(!\(await aperta\(req, res\)\)\) return;/.test(dopo), p);
  }
  const index = readFileSync(new URL('../src/server/index.ts', import.meta.url), 'utf8');
  assert.match(index, /app\.use\('\/dipendenti', soloUfficio, rotteDipendenti\(\)\)/);
  // i cedolini non vanno mai all'IA: si leggono dal testo del PDF nel portale
  const servizio = readFileSync(new URL('../src/server/dipendenti-servizio.ts', import.meta.url), 'utf8');
  const ramoCedolini = servizio.split("if (d.tipo === 'cedolini') {")[1]?.split('} else if')[0] ?? '';
  assert.match(ramoCedolini, /leggiCedolini\(await testoPdf\(d\.contenuto\)/);
  assert.doesNotMatch(ramoCedolini, /ConIa|chiediTestoIa/);
});

test('nota spese come il modulo rimborso km: km andata × 2, rimborso = km × tariffa + altre spese', () => {
  const r = { kmAndata: 130, andataRitorno: true, altreSpese: 15.5 };
  assert.equal(kmRiga(r), 260);
  assert.equal(rimborsoRiga(r, 0.46), 135.1);
  assert.equal(kmRiga({ kmAndata: 130, andataRitorno: false }), 130);
  const t = totaliNotaSpese([r, { kmAndata: 35, andataRitorno: true, altreSpese: 0 }], 0.46);
  assert.deepEqual(t, { km: 330, rimborsoKm: 151.8, altre: 15.5, totale: 167.3 });
});

test('riga della nota spese dal modulo: km dalla destinazione, righe vuote saltate, data obbligatoria', () => {
  const km = (n: string) => (n === 'CLIENTE PROVA' ? 90 : null);
  assert.deepEqual(rigaNotaDaModulo({ data: '2026-10-05', destinazione: 'cliente prova', km_andata: '', andata_ritorno: '1', altre_spese: '12,50' }, km).riga,
    { data: '2026-10-05', partenza: 'SEDE', destinazione: 'CLIENTE PROVA', kmAndata: 90, andataRitorno: true, altreSpese: 12.5, note: '' });
  assert.equal(rigaNotaDaModulo({ data: '2026-10-05', destinazione: '', km_andata: '', altre_spese: '' }, km).riga, null);
  assert.ok(rigaNotaDaModulo({ data: '', destinazione: 'CLIENTE PROVA' }, km).errore);
  assert.equal(rigaNotaDaModulo({ data: '2026-10-05', destinazione: 'NUOVO', km_andata: '40', andata_ritorno: '0' }, km).riga!.andataRitorno, false);
});

test('riepilogo dell\'anno: totale, pagato, da pagare', () => {
  const r = riepilogoAnno([{ mese: 1, totale: 100, pagato: 0 }, { mese: 2, totale: 50.25, pagato: 100 }]);
  assert.equal(r.totale, 150.25); assert.equal(r.pagato, 100); assert.equal(r.daPagare, 50.25);
  assert.equal(r.mesi.length, 12);
});

test('costo del personale: anni × mesi, media e confronto sugli stessi mesi dell\'anno prima', () => {
  const t = tabellaCosti([{ anno: 2025, mese: 1, costo: 100 }, { anno: 2025, mese: 2, costo: 100 }, { anno: 2025, mese: 3, costo: 100 },
    { anno: 2026, mese: 1, costo: 110 }, { anno: 2026, mese: 2, costo: 110 }]);
  assert.deepEqual(t.map(x => x.anno), [2026, 2025]);
  assert.equal(t[0].totale, 220); assert.equal(t[0].media, 110); assert.equal(t[0].annoPrima, 200); assert.equal(t[0].variazione, 10);
  assert.equal(t[1].variazione, null);
  assert.deepEqual(righeCostiValide({ costi: [{ anno: 2026, mese: 1, qualifica: 'operaio', lordo: 1 }, { anno: 2026, mese: 13, qualifica: 'X' }] }).map(r => r.qualifica), ['OPERAIO']);
});

test('guida: dipendenti, buste paga e nota spese', () => {
  const primi = (q: string) => cercaGuida(q).slice(0, 3).map(r => r.argomento.id);
  assert.ok(primi('buste paga').includes('dipendenti'));
  assert.ok(primi('rimborso chilometrico').includes('nota-spese'));
  assert.ok(primi('costo del personale').includes('dipendenti'));
  assert.ok(primi('nota spese km').includes('nota-spese'));
});
