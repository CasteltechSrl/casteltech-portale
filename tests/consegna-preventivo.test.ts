import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settimanaIso, stimaConsegna } from '../src/engine/consegna-preventivo.js';

test('settimana ISO: inizio e fine anno', () => {
  assert.deepEqual(settimanaIso('2026-11-02'), { settimana: 45, anno: 2026 });
  assert.deepEqual(settimanaIso('2026-01-01'), { settimana: 1, anno: 2026 }); // giovedì
  assert.deepEqual(settimanaIso('2027-01-01'), { settimana: 53, anno: 2026 }); // venerdì: settimana 53 del 2026
  assert.deepEqual(settimanaIso('2025-12-29'), { settimana: 1, anno: 2026 });
  assert.deepEqual(settimanaIso('2026-12-31'), { settimana: 53, anno: 2026 });
});

test('consegna: materiale già in casa, nessun altro lavoro', () => {
  // lunedì 2/11: si parte martedì 3, 20 h su 8 h al giorno = 3 giorni (3, 4, 5), + 5 lavorativi = gio 12/11, venerdì 13/11
  const s = stimaConsegna({ oggi: '2026-11-02', oreLavoro: 20, carico: {}, oreGiorno: 8 });
  assert.equal(s.materialeDal, null);
  assert.equal(s.inizio, '2026-11-03');
  assert.equal(s.fine, '2026-11-05');
  assert.equal(s.giorniLavoro, 3);
  assert.equal(s.consegna, '2026-11-12');
  assert.equal(s.venerdi, '2026-11-13');
  assert.equal(s.settimana, 46);
});

test('consegna: arrivo materiale = l\'ultimo tra componenti e PCB + 3 giorni lavorativi', () => {
  const s = stimaConsegna({ oggi: '2026-11-02', arrivoComponenti: '2026-11-06', arrivoPcb: '2026-11-04', oreLavoro: 4, carico: {}, oreGiorno: 8 });
  assert.equal(s.materialeDal, '2026-11-06');
  assert.equal(s.inizio, '2026-11-11'); // venerdì 6 + 3 lavorativi
  assert.equal(s.fine, '2026-11-11');
  assert.equal(s.consegna, '2026-11-18');
  assert.equal(s.venerdi, '2026-11-20');
  // arrivo nel fine settimana: conta dal lunedì
  assert.equal(stimaConsegna({ oggi: '2026-11-02', arrivoPcb: '2026-11-07', oreLavoro: 1, carico: {}, oreGiorno: 8 }).inizio, '2026-11-12');
  // date non valide ignorate
  assert.equal(stimaConsegna({ oggi: '2026-11-02', arrivoPcb: 'domani', oreLavoro: 1, carico: {}, oreGiorno: 8 }).materialeDal, null);
});

test('consegna: le ore già occupate nel Gantt spostano la fine', () => {
  const carico = { '2026-11-03': 8, '2026-11-04': 6 };
  const s = stimaConsegna({ oggi: '2026-11-02', oreLavoro: 6, carico, oreGiorno: 8 });
  // 3/11 pieno, 4/11 2 h libere, 5/11 4 h → fine 5/11
  assert.equal(s.fine, '2026-11-05');
  assert.equal(s.giorniLavoro, 2);
  assert.equal(s.giorniConAltroLavoro, 2);
});
