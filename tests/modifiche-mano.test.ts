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
