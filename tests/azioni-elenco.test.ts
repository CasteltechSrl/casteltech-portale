import { test } from 'node:test';
import assert from 'node:assert/strict';
import { casella, conMessaggio, idsSpuntati, moduloAzioni, testiSelezione } from '../src/server/views/azioni-elenco.js';
import { commesseEliminabiliDallElenco } from '../src/engine/eliminazioni.js';

test('elenchi con spunte: testi della selezione al maschile e al femminile', () => {
  assert.deepEqual(testiSelezione({ singolare: 'preventivo', plurale: 'preventivi' }),
    { nessuno: 'Nessun preventivo selezionato', uno: '1 preventivo selezionato', tanti: '{n} preventivi selezionati' });
  assert.deepEqual(testiSelezione({ singolare: 'commessa', plurale: 'commesse', femminile: true }),
    { nessuno: 'Nessuna commessa selezionata', uno: '1 commessa selezionata', tanti: '{n} commesse selezionate' });
});

test('elenchi con spunte: modulo, pulsanti spenti finché non si spunta, conferma e gruppi', () => {
  const m = moduloAzioni({
    azione: '/ordini/azioni', nome: { singolare: 'riga', plurale: 'righe', femminile: true }, gruppi: { singolare: 'ordine', plurale: 'ordini' },
    pulsanti: [
      { azione: 'conferma', testo: "Conferma d'ordine", serve: '1' },
      { azione: 'elimina', testo: 'Elimina', serve: '1+', pericolo: true, chiedi: 'Ordini da eliminare: {g} "tutti"' },
    ],
  });
  const h = String(m.apri) + String(m.chiudi);
  assert.match(h, /<form method="post" action="\/ordini\/azioni" class="azioni-elenco"/);
  assert.match(h, /data-gruppo-uno="ordine" data-gruppo-tanti="ordini"/);
  assert.match(h, /value="conferma" data-serve="1" disabled/);
  assert.match(h, /class="pericolo"/);
  assert.match(h, /data-chiedi="Ordini da eliminare: \{g\} &quot;tutti&quot;"/);   // testo protetto
  assert.match(h, /Conferma d&#39;ordine/);
  assert.match(h, /<\/form>$/);
  assert.match(String(casella(7, 'ordine 12/2026', 3)), /name="ids" value="7" aria-label="Seleziona ordine 12\/2026" data-gruppo="3"/);
  assert.doesNotMatch(String(casella(7, 'x')), /data-gruppo/);
});

test('elenchi con spunte: righe arrivate dal modulo e ritorno all\'elenco con il messaggio', () => {
  assert.deepEqual(idsSpuntati({ ids: ['3', '3', '5', 'x', '-1', '0'] }), [3, 5]);
  assert.deepEqual(idsSpuntati({ ids: '9' }), [9]);
  assert.deepEqual(idsSpuntati(undefined), []);
  assert.equal(conMessaggio('/ordini?vista=tutti&q=ABC&msg=vecchio', 'Fatto.'), '/ordini?vista=tutti&q=ABC&msg=Fatto.');
  assert.equal(conMessaggio('/ordini', '2 righe'), '/ordini?msg=2+righe');
});

test('commesse: dall\'elenco si eliminano insieme solo quelle aperte e senza tempi', () => {
  const { si, no } = commesseEliminabiliDallElenco([
    { numero: 'A', stato: 'aperta', tempi: 0 },
    { numero: 'B', stato: 'aperta', tempi: 3 },
    { numero: 'C', stato: 'rientrata', tempi: 0 },
  ]);
  assert.deepEqual(si.map(c => c.numero), ['A']);
  assert.deepEqual(no.map(c => c.numero), ['B', 'C']);
});
