import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leggiQuantitaScheda, leggiScartoAMano, numeroRigaNuova, pezziScartoAMano, scriviNellaRiga, testoScarto } from '../src/engine/codifica/modifiche-mano.js';
import { ETICHETTE_RUOLI } from '../src/engine/codifica/bom.js';
import { controlliPiuPreventivi, indirizzoOrdine, notaPreventivi } from '../src/engine/ordine-da-preventivo.js';
import { elencoProponenti, preparaSuggerimento } from '../src/engine/suggerimenti.js';
import { cercaGuida } from '../src/engine/guida.js';

test('BOM a mano: scarto in pezzi o in percentuale, vuoto = standard, scritto male = errore', () => {
  assert.deepEqual(leggiScartoAMano(''), { scarto: null });
  assert.deepEqual(leggiScartoAMano(' 10 '), { scarto: { pezzi: 10 } });
  assert.deepEqual(leggiScartoAMano('5 %'), { scarto: { percento: 5 } });
  assert.deepEqual(leggiScartoAMano('2,5%'), { scarto: { percento: 2.5 } });
  assert.match(leggiScartoAMano('dieci').errore!, /Scarto non valido/);
  assert.match(leggiScartoAMano('1,5').errore!, /intero/);
  assert.match(leggiScartoAMano('150%').errore!, /100%/);
  assert.equal(pezziScartoAMano({ pezzi: 10 }, 400), 10);
  assert.equal(pezziScartoAMano({ percento: 5 }, 401), 21);
  assert.equal(pezziScartoAMano({ percento: 5 }, 400), 20);
  assert.equal(testoScarto({ percento: 2.5 }), '2,5%');
  assert.equal(testoScarto(null), '');
});

test('BOM a mano: il P/N si scrive nella sua colonna; senza colonna se ne aggiunge una "(a mano)"', () => {
  const con = scriviNellaRiga(['MPN', 'Qty'], { pn: 'MPN', quantita: 'Qty' }, ['GRM188', '4'], { pn: 'GRM155', quantita: '2' }, ETICHETTE_RUOLI);
  assert.deepEqual(con, { colonne: ['MPN', 'Qty'], mappatura: { pn: 'MPN', quantita: 'Qty' }, celle: ['GRM155', '2'] });
  const senza = scriviNellaRiga(['Valore', 'Qty'], { valore: 'Valore', quantita: 'Qty' }, ['10K', '4'], { pn: 'RC0603FR-0710KL' }, ETICHETTE_RUOLI);
  assert.deepEqual(senza.colonne, ['Valore', 'Qty', 'P/N (a mano)']);
  assert.equal(senza.mappatura.pn, 'P/N (a mano)');
  assert.deepEqual(senza.celle, ['10K', '4', 'RC0603FR-0710KL']);
  // niente da scrivere in una colonna che non c'è: nessuna colonna nuova
  assert.deepEqual(scriviNellaRiga(['Qty'], { quantita: 'Qty' }, ['4'], { pn: null }, ETICHETTE_RUOLI).colonne, ['Qty']);
});

test('BOM a mano: la riga aggiunta va dopo tutte; quantità a scheda anche con la virgola', () => {
  assert.equal(numeroRigaNuova([{ n: 2 }, { n: 7 }], [{ n: 9 }]), 10);
  assert.equal(numeroRigaNuova([]), 1);
  assert.equal(leggiQuantitaScheda('0,5'), 0.5);
  assert.equal(leggiQuantitaScheda('4'), 4);
  assert.equal(leggiQuantitaScheda('-1'), null);
  assert.equal(leggiQuantitaScheda('due'), null);
});

test('ordine unico da più preventivi: stesso cliente, tutti con il cliente in anagrafica', () => {
  assert.deepEqual(controlliPiuPreventivi([{ numero: 'P-1', clienteId: 3 }, { numero: 'P-2', clienteId: 3 }]), []);
  assert.match(controlliPiuPreventivi([{ numero: 'P-1', clienteId: 3 }, { numero: 'P-2', clienteId: 4 }])[0], /clienti diversi/);
  assert.match(controlliPiuPreventivi([{ numero: 'P-1', clienteId: 3 }, { numero: 'P-2', clienteId: null }])[0], /P-2/);
  assert.match(controlliPiuPreventivi([])[0], /almeno/);
  assert.equal(indirizzoOrdine([5]), '/preventivi/5/ordine');
  assert.equal(indirizzoOrdine([5, 8, 5]), '/preventivi/ordine?p=5&p=8');
  assert.equal(notaPreventivi(['P-1']), 'Dal preventivo P-1.');
  assert.equal(notaPreventivi(['P-1', 'P-2']), 'Dai preventivi P-1, P-2.');
});

test('suggerimenti: "Proposto da" obbligatorio; menu con gli utenti senza doppioni, il nome vecchio resta', () => {
  assert.match(preparaSuggerimento({ titolo: 'Idea' }, '2026-11-02').errore!, /chi ha proposto/);
  assert.equal(preparaSuggerimento({ titolo: 'Idea', proposto_da: 'federico' }, '2026-11-02').errore, null);
  assert.deepEqual(elencoProponenti(['Federico', 'Cinzia', ' federico '], 'Adriano Croci'), ['Adriano Croci', 'Cinzia', 'Federico']);
  assert.deepEqual(elencoProponenti(['Cinzia'], null), ['Cinzia']);
});

test('guida: modifiche a mano della BOM e ordine da più preventivi si trovano', () => {
  assert.equal(cercaGuida('aggiungere riga bom componente comprato altrove')[0]?.argomento.id, 'bom-modifiche-mano');
  assert.equal(cercaGuida('ordine unico più preventivi')[0]?.argomento.id, 'ordine-da-preventivo');
});

test('BOM: "Verificato" conferma un codice da verificare e toglie la nota CODICE DA VALIDARE', async () => {
  const { confermaVerifica, NOTA_VERIFICATO } = await import('../src/engine/codifica/modifiche-mano.js');
  const E = { NUOVO: 'NUOVO', NUOVO_VER: 'NUOVO - DA VERIFICARE' };
  const riga = { esito: E.NUOVO_VER, codiceGestionale: 'TTB-DP18-ULN28-001', note: ['PDIP-18 come il DIP-6 già in tabella (DP06)', 'CODICE DA VALIDARE: valori standard'] };
  const x = confermaVerifica(riga, E, 'CODICE DA VALIDARE', 'ADRIANO', '04/11/2026');
  assert.ok(x.ok);
  if (x.ok) {
    assert.equal(x.riga.esito, 'NUOVO');
    assert.deepEqual(x.riga.note, ['PDIP-18 come il DIP-6 già in tabella (DP06)', `${NOTA_VERIFICATO} ADRIANO il 04/11/2026`]);
  }
  const giaOk = confermaVerifica({ ...riga, esito: 'NUOVO' }, E, 'CODICE DA VALIDARE', 'A', 'oggi');
  assert.equal(giaOk.ok, false);
  const senzaCodice = confermaVerifica({ ...riga, codiceGestionale: null }, E, 'CODICE DA VALIDARE', 'A', 'oggi');
  assert.ok(!senzaCodice.ok && /Ricalcola/.test(senzaCodice.errore));
});

test('BOM: per ogni famiglia si vedono solo i campi che servono, con un esempio', async () => {
  const { campiFamiglia, esempioCampo, mappaCampiFamiglie } = await import('../src/engine/codifica/campi-famiglia.js');
  const { ATTR, calcola } = await import('../src/engine/codifica/regole.js');
  assert.deepEqual(campiFamiglia('DL'), ['case', 'tensione', 'corrente', 'colore']);
  assert.deepEqual(campiFamiglia('TB'), ['case', 'tensione', 'corrente', 'tipo']);
  assert.deepEqual(campiFamiglia('CN'), ['tipo', 'passo', 'poli']);
  assert.deepEqual(campiFamiglia(''), [...ATTR]);
  assert.equal(esempioCampo('DL', 'corrente'), '20MA');
  assert.equal(esempioCampo('TB', 'case', 'T'), 'TO-92');
  assert.equal(esempioCampo('TB', 'case', 'S'), 'SOT-23');
  // con i soli campi mostrati (riempiti con gli esempi) il codice di produzione si calcola per tutte le famiglie che hanno un esempio per ogni campo
  const m = mappaCampiFamiglie();
  for (const fam of ['RS', 'CC', 'DL', 'TB', 'ID', 'FS']) {
    const attr = Object.fromEntries(m[fam].campi.map(k => [k, m[fam].esempi[k].split(',')[0]]));
    const c = calcola(fam, attr, 'ABC123');
    assert.ok(c.prod, `${fam}: ${c.note.join('; ')}`);
  }
});

test('BOM: connettore in MI (RJ45 THT) → consiglio di usare CN, che dà il codice gestionale', async () => {
  const { mappaCampiFamiglie } = await import('../src/engine/codifica/campi-famiglia.js');
  const { calcola } = await import('../src/engine/codifica/regole.js');
  assert.match(mappaCampiFamiglie().MI.consiglio!, /CN · Connettori/);
  assert.equal(calcola('MI', { case: 'THT', tipo: 'RJ45', tecnologia: 'T' }, 'HR911105A').root, null);
  assert.equal(calcola('CN', { tipo: 'RJ45', passo: '1.02', poli: '8', tecnologia: 'T' }, 'HR911105A').root, 'TCN-RJ45-10208');
});

test('BOM: connettore in MI (RJ45 HR911105A) passa da solo a CN con i valori standard e resta da validare', async () => {
  const { famigliaProposta } = await import('../src/engine/codifica/famiglia-proposta.js');
  const p = famigliaProposta({ famiglia: 'MI', pn: 'HR911105A', attributi: { case: 'THT', tipo: 'CONN.ETHERNET', tecnologia: 'T' },
    footprint: 'Connector_RJ:RJ45_Hanrun_HR911105A_Horizontal', valore: 'HR911105A', descrizione: 'MISC RJ45 HR911105A' });
  assert.ok(p);
  assert.equal(p!.famiglia, 'CN');
  assert.equal(p!.attributi.tipo, 'RJ45');
  assert.equal(p!.attributi.passo, '1.02');
  assert.equal(p!.attributi.poli, '8');
  assert.match(p!.motivo, /da MI a CN.*valori standard RJ45/);
  // un integrato vero o una famiglia già giusta non si toccano
  assert.equal(famigliaProposta({ famiglia: 'IC', pn: 'ULN2803A', attributi: { case: 'DIP18' }, footprint: 'Package_DIP:DIP-18_W7.62mm' }), null);
  assert.equal(famigliaProposta({ famiglia: 'RS', pn: 'X', attributi: {}, footprint: 'Connector_RJ:RJ45' }), null);
});

test('BOM ricaricata: la correzione "Ricalcola" di un P/N fatta in un\'altra BOM vale ancora, vince la BOM più recente (Adriano 11/11/2026)', async () => {
  const { correzioniPerPn } = await import('../src/engine/codifica/modifiche-mano.js');
  const { pnKey } = await import('../src/engine/codifica/bom.js');
  const tl = (c: string) => ({ pn: 'TL3301NF160QG', famiglia: 'IT', attributi: { case: c, tensione: '0.05A@12VDC', tecnologia: 'S' } });
  const m = correzioniPerPn([
    { bomId: 43, codifica: tl('4SMD60X60X43') },
    { bomId: 12, codifica: tl('VECCHIO') },
    { bomId: 43, codifica: { pn: null, famiglia: 'RS', attributi: {} } },
    { bomId: 40, codifica: { pn: 'TR05S05', famiglia: null, attributi: {} } },
    { bomId: 41, codifica: null },
  ], pnKey);
  assert.equal(m.get(pnKey('tl3301nf160qg')!)?.attributi.case, '4SMD60X60X43');
  assert.equal(m.size, 1); // senza P/N o senza famiglia non vale fuori dalla sua BOM
});
