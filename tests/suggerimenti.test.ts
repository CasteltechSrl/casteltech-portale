import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggiornamentoDaClaude, aggiungiNota, chiuso, ordinaSuggerimenti, preparaSuggerimento } from '../src/engine/suggerimenti.js';

test('suggerimento: serve il titolo, il resto ha valori di partenza', () => {
  assert.match(preparaSuggerimento({ titolo: '   ' }, '2026-10-27').errore!, /titolo/);
  const { suggerimento: s, errore } = preparaSuggerimento({ titolo: '  Avviso   Telegram ', proposto_da: ' FEDERICO ', descrizione: ' riga 1\r\nriga 2 ' }, '2026-10-27');
  assert.equal(errore, null);
  assert.equal(s.titolo, 'Avviso Telegram');
  assert.equal(s.proposto_da, 'Federico');
  assert.equal(s.descrizione, 'riga 1\nriga 2');
  assert.equal(s.proposto_il, '2026-10-27');
  assert.equal(s.area, 'generale');
  assert.equal(s.priorita, 'media');
  assert.equal(s.stato, 'da_valutare');
  assert.equal(s.note, null);
});

test('suggerimento: area, priorità e stato solo tra quelli previsti; data scritta male = oggi', () => {
  const { suggerimento: s } = preparaSuggerimento({ titolo: 'x', area: 'avvisi', priorita: 'alta', stato: 'in_programma', proposto_il: '2026-09-01' }, '2026-10-27');
  assert.deepEqual([s.area, s.priorita, s.stato, s.proposto_il], ['avvisi', 'alta', 'in_programma', '2026-09-01']);
  const { suggerimento: t } = preparaSuggerimento({ titolo: 'x', area: 'altro', priorita: 'urgente', stato: 'boh', proposto_il: '01/09/2026' }, '2026-10-27');
  assert.deepEqual([t.area, t.priorita, t.stato, t.proposto_il], ['generale', 'media', 'da_valutare', '2026-10-27']);
});

test('suggerimenti: in sviluppo e in programma in cima, poi per priorità e dal più vecchio; fatti e scartati in fondo', () => {
  const r = (id: number, stato: string, priorita: string, proposto_il: string) => ({ id, stato, priorita, proposto_il });
  const ordine = ordinaSuggerimenti([
    r(1, 'fatto', 'alta', '2026-01-01'), r(2, 'da_valutare', 'bassa', '2026-01-01'), r(3, 'da_valutare', 'alta', '2026-10-27'),
    r(4, 'da_valutare', 'alta', '2026-10-01'), r(5, 'in_sviluppo', 'bassa', '2026-10-27'), r(6, 'scartato', 'alta', '2026-01-01'), r(7, 'in_programma', 'media', '2026-10-27'),
  ]).map(x => x.id);
  assert.deepEqual(ordine, [5, 7, 4, 3, 2, 1, 6]);
  assert.ok(chiuso('fatto') && chiuso('scartato') && !chiuso('in_programma'));
});

test('suggerimenti: "Da chiarire" (aspetta una risposta) va in cima', () => {
  const r = (id: number, stato: string) => ({ id, stato, priorita: 'media', proposto_il: '2026-10-27' });
  assert.deepEqual(ordinaSuggerimenti([r(1, 'in_sviluppo'), r(2, 'da_chiarire'), r(3, 'da_valutare')]).map(x => x.id), [2, 1, 3]);
  assert.ok(!chiuso('da_chiarire'));
});

test('suggerimenti: aggiornamento da Claude con stato, domanda e nota datata in fondo', () => {
  const a = aggiornamentoDaClaude({ stato: 'da_chiarire', risposta: ' Chi è il responsabile? ', nota: 'letto' }, '01/11/2026');
  assert.deepEqual(a, { stato: 'da_chiarire', risposta: 'Chi è il responsabile?', nota: '01/11/2026 Claude: letto', errore: null });
  assert.match(aggiornamentoDaClaude({ stato: 'chiuso' }, '01/11/2026').errore!, /Stato non previsto/);
  assert.match(aggiornamentoDaClaude({}, '01/11/2026').errore!, /Niente da aggiornare/);
  assert.equal(aggiungiNota('prima', 'dopo'), 'prima\ndopo');
  assert.equal(aggiungiNota(null, 'dopo'), 'dopo');
  assert.equal(aggiungiNota('prima', null), 'prima');
});
