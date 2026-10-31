import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileDellaVersione, richiesteDaEmail, richiesteDaTesto, versioneDa, versioniDaDividere } from '../src/engine/scheda/versioni.js';
import { unisciBomDivise } from '../src/engine/scheda/bom-divise.js';
import { analizzaScheda, leggiBomScheda } from '../src/engine/scheda/analisi.js';
import { parametriDaCicli } from '../src/engine/scheda/preventivo.js';
import { COLONNA_ALTERNATIVE, unisciAlternative } from '../src/engine/codifica/alternative-bom.js';

const MAIL_M0929 = `Buongiorno Adriano,

come anticipato per le brevi, con la presente si richiede la Vs. quotazione
per la produzione delle seguenti schede:

*         167pz    M0929-C versione HELIOS

*          90pz    M0929-C Versione CRONOS

di cui alleghiamo la relativa documentazione.`;

test('versioni: quantità e versioni lette dalla mail (RFQ M0929-C)', () => {
  const r = richiesteDaTesto(MAIL_M0929);
  assert.deepEqual(r, [
    { quantita: 167, descrizione: 'M0929-C versione HELIOS', versione: 'HELIOS' },
    { quantita: 90, descrizione: 'M0929-C Versione CRONOS', versione: 'CRONOS' },
  ]);
  assert.equal(versioniDaDividere(r).length, 2);
  assert.deepEqual(richiesteDaTesto('n. 1.000 schede EA1002-0\nEA1001 x 50 pz'), [
    { quantita: 1000, descrizione: 'EA1002-0', versione: null }, { quantita: 50, descrizione: 'EA1001', versione: null }]);
  assert.deepEqual(richiesteDaTesto('Grazie, cordiali saluti.\nTel. 0372 471806'), []);
  assert.deepEqual(versioniDaDividere(richiesteDaTesto('500 pz EA1002')), []);   // una sola: niente da dividere
  assert.equal(versioneDa('scheda VT106 variante B'), 'B');
});

test('versioni: file comuni a tutte, file con il nome della versione solo alla sua', () => {
  const tutte = ['HELIOS', 'CRONOS'];
  assert.equal(fileDellaVersione('BOM_HELIOS_V2.0.csv', 'HELIOS', tutte), true);
  assert.equal(fileDellaVersione('BOM_CRONOS3_V2.0 PTH.csv', 'HELIOS', tutte), false);
  assert.equal(fileDellaVersione('BOM_CRONOS3_V2.0 PTH.csv', 'CRONOS', tutte), true);
  assert.equal(fileDellaVersione('lamine M0929 RevC.zip', 'CRONOS', tutte), true);
  assert.equal(fileDellaVersione('gerber/M0929-C.GTL', 'HELIOS', tutte), true);
});

test('BOM divisa in due file (SMD e PTH): si uniscono; la BOM di un\'altra versione no', () => {
  const righe = (t: string) => leggiBomScheda(t.trim().split('\n').map(r => r.match(/("[^"]*"|[^,]+)/g)!.map(c => c.replace(/"/g, '')))).righe;
  const smd = { nome: 'BOM_HELIOS.csv', righe: righe('Designator,Comment,Footprint,Quantity\n"R1,R2",10K,0603,2\nC1,100nF,0603,1') };
  const pth = { nome: 'BOM_HELIOS_PTH.csv', righe: righe('Designator,Comment,Footprint,Quantity\nJ1,CONN,THT,1\nJ2,CONN,THT,1') };
  const cronos = { nome: 'BOM_CRONOS.csv', righe: righe('Designator,Comment,Footprint,Quantity\n"R1,R2",22K,0603,2\nC1,100nF,0603,1') };
  assert.equal(smd.righe.length, 2);
  const u = unisciBomDivise([smd, pth, cronos]);
  assert.deepEqual(u.unite.map(b => b.nome), ['BOM_HELIOS.csv', 'BOM_HELIOS_PTH.csv']);
  assert.deepEqual(u.scartate.map(b => b.nome), ['BOM_CRONOS.csv']);
  assert.deepEqual(u.unite.flatMap(b => b.righe.flatMap(r => r.designatori)), ['R1', 'R2', 'C1', 'J1', 'J2']);
});

test('quantità scritta solo nell\'oggetto della mail (Adriano 29/10/2026: «Ordine 5 PCB MULTI»)', () => {
  const r = richiesteDaEmail({ oggetto: 'R: Ordine 5 PCB MULTI', testo: 'Buongiorno,\nin allegato i file aggiornati.\nSaluti' });
  assert.deepEqual(r.map(x => x.quantita), [5]);
  // il testo vince sull'oggetto
  assert.deepEqual(richiesteDaEmail({ oggetto: 'Ordine 5 PCB', testo: '167pz M0929-C versione HELIOS' }).map(x => x.quantita), [167]);
  assert.deepEqual(richiesteDaEmail({ oggetto: 'Richiesta offerta', testo: '' }), []);
});

test('mail salvata come .eml nella cartella: quantità e versioni dal suo testo (Adriano 29/10/2026)', async () => {
  const { leggiEmail } = await import('../src/engine/acquisizioni.js');
  const eml = 'From: Marco <m@cliente.it>\r\nSubject: RFQ_26225 *** Documentazione per scheda M0929-C\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset="utf-8"\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n'
    + 'Buongiorno,\r\n=E2=80=A2         167pz      M0929-C versione HELIOS\r\n=E2=80=A2         90pz       M0929-C Versione CRONOS\r\n';
  const e = leggiEmail(Buffer.from(eml, 'latin1'));
  assert.deepEqual(versioniDaDividere(richiesteDaEmail(e)).map(v => `${v.versione} ${v.quantita}`), ['HELIOS 167', 'CRONOS 90']);
});

// ── più codici nella stessa mail (RDO Elemaster, Adriano 29/10/2026); dati inventati con la stessa forma ──
const MAIL_CODICI = `Buon pomeriggio,

La presente per richiedere la vostra miglior quotazione per i seguenti codici.

Primo odp 43pz
Forecast 2026 --> 318pz (lotto unico)
Forecast 2027 --> 742pz (lotto medio 106pz)

40001234 PCA SCHEDA MISURA BASE LF CLIENTE UNO
SERIG. AUT. CREMA SALDANTE
SALD ONDA THT
MTG/SALD MANUALE COMP. THT
FISSAGGIO COMP. CON COLLA O FASCETTA---->fissaggio dell'induttanza con il
silicone

Primo odp 131pz
Forecast 2027 --> 120pz (lotto medio 60pz)

1005678 PCA S99 LF CLIENTE DUE
APPLICAZIONE ETICHETTE PERSONALIZZATE
ISP. VISIVA AOI SMT
RASATURA

Grazie`;

test('versioni: due codici nella stessa mail, ognuno con quantità, previsioni e cicli', () => {
  const r = richiesteDaEmail({ testo: MAIL_CODICI, oggetto: 'RDO 40001234 PCA SCHEDA MISURA / 1005678 PCA S99 LF' });
  assert.equal(r.length, 2);
  assert.deepEqual(r.map(x => [x.codice, x.quantita, x.versione]), [['40001234', 43, '40001234'], ['1005678', 131, '1005678']]);
  assert.equal(r[0].descrizione, 'PCA SCHEDA MISURA BASE LF CLIENTE UNO');
  assert.deepEqual(r[0].forecast, ['Forecast 2026 318pz (lotto unico)', 'Forecast 2027 742pz (lotto medio 106pz)']);
  assert.equal(r[0].cicli!.length, 4);
  assert.match(r[0].cicli![3], /COLLA O FASCETTA.*silicone$/); // riga andata a capo unita
  assert.deepEqual(r[1].cicli, ['APPLICAZIONE ETICHETTE PERSONALIZZATE', 'ISP. VISIVA AOI SMT', 'RASATURA']);
  assert.deepEqual(versioniDaDividere(r).map(v => v.versione), ['40001234', '1005678']);
  // i file vanno al loro codice (cartelle dello zip con il codice nel nome)
  assert.equal(fileDellaVersione('40001234-1596216/40001234_BOM_Report.xlsx', '40001234', ['40001234', '1005678']), true);
  assert.equal(fileDellaVersione('1005678-1587136/1005678_BOM_Report.xlsx', '40001234', ['40001234', '1005678']), false);
});

test('versioni: un numero in testa a una riga non è un codice se non è nell\'oggetto o negli allegati', () => {
  const r = richiesteDaEmail({ testo: MAIL_CODICI, oggetto: 'Richiesta di offerta' });
  assert.ok(r.every(x => !x.codice));
  // il codice si riconosce anche dal nome dell'allegato
  const daAllegati = richiesteDaEmail({ testo: MAIL_CODICI, oggetto: 'RDO', allegati: [{ nome: '40001234-1596216.zip' }, '1005678-1587136.zip'] });
  assert.deepEqual(daAllegati.map(x => x.codice), ['40001234', '1005678']);
  // la mail con le versioni (M0929-C) resta come prima
  assert.deepEqual(richiesteDaEmail({ testo: MAIL_M0929, oggetto: 'RFQ M0929-C' }).map(x => x.versione), ['HELIOS', 'CRONOS']);
});

test('versioni: quantità scritta dopo il codice', () => {
  const r = richiesteDaEmail({ testo: 'EA1002-0 scheda alimentatore\n500 pz\n\nEA2003-1 scheda display\n200 pz', oggetto: 'offerta EA1002-0 e EA2003-1' });
  assert.deepEqual(r.map(x => [x.codice, x.quantita]), [['EA1002-0', 500], ['EA2003-1', 200]]);
});

test('preventivo: i cicli del cliente accendono le spunte, le altre lavorazioni vanno in Da controllare', () => {
  const r = parametriDaCicli(['SERIG. AUT. CREMA SALDANTE', 'INSERIM. MANUALE COMP. THTxSALD.ONDA', 'SALD ONDA THT', 'MTG/SALD MANUALE COMP. THT',
    'ISP. VISIVA AOI SMT', 'APPLICAZIONE ETICHETTE PERSONALIZZATE--->ETICHETTA INIZIALE', 'PREFORMATURA COMPONENTI', 'RASATURA', 'ISP. VISIVA THT']);
  assert.deepEqual(r.parametri, { usaOnda: 1, presenteTht: 1, aoiTop: 1, etichette: 1 });
  assert.match(r.daControllare[0], /PREFORMATURA COMPONENTI, RASATURA$/);
  assert.match(r.daControllare[1], /punti di saldatura a mano/);
});

test('BOM con alternative del cliente (Pref/Alt, LLC): una riga per componente, codice dalla preferita', () => {
  const righe = [
    ['LLC', 'NUMBER', 'Pref/Alt', 'DESCRIPTION', 'MFG', 'MPN', 'QTY', 'REF'],
    ['1', 'X-001', '', 'SMD RES. 1,8KOHM 0805 0,1% LF', '', '', '1', 'R10'],
    ['2', '101', 'Pref', 'SMD RES. 1,8KOHM 0805 0,1% LF', 'YAGEO', 'RT0805BRD071K8L', '1', 'R10'],
    ['2', '102', 'Alt', 'SMD RES. 1,8KOHM 0805 0,1% LF', 'PANASONIC', 'ERA6AEB182V', '1', 'R10'],
    ['1', '103', 'Pref', 'RES.CARBON 100 OHM 1W 5% LF', 'YAGEO', 'CFR100JT-52100R', '2', 'R98,R119'],
    ['1', '104', 'Alt', 'RES.CARBON 100 OHM 1W 5% LF', 'ROYAL OHM', 'CFR01SJ0101A10', '2', 'R98,R119'],
  ];
  const u = unisciAlternative(righe);
  assert.equal(u.length, 3);
  assert.equal(u[0].at(-1), COLONNA_ALTERNATIVE);
  assert.deepEqual([u[1][5], u[1].at(-1)], ['RT0805BRD071K8L', 'PANASONIC ERA6AEB182V']);
  assert.deepEqual([u[2][5], u[2].at(-1)], ['CFR100JT-52100R', 'ROYAL OHM CFR01SJ0101A10']);
  assert.equal(unisciAlternative([['REF', 'MPN'], ['R1', 'X'], ['R2', 'Y']]).length, 3); // senza alternative non cambia niente
});

test('BOM senza colonna del montaggio: descrizione "SMD …" = SMD, le altre THT; meccanica e documenti esclusi', () => {
  const righe = [
    ['DESCRIPTION', 'MFG', 'MPN', 'QTY', 'REF', 'AS. METHOD'],
    ['PCB S61 REV.2 370cmq DF LF', 'ELEPRINT', 'S61 REV.2', '1', '', ''],
    ['SMD RES. 4,7KOHM 0805 5% LF', 'YAGEO', 'RC0805JR-074K7L', '2', 'R1,R2', ''],
    ['SMD CAP. CER. MULT. 100nF 50V 0603 X7R 10% LF', '', '', '1', 'C1', ''],
    ['SMD IC LM358 SO8 LF', '', '', '1', 'U1', ''],
    ['CAP. ELECTROL. 1000uF 50V VT h.25 d.12,5 LF', 'RUBYCON', '50PX1000MEFC12,5X25', '1', 'C2', ''],
    ['TRIAC BTA 24/800BW TO220 LF', '', '', '1', 'Q1', ''],
    ['FUSE 5x20 2A T DELAYED LF', '', '', '1', 'F1', 'POST WAVE ASSEMBLY'],
    ['FUSE HOLDER 5x20 031.8211 LF', '', '', '1', 'F1', ''],
    ['HEATSINK 531102B02500G LF', 'AAVID', 'EM_1', '1', 'Q1', ''],
    ['SCREW CHEESE HEAD SLOTTED 3MAx8 ZINC LF', '', '', '1', 'Q1', ''],
    ['KNOB S150-006-N LF', '', '', '1', '', 'MECHANICAL ASSEMBLE'],
  ];
  const b = leggiBomScheda(righe);
  const per = (d: string) => b.righe.filter(r => r.designatori.includes(d));
  assert.equal(per('R1')[0].montaggio, 'SMD');
  assert.equal(per('C2')[0].montaggio, 'THT');
  assert.equal(per('C2')[0].montaggioDa, 'descrizione');
  assert.equal(per('Q1').find(r => r.descrizione.startsWith('HEATSINK'))!.accessorio, true);
  assert.equal(per('F1')[0].dopoOnda, true);
  const a = analizzaScheda({ bom: { nome: 'bom.xlsx', righe: b.righe } });
  assert.deepEqual([a.conteggi.smdTop, a.conteggi.tht], [4, 3]); // R1 R2 C1 U1 · C2 Q1 F1
  assert.equal(a.componenti.find(c => c.ref === 'Q1')!.bom!.descrizione, 'TRIAC BTA 24/800BW TO220 LF'); // non il dissipatore
  assert.equal(a.componenti.find(c => c.ref === 'F1')!.bom!.descrizione, 'FUSE HOLDER 5x20 031.8211 LF'); // il pezzo saldato
  assert.equal(a.lavorazione.saldaturaTht, 'onda');
  assert.ok(a.segnalazioni.some(s => /dopo l'onda/.test(s.testo) && s.refs?.includes('F1')));
  assert.ok(a.segnalazioni.some(s => /materiale di montaggio/.test(s.testo)));
});
