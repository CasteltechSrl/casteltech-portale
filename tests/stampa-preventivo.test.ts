import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcolaPreventivo, type FaseDef, type Tariffe, type VoceDef } from '../src/engine/calcolo.js';
import { consegnaCompleta, contiStampa, leggiRitocchi, testoConsegna, quotaSmd, righeDettaglio, righeUnaTantum, versioneStampa } from '../src/engine/stampa-preventivo.js';

const t: Tariffe = { costoAziendaH: 0, costoOperatoreProduzioneH: 60, costoOperatoreUfficioH: 60, ricarico: 1 };
// una fase da "euro" € a lotto (60 €/h × 1 persona, ricarico 1: secondi = euro × 60)
const F = (codice: string, gruppo: string, euro: number, unaTantum = false): FaseDef =>
  ({ codice, nome: codice, gruppo, formulaSecondi: String(euro * 60), persone: 1, tariffa: 'produzione', unaTantum });
const V = (codice: string, gruppo: string, euro: number, unaTantum = false): VoceDef => ({ codice, nome: codice, gruppo, formulaEuro: String(euro), unaTantum });

test('stampa: versione dall\'indirizzo, se manca Essenziale con dettaglio', () => {
  assert.equal(versioneStampa('essenziale'), 'essenziale');
  assert.equal(versioneStampa('fasi'), 'fasi');
  assert.equal(versioneStampa(undefined), 'dettaglio');
  assert.equal(versioneStampa('altro'), 'dettaglio');
});

test('stampa: gestione materiale e imballaggio 70/30 su SMD e THT, pesato sul valore (Adriano 28/10/2026)', () => {
  assert.equal(quotaSmd(100, 100), 0.7);
  assert.equal(Math.round(quotaSmd(10, 90) * 1000) / 1000, 0.206);   // 7 / (7 + 27)
  assert.equal(quotaSmd(50, 0), 1);
  assert.equal(quotaSmd(0, 50), 0);
});

test('stampa con dettaglio: componenti, PCB, SMD, THT (con i costi comuni), consumo, spedizione; totali uguali al preventivo', () => {
  const fasi = [F('pep', 'SMD', 100), F('onda', 'THT', 100), F('stocc', 'GESTIONE MATERIALE', 30), F('imb', 'IMBALLAGGIO', 20),
    F('prog', 'SMD', 200, true), F('test', 'COMPLETAMENTO', 40)];
  const voci = [V('valoreAcquistoComponenti', 'MATERIALE PER PRODUZIONE', 500), V('valoreAcquistoPCB', 'MATERIALE PER PRODUZIONE', 100),
    V('materialeDiConsumo', 'MATERIALE DI CONSUMO', 8), V('energiaForno', 'ENERGIA', 2), V('spedizione', 'SPEDIZIONE', 15),
    V('laminaSerigrafica', 'COSTI UNA TANTUM', 110, true)];
  const ris = calcolaPreventivo(fasi, voci, t, { nSchede: 10, parametri: {} });
  const righe = righeDettaglio(ris);
  assert.deepEqual(righe.map(r => [r.nome, r.lotto]), [
    ['Acquisto componenti', 500], ['Acquisto PCB', 100],
    ['Montaggio SMD', 135], ['Montaggio THT', 115],                  // 50 € comuni: 70 % SMD, 30 % THT
    ['Lavorazioni di completamento', 40], ['Materiale di consumo', 10], ['Spedizione', 15],
  ]);
  assert.equal(righe.reduce((a, r) => a + r.lotto, 0), ris.totali.totaleSecondoLotto);
  assert.equal(Math.round(righe.reduce((a, r) => a + r.scheda, 0) * 100) / 100, ris.totali.prezzoSchedaSecondoLotto);
  assert.ok(!righe.some(r => /prog|lamina/i.test(r.nome)), 'le una tantum restano a parte');
  assert.deepEqual(righeUnaTantum(ris, { doppia: false, nLamine: 1 }).map(r => [r.nome, r.prezzo]),
    [['Programmazione attrezzature di produzione', 200], ['Lamina serigrafica', 110]]);
});

test('stampa con dettaglio: SMD piccolo e THT grande → i costi comuni vanno più sul THT', () => {
  const ris = calcolaPreventivo([F('pep', 'SMD', 10), F('onda', 'THT', 90), F('imb', 'IMBALLAGGIO', 34)], [], t, { nSchede: 1, parametri: {} });
  assert.deepEqual(righeDettaglio(ris).map(r => [r.nome, r.lotto]), [['Montaggio SMD', 17], ['Montaggio THT', 117]]);   // 34 × 7/34 = 7
});

test('stampa con dettaglio: i centesimi degli arrotondamenti tornano con il prezzo a scheda', () => {
  const ris = calcolaPreventivo([F('pep', 'SMD', 10), F('onda', 'THT', 10), F('imb', 'IMBALLAGGIO', 10)],
    [V('materialeDiConsumo', 'MATERIALE DI CONSUMO', 10)], t, { nSchede: 3, parametri: {} });
  const righe = righeDettaglio(ris);
  assert.equal(Math.round(righe.reduce((a, r) => a + r.scheda, 0) * 100) / 100, ris.totali.prezzoSchedaSecondoLotto);
  assert.equal(Math.round(righe.reduce((a, r) => a + r.lotto, 0) * 100) / 100, ris.totali.totaleSecondoLotto);
});

test('stampa: ritocchi dal modulo (Adriano 29/10/2026): righe vuote saltate, numeri all\'italiana, note interne solo con la spunta', () => {
  const r = leggiRitocchi({ noteCliente: ' Consegna in 3 settimane ', scontoTipo: 'percento', scontoValore: '5,5',
    rigaDescrizione: ['Collaudo funzionale', '', 'Trasporto'], rigaQuantita: ['257', '', ''], rigaPrezzo: ['0,80', '', '35'] });
  assert.equal(r.noteCliente, 'Consegna in 3 settimane');
  assert.deepEqual(r.sconto, { tipo: 'percento', valore: 5.5 });
  assert.deepEqual(r.righe, [{ descrizione: 'Collaudo funzionale', quantita: 257, prezzo: 0.8 }, { descrizione: 'Trasporto', quantita: 1, prezzo: 35 }]);
  assert.equal(r.noteInterne, false);
  assert.equal(leggiRitocchi({ noteInterne: 'si' }).noteInterne, true);
  assert.equal(leggiRitocchi({ scontoValore: '0' }).sconto, null);
  assert.deepEqual(leggiRitocchi(r), r); // quello salvato si rilegge uguale
  assert.deepEqual(leggiRitocchi(null).righe, []);
});

test('stampa: sconto in % su tutto, sconto in € sul lotto, righe in più nel totale', () => {
  const base = { prezzoScheda: 3.25, lotto: 834.79, unaTantum: 347.5, nSchede: 257 };
  const p = contiStampa(base, leggiRitocchi({ scontoTipo: 'percento', scontoValore: '10', rigaDescrizione: 'Trasporto', rigaPrezzo: '50' }));
  assert.equal(p.extra, 50);
  assert.equal(p.sconto, 123.23);            // 10% di 834,79 + 347,50 + 50
  assert.equal(p.totale, 1109.06);
  assert.equal(p.lotto, 751.31);
  assert.equal(p.unaTantum, 312.75);
  assert.equal(p.etichettaSconto, 'Sconto 10%');
  const e = contiStampa(base, leggiRitocchi({ scontoTipo: 'euro', scontoValore: '34,79' }));
  assert.equal(e.lotto, 800);
  assert.equal(e.prezzoScheda, 3.11);
  assert.equal(e.unaTantum, 347.5);
  assert.equal(e.totale, 1147.5);
  const nulla = contiStampa(base, leggiRitocchi({}));
  assert.equal(nulla.totale, 1182.29);
  assert.equal(nulla.prezzoScheda, 3.25);
});

test('stampa: riquadro verde = prezzo a scheda senza e con le una tantum (Adriano 4/11/2026)', async () => {
  const { prezziRiquadro } = await import('../src/engine/stampa-preventivo.js');
  const base = { prezzoScheda: 10, lotto: 1000, unaTantum: 250, nSchede: 100, prezzoSchedaConUnaTantum: 12.5 };
  assert.deepEqual(prezziRiquadro(base, leggiRitocchi(null)), { senza: 10, con: 12.5 });
  // senza una tantum un solo prezzo
  assert.deepEqual(prezziRiquadro({ ...base, unaTantum: 0, prezzoSchedaConUnaTantum: 10 }, leggiRitocchi(null)), { senza: 10, con: null });
  // sconto 10 %: tutti e due scontati; le righe in più non entrano nel prezzo a scheda
  assert.deepEqual(prezziRiquadro(base, leggiRitocchi({ scontoValore: '10', rigaDescrizione: ['Collaudo'], rigaQuantita: ['1'], rigaPrezzo: ['50'] })), { senza: 9, con: 11.25 });
});

test('stampa: prezzi a scheda scritti a mano, totale di conseguenza (Adriano 4/11/2026, P2026-2388)', async () => {
  const { basePrezzi, contiStampa: conti, prezziRiquadro, pareggiaSulPiuGrande, prezziComeInStampa } = await import('../src/engine/stampa-preventivo.js');
  const calcolati = { prezzoScheda: 174.63, prezzoSchedaConUnaTantum: 201.75, unaTantum: 135.6, nSchede: 5, lotto: 873.15 };
  // senza ritocchi restano i prezzi del preventivo
  assert.deepEqual(basePrezzi(calcolati, leggiRitocchi(null).prezzi), { prezzoScheda: 174.63, lotto: 873.15, unaTantum: 135.6, nSchede: 5 });
  assert.deepEqual(prezziRiquadro(calcolati, leggiRitocchi(null)), { senza: 174.63, con: 201.75 });
  // scritti a mano 174 e 201: lotto 870, una tantum 135, totale 1.005
  const rit = leggiRitocchi({ prezzoSenza: '174', prezzoCon: '201' });
  assert.deepEqual(rit.prezzi, { senza: 174, con: 201 });
  assert.deepEqual(leggiRitocchi(rit), rit);   // quello salvato si rilegge uguale
  const b = basePrezzi(calcolati, rit.prezzi);
  assert.deepEqual(b, { prezzoScheda: 174, lotto: 870, unaTantum: 135, nSchede: 5 });
  assert.equal(conti(b, rit).totale, 1005);
  assert.deepEqual(prezziRiquadro(calcolati, rit), { senza: 174, con: 201 });
  // solo "senza": le una tantum restano quelle calcolate
  assert.deepEqual(basePrezzi(calcolati, leggiRitocchi({ prezzoSenza: '170' }).prezzi), { prezzoScheda: 170, lotto: 850, unaTantum: 135.6, nSchede: 5 });
  // vuoto o zero = prezzo calcolato
  assert.deepEqual(leggiRitocchi({ prezzoSenza: '', prezzoCon: '0' }).prezzi, { senza: null, con: null });
  // "Crea ordine" usa gli stessi prezzi della stampa
  const o = prezziComeInStampa(calcolati, 5, [{ nome: 'Programmazione', prezzo: 100.6 }, { nome: 'Lamina', prezzo: 35 }, { nome: 'Niente', prezzo: 0 }], rit.prezzi);
  assert.equal(o.prezzoScheda, 174);
  assert.deepEqual(o.unaTantum, [{ nome: 'Programmazione', prezzo: 100 }, { nome: 'Lamina', prezzo: 35 }]);
  assert.equal(prezziComeInStampa(calcolati, 5, [{ nome: 'Lamina', prezzo: 135.6 }], leggiRitocchi(null).prezzi).prezzoScheda, 174.63);
  // le righe stampate (dettaglio, una tantum) tornano con il totale
  const righe = [{ v: 100.4 }, { v: 35.2 }];
  pareggiaSulPiuGrande(righe, x => x.v, (x, n) => { x.v = n; }, 135);
  assert.deepEqual(righe.map(x => x.v), [99.8, 35.2]);
});

test('stampa: tempi di consegna sempre "circa", conto lavoro o materiale comprato da noi (Adriano 4/11/2026)', () => {
  // conto lavoro: settimane dall'arrivo del materiale
  const cl = leggiRitocchi({ consegnaAcquisto: 'no', settimaneMontaggio: '3' }).consegna;
  assert.equal(testoConsegna(cl, true), "Circa 3 settimane dall'arrivo di tutto il materiale del cliente");
  assert.equal(testoConsegna({ acquisto: false, materiale: null, montaggio: 1 }, false), "Circa 1 settimana dall'arrivo di tutto il materiale del cliente");
  // materiale comprato da noi: arrivo del materiale + montaggio, servono tutti e due
  const ac = leggiRitocchi({ consegnaAcquisto: 'si', settimaneMateriale: '4', settimaneMontaggio: '2' }).consegna;
  assert.equal(testoConsegna(ac, false), "Circa 6 settimane dalla conferma d'ordine: circa 4 settimane per l'arrivo del materiale e circa 2 settimane per il montaggio");
  assert.equal(consegnaCompleta({ acquisto: true, materiale: null, montaggio: 2 }, false), false);
  // non scelto: vale la spunta "Componenti" del preventivo
  const ns = leggiRitocchi({ settimaneMontaggio: '2' }).consegna;
  assert.equal(ns.acquisto, null);
  assert.equal(consegnaCompleta(ns, false), true);
  assert.equal(consegnaCompleta(ns, true), false);
  // mancano i tempi = niente testo (non si stampa e non si manda); fuori dal menu = da scegliere
  assert.equal(testoConsegna(leggiRitocchi({}).consegna, false), '');
  assert.equal(leggiRitocchi({ settimaneMontaggio: '0' }).consegna.montaggio, null);
  assert.equal(leggiRitocchi({ settimaneMontaggio: '2,5' }).consegna.montaggio, null);
  // salvato nel preventivo e riletto uguale
  const r = leggiRitocchi({ consegnaAcquisto: 'si', settimaneMateriale: '6', settimaneMontaggio: '2' });
  assert.deepEqual(leggiRitocchi(JSON.parse(JSON.stringify(r))), r);
});

test('stampa: validità dell\'offerta, montaggio 30 giorni e componenti/PCB 10 solo se li vendiamo (Adriano 5/11/2026)', async () => {
  const { validitaOfferta, materialeVenduto, CONDIZIONI_GENERALI } = await import('../src/engine/stampa-preventivo.js');
  const data = new Date('2026-11-05T10:00:00Z');
  assert.deepEqual(validitaOfferta(data, { componenti: false, pcb: false }), ['Montaggio: 30 giorni (fino al 05/12/2026)']);
  assert.deepEqual(validitaOfferta(data, { componenti: true, pcb: true }),
    ['Montaggio: 30 giorni (fino al 05/12/2026)', 'Componenti e PCB: 10 giorni (fino al 15/11/2026), poi prezzi da riconfermare']);
  assert.equal(validitaOfferta(null, { componenti: false, pcb: true })[1], 'PCB: 10 giorni, poi prezzi da riconfermare');
  const ris = calcolaPreventivo([F('a', 'SMD', 100)], [V('valoreAcquistoComponenti', 'MATERIALE PER PRODUZIONE', 50), V('valoreAcquistoPCB', 'MATERIALE PER PRODUZIONE', 0)], t, { nSchede: 10, parametri: {} });
  assert.deepEqual(materialeVenduto(ris), { componenti: true, pcb: false });
  // condizioni: validità e da quando contano le settimane di consegna
  const testo = CONDIZIONI_GENERALI.join(' ');
  assert.match(testo, /montaggio vale 30 giorni/);
  assert.match(testo, /componenti e PCB acquistati da noi valgono 10 giorni/);
  assert.match(testo, /conferma d'ordine/);
  assert.match(testo, /Codici alternativi/);
});

test('stampa: codici alternativi alla BOM da confermare, uniti per coppia di codici (Adriano 5/11/2026)', async () => {
  const { alternativeDaConfermare, fraseAlternative } = await import('../src/engine/alternative-cliente.js');
  const alt = [{ mpn: 'GRM188R61A106KE69D', produttore: 'Murata', descrizione: 'CAP 10UF 10V X5R 0603' }];
  const righe = [
    { pn: 'CL10A106MQ8NNNC', produttore: 'Samsung', designatori: 'C36', qtaScheda: 1, alternativaProposta: 'GRM188R61A106KE69D', alternative: alt },
    { pn: 'CL10A106MQ8NNNC', produttore: 'Samsung', designatori: 'C47, C48', qtaScheda: 2, alternativaScelta: 'GRM188R61A106KE69D', alternative: alt },
    { pn: 'RC0603FR-0710KL', designatori: 'R1', qtaScheda: 1 },                                       // nessuna alternativa
    { pn: 'ABC-1', designatori: 'U1', qtaScheda: 1, alternativaScelta: 'ABC1' },                     // stesso codice scritto diverso
    { pn: 'XYZ', designatori: 'U2', qtaScheda: 1, alternativaScelta: 'XYZ-B', esito: 'NON MONTATO' }, // non montato
    { pn: 'QWE', designatori: 'U3', qtaScheda: 1, alternativaScelta: 'QWE-B', clienteFornisce: true }, // lo dà il cliente
  ];
  const x = alternativeDaConfermare(righe);
  assert.equal(x.length, 1);
  assert.deepEqual(x[0], { pnBom: 'CL10A106MQ8NNNC', produttoreBom: 'Samsung', alternativa: 'GRM188R61A106KE69D', produttoreAlternativa: 'Murata',
    descrizione: 'CAP 10UF 10V X5R 0603', riferimenti: 'C36, C47, C48', qtaScheda: 3 });
  assert.equal(fraseAlternative(0), '');
  assert.match(fraseAlternative(1), /è stato individuato 1 codice alternativo da confermare/);
  assert.match(fraseAlternative(0, 2), /2 componenti hanno problemi di acquisto/);
  assert.doesNotMatch(fraseAlternative(0, 1), /acquistiamo solo dopo/);
  assert.match(fraseAlternative(3), /sono stati individuati 3 codici alternativi/);
});

test('riquadri del preventivo: vendita per voce (montaggio, componenti, PCB) e costi di produzione/acquisto (Adriano 5/11/2026)', async () => {
  const { riepilogo } = await import('../src/engine/riepilogo.js');
  const ris = calcolaPreventivo([F('a', 'SMD', 100), F('u', 'PRE-PRODUZIONE', 30, true)],
    [V('valoreAcquistoComponenti', 'MATERIALE PER PRODUZIONE', 50), V('valoreAcquistoPCB', 'MATERIALE PER PRODUZIONE', 20), V('consumo', 'MATERIALE DI CONSUMO', 10)],
    t, { nSchede: 10, parametri: {} });
  const r = riepilogo(ris);
  // costi a scheda: produzione = fase + consumo, acquisto = componenti + PCB
  assert.equal(r.costoProduzioneScheda, 11);
  assert.equal(r.costoAcquistoScheda, 7);
  assert.equal(r.costoUnaTantum, 30);
  // vendita: componenti e PCB a parte, il montaggio è il resto del prezzo a scheda senza una tantum
  assert.ok(r.venditaComponentiScheda > 0 && r.venditaPcbScheda > 0);
  assert.equal(Math.round((r.venditaMontaggioScheda + r.venditaComponentiScheda + r.venditaPcbScheda) * 100) / 100, r.prezzoScheda);
});

test('stampa: componenti non trovati o con problemi di acquisto nell\'ultima pagina (Adriano 5/11/2026)', async () => {
  const { componentiDaVerificare } = await import('../src/engine/alternative-cliente.js');
  const ok = { scelta: { disponibile: true } };
  const righe = [
    { pn: 'NONESISTE1', designatori: 'U1', qtaScheda: 1, acquisti: [{}], reperibilita: { livello: 'critico', motivi: ['non trovato presso nessun distributore'] } },
    { pn: null, valore: '10K', designatori: 'R9', qtaScheda: 1, acquisti: [{}] },
    { pn: 'SCARSO', designatori: 'U2', qtaScheda: 2, acquisti: [{ scelta: { disponibile: false } }],
      reperibilita: { livello: 'critico', motivi: ['non disponibile da nessuna parte: 4 pz in tutto contro 10 necessari'] } },
    { pn: 'DIVISO', designatori: 'U3', qtaScheda: 1, acquisti: [ok],
      reperibilita: { livello: 'attenzione', motivi: ['Mouser non ha risposto: premi "Aggiorna prezzi"'] } },
    { pn: 'VECCHIO', designatori: 'U4', qtaScheda: 1, acquisti: [ok], reperibilita: { livello: 'ok', motivi: ['Mouser: Obsolete'] } },
    { pn: 'BUONO', designatori: 'U5', qtaScheda: 1, acquisti: [ok], reperibilita: { livello: 'ok', motivi: [] } },
    { pn: 'AMANO', designatori: 'U6', qtaScheda: 1, acquisti: [{}], prezzoManuale: 1.2 },                      // risolto dall'ufficio
    { pn: 'CONALT', designatori: 'U7', qtaScheda: 1, acquisti: [{}], alternativaProposta: 'ALT' },             // già tra le alternative
    { pn: 'NONESISTE1', designatori: 'U8', qtaScheda: 1, acquisti: [{}] },                                    // stesso codice: unito
  ];
  const x = componentiDaVerificare(righe);
  assert.deepEqual(x.map(c => c.codice), ['NONESISTE1', '10K', 'SCARSO', 'DIVISO', 'VECCHIO']);
  assert.equal(x[0].riferimenti, 'U1, U8');
  assert.equal(x[0].quotato, false);
  assert.match(x[0].problema, /non trovato presso i distributori: non quotato/i);
  assert.match(x[1].problema, /non indicato nella BOM/);
  assert.match(x[2].problema, /4 pz in tutto contro 10 necessari/);
  assert.doesNotMatch(x[3].problema, /premi|Mouser/);
  assert.match(x[4].problema, /fine vita/);
});
