import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  descrizioneArticolo, gruppoDaDescrizione, gruppoStima, leggiAnagraficaArmadi, leggiArchivioBobine, leggiCodiceSelea, leggiSigla, percentualeConPrezzo, percentualeValida,
  pnDaDescrizione, pnPulito, prezzoOnline, proprietario, quote, riepilogo, scegliPrezzo, stimePerGruppo, tabellaSigle, clientiDelleSigle, gruppiSigle,
} from '../src/engine/armadi.js';
import { cercaGuida } from '../src/engine/guida.js';

const riga = (codice: string, descr: string, fornitore: string, qta: number, prezzo = '0', alt = ' ') =>
  [codice, descr, 'SMT', '0', '0', fornitore, '0', String(qta), alt, '', '10', '0', '0', '0', '0', String(qta), '1', prezzo, '', '1', '1', '0', '0', '0', '0', '0', ''].join('\t');

test('anagrafica degli armadi: solo i codici con pezzi, colonne giuste (Adriano 13/11/2026)', () => {
  const a = leggiAnagraficaArmadi([riga('412392465', ' ', ' ', 0), riga('CI0099', ' ', 'IDEA', 139), riga('RS-0402-75R-1-63MW', 'SMD_RESISTENZA', 'CASTELTECH', 1260, '0.001', 'NEW')].join('\r\n'));
  assert.deepEqual(a.map(x => [x.codice, x.quantita, x.proprietario, x.prezzo]), [['CI0099', 139, 'IDEA', null], ['RS-0402-75R-1-63MW', 1260, 'CASTELTECH', 0.001]]);
  assert.throws(() => leggiAnagraficaArmadi('ReelCode,ItemCode\n1,2'));
});

test('bobine: contano solo quelle non congelate e con pezzi', () => {
  const testo = ['#--- Archivio rolle ---', '#ReelCode,ItemCode,Quantity,ReelFormat,MaxLying,LastUse,Frozen,Usable,Manufacturer,SessionCode,Position,MSL,Supplier,Tech,MPN,Box',
    '"024189","CI0099","162","ROLLA","20/03/2075","02/03/2026","Y","Y","","","OUT","1","IDEA","SMT","",""',
    '"025660","CI0099","109","ROLLA","12/11/2075","14/10/2026","N","Y","","","OUT","1","IDEA","SMT","",""',
    '"025779","CI0099","30","BUSTA","27/11/2075","26/02/2026","N","Y","YAGEO","","STATIC A/E/16","1","CAST/LPS","SMT","1PRC0603FR-0710KL",""',
    '"025780","CI0099","0","BUSTA","27/11/2075","26/02/2026","N","Y","","","OUT","1","IDEA","SMT","",""'].join('\r\n');
  const b = leggiArchivioBobine(testo);
  assert.deepEqual(b.map(x => [x.bobina, x.quantita, x.sigla]), [['025660', 109, 'IDEA'], ['025779', 30, 'CAST/LPS']]);
  assert.equal(b[1].pn, '1PRC0603FR-0710KL');
  assert.equal(b[1].posizione, 'STATIC A/E/16');
});

test('di chi è: CAST/… = Casteltech, sigle → clienti, regola bobina o codice', () => {
  assert.deepEqual(leggiSigla('CAST/LPS'), { sigla: 'LPS', casteltech: false, perConto: 'comprato da Casteltech' });   // di LPS, già fatturato
  assert.equal(leggiSigla('CASTELTECH').casteltech, true);
  assert.equal(leggiSigla('CASTELETCH').casteltech, true);
  assert.equal(leggiSigla('20').sigla, '');                       // numero finito nella colonna sbagliata
  const clienti = [{ id: 1, ragione_sociale: 'LPS ELECTRONICS S.R.L.' }, { id: 2, ragione_sociale: 'IDEA AUTOMAZIONE S.R.L.' }, { id: 3, ragione_sociale: 'N.I.T. SRL' }];
  const t = tabellaSigle(['LPS', 'IDEA', 'NIT', 'SANDRA', 'REBIX', 'INFN', 'PIPPO'], clienti, { IDEA: 'casteltech' });
  assert.deepEqual(t, { LPS: 'c1', IDEA: 'casteltech', NIT: 'c3', SANDRA: '', REBIX: 'c3', INFN: 'casteltech', PIPPO: '' });   // SANDRA = Arilan, non in questo elenco
  assert.deepEqual(proprietario('LPS', 'CASTELTECH', t, 'bobina'), { tipo: 'cliente', clienteId: 1, sigla: 'LPS', perConto: null });
  assert.equal(proprietario('LPS', 'CASTELTECH', t, 'articolo').tipo, 'casteltech');
  assert.equal(proprietario('', 'NIT', t).clienteId, 3);                         // bobina senza sigla: vale il codice
  assert.equal(proprietario('PIPPO', 'CASTELTECH', t).tipo, 'da_chiarire');
  assert.deepEqual(proprietario('CAST/LPS', 'CASTELTECH', t), { tipo: 'cliente', clienteId: 1, sigla: 'LPS', perConto: 'comprato da Casteltech' });
});

test('descrizione completata: armadi, componenti del cliente, archivio, codice Casteltech, codice Selea, P/N', () => {
  const a = (codice: string, descrizione = ' ', descrizioneAlt = 'NEW') => ({ codice, descrizione, descrizioneAlt });
  assert.equal(descrizioneArticolo(a('X', 'C SMD CER 150NF 0402'), {}).fonte, 'armadi');
  assert.equal(descrizioneArticolo(a('CI0099'), { componenteCliente: { descrizione: 'C.I. LM317MDCY SMD' } }).testo, 'C.I. LM317MDCY SMD');
  assert.deepEqual(descrizioneArticolo(a('RS-0402-75R-1-63MW_KI', 'SMD_RESISTENZA'), { pn: 'RC0402FR-0775RL', produttore: 'YAGEO' }),
    { testo: 'RES 0402 75R 1 63MW (YAGEO RC0402FR-0775RL)', fonte: 'codice Casteltech' });
  assert.equal(descrizioneArticolo(a('RST10KB0603'), {}).testo, 'R SMD 10K 0,1% 0603');
  assert.equal(descrizioneArticolo(a('QWERTY', 'SMD_CIRCUITO INTEGRATO'), {}).testo, 'CIRCUITO INTEGRATO SMD');
  assert.deepEqual(descrizioneArticolo(a('QWERTY'), {}), { testo: null, fonte: null });
});

test('codici Selea: resistenze e condensatori, ultima lettera = case', () => {
  assert.deepEqual(leggiCodiceSelea('CSC100NX50VN'), { famiglia: 'CC', case: '0603', descrizione: 'C SMD CER 100NF 50V 0603' });
  assert.equal(leggiCodiceSelea('CSM10UD6V3M')?.descrizione, 'C SMD MULT CER 10UF 6V3 0402');
  assert.equal(leggiCodiceSelea('RST0R013F2010')?.descrizione, 'R SMD 0R013 1% 2010');
  assert.equal(leggiCodiceSelea('CSE470UM25VN')?.famiglia, 'CE');
  assert.equal(leggiCodiceSelea('CI0099'), null);
});

test('P/N dalla descrizione e P/N pulito', () => {
  assert.equal(pnDaDescrizione('C SMD CER 150NF 10% X7R 25V 0402  (YAG CC0402KRX7R7BB154)'), 'CC0402KRX7R7BB154');
  assert.equal(pnDaDescrizione('C.I. LM317MDCY SMD'), 'LM317MDCY');
  assert.equal(pnDaDescrizione('CONNETTORE HEADER MINI-FIT MASCHIO 6VIE 39-28-1063 MOLEX'), '39-28-1063');
  assert.equal(pnDaDescrizione('CONNETTORE RETTANGOLARE 10POLI'), null);
  assert.equal(pnDaDescrizione('RESISTORE SMD 0603 330OHM'), null);
  assert.equal(pnPulito('KAM11206100 - RMC1/8K1003FTP'), 'RMC1/8K1003FTP');
});

test('prezzo: a mano > acquisto > online > armadi > stima; online = scaglione dei pezzi in stock', () => {
  assert.equal(scegliPrezzo([{ fonte: 'armadio', prezzo: 1 }, { fonte: 'online', prezzo: 2 }, null])?.fonte, 'online');
  assert.equal(scegliPrezzo([{ fonte: 'stima', prezzo: 1 }, { fonte: 'acquisto', prezzo: 3 }, { fonte: 'manuale', prezzo: 0 }])?.fonte, 'acquisto');
  assert.equal(scegliPrezzo([{ fonte: 'manuale', prezzo: 5 }, { fonte: 'acquisto', prezzo: 3 }])?.prezzo, 5);
  const o = (fornitore: any, valuta: string, scaglioni: [number, number][]) => ({ fornitore, codiceFornitore: '', mpn: 'X1', produttore: '', descrizione: '', stock: 0, moq: 1, multiplo: 1, valuta,
    scaglioni: scaglioni.map(([qta, prezzo]) => ({ qta, prezzo })) });
  const p = prezzoOnline([o('mouser', 'EUR', [[1, 0.1], [1000, 0.02]]), o('digikey', 'EUR', [[1, 0.09], [500, 0.03]]), o('arrow', 'USD', [[1, 0.001]])], 2000);
  assert.equal(p?.prezzo, 0.02);
  assert.match(p!.nota, /mouser/);
});

test('stima dei passivi: famiglia + case (anche dai codici Selea e dalla descrizione), mediana di almeno 3 acquisti', () => {
  assert.equal(gruppoStima('RS-0402-75R-1-63MW_KI'), 'RS-0402');
  assert.equal(gruppoStima('CC-THT-100NF-10-63V'), null);
  assert.equal(gruppoStima('IC-SOIC8-LM358'), null);
  assert.equal(gruppoStima('CSC100NX50VN'), 'CC-0603');
  assert.equal(gruppoDaDescrizione('RESISTORE SMD 0603 330OHM'), 'RS-0603');
  assert.equal(gruppoDaDescrizione('CONDENSATORE TANTALIO SMD 1206 16V 10UF'), null);
  const s = stimePerGruppo([{ codice: 'RS-0402-1K-1-63MW', prezzo: 0.002 }, { codice: 'RS-0402-2K-1-63MW', prezzo: 0.004 }, { codice: 'RS-0402-3K-1-63MW', prezzo: 0.1 },
    { codice: 'RS-0603-1K-1-100MW', prezzo: 0.003 }]);
  assert.deepEqual(s.get('RS-0402'), { prezzo: 0.004, quanti: 3 });
  assert.equal(s.has('RS-0603'), false);
});

test('riepilogo: valore per proprietario bobina per bobina e % di riconoscimento per cliente', () => {
  const tab = { LPS: 'c1', IDEA: 'c2', PIPPO: 'casteltech' };
  const articoli = [{ codice: 'A', quantita: 100, prezzo: 2, proprietario_file: 'CASTELTECH' }, { codice: 'B', quantita: 50, prezzo: null, proprietario_file: 'IDEA' }];
  const bobine = [{ codice: 'A', quantita: 60, sigla: 'LPS' }, { codice: 'A', quantita: 30, sigla: 'PIPPO' }];   // 10 pezzi senza bobina: al codice
  const q = quote(articoli, bobine, tab, 'bobina');
  const r = riepilogo(q, { predefinita: 50, clienti: { c1: 20 } });
  assert.deepEqual(r.casteltech, { codici: 1, pezzi: 40, valore: 80, senzaPrezzo: 0 });
  assert.deepEqual(r.clienti.map(c => [c.clienteId, c.pezzi, c.valore, c.percentuale, c.riconosciuto, c.senzaPrezzo]), [[1, 60, 120, 20, 24, 0], [2, 50, 0, 50, 0, 1]]);
  assert.deepEqual(r.totaleClienti, { valore: 120, riconosciuto: 24 });
  assert.equal(percentualeValida('35,5'), 35.5);
  assert.equal(percentualeValida('120'), null);
  assert.equal(percentualeValida(''), null);
});

test('stoccaggio: rotte montate prima delle pagine delle macchine, guida', () => {
  const index = readFileSync(new URL('../src/server/index.ts', import.meta.url), 'utf8');
  assert.ok(index.indexOf('rotteArmadi()') > 0 && index.indexOf('rotteArmadi()') < index.indexOf('rotteMacchine()'));
  assert.equal(cercaGuida('valore magazzino bobine clienti')[0]?.argomento.id, 'stoccaggio-componenti');
});

test('% dei codici con prezzo e pagina divisa in senza / con prezzo con filtro per proprietario (Adriano 13/11/2026)', () => {
  assert.equal(percentualeConPrezzo(1631, 149), 90.9);
  assert.equal(percentualeConPrezzo(10, 0), 100);
  assert.equal(percentualeConPrezzo(0, 0), null);
  const rotta = readFileSync(new URL('../src/server/rotte/armadi.ts', import.meta.url), 'utf8');
  assert.match(rotta, /<th>Proprietario<\/th>/);
  assert.match(rotta, /Componenti senza prezzo/);
  assert.match(rotta, /Componenti con il prezzo/);
  assert.match(rotta, /di_\$\{sez\}/);
});

test('sigle raggruppate per cliente: "Di chi è" non cambia, una riga per cliente (Adriano 13/11/2026)', () => {
  const clienti = [{ id: 7, ragione_sociale: 'EUROAUTOMATIONS S.R.L.' }, { id: 9, ragione_sociale: 'ARILAN S.R.L.' }];
  const sigle = ['EUR.AUT.', 'EURO', 'EUROAUTOM', 'SANDRA', 'XYZ'];
  const tabella = { 'EUR.AUT.': 'casteltech', EURO: 'casteltech', EUROAUTOM: 'casteltech', SANDRA: 'c9', XYZ: '' };
  // Proposte: EUROAUTOM da SIGLE_CLIENTI anche se il materiale è di Casteltech, SANDRA dal "Di chi è"; le scelte salvate vincono
  const k = clientiDelleSigle(sigle, clienti, tabella, { 'EUR.AUT.': 'c7', EURO: 'c7' });
  assert.deepEqual(k, { 'EUR.AUT.': 'c7', EURO: 'c7', EUROAUTOM: 'c7', SANDRA: 'c9', XYZ: '' });
  const pezzi = new Map([['EUR.AUT.', 10], ['EURO', 5], ['EUROAUTOM', 1], ['SANDRA', 3], ['XYZ', 2]]);
  const g = gruppiSigle(sigle, tabella, k, pezzi, new Map([['c7', 'EUROAUTOMATIONS S.R.L.'], ['c9', 'ARILAN S.R.L.']]));
  assert.equal(g.length, 3);
  assert.deepEqual(g[0], { sigle: ['SANDRA'], cliente: 'c9', diChi: 'c9', diversi: false, pezzi: 3 });   // Arilan prima di Euroautomations
  assert.deepEqual(g[1], { sigle: ['EUR.AUT.', 'EURO', 'EUROAUTOM'], cliente: 'c7', diChi: 'casteltech', diversi: false, pezzi: 16 });
  assert.equal(g[2].sigle[0], 'XYZ');
  // Scelte diverse nella stessa riga: vale la più frequente, segnalata
  const g2 = gruppiSigle(['A', 'B', 'C'], { A: 'casteltech', B: 'casteltech', C: 'c7' }, { A: 'c7', B: 'c7', C: 'c7' }, new Map());
  assert.equal(g2[0].diChi, 'casteltech');
  assert.equal(g2[0].diversi, true);
  // "— nessuno —" salvato = sigla sola anche se proposta
  assert.equal(clientiDelleSigle(['EUROAUTOM'], clienti, {}, { EUROAUTOM: '' }).EUROAUTOM, '');
  const rotta = readFileSync('src/server/rotte/armadi.ts', 'utf8');
  assert.match(rotta, /<th>Cliente<\/th><th>Di chi è<\/th>/);
  assert.match(rotta, /SEPARATORE_SIGLE/);
});
