import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarioIcs, daRicalcolare, eventiRitardi, piega, type CommessaAperta } from '../src/engine/calendario-ritardi.js';
import type { Barra } from '../src/engine/ordini.js';

// sabato 31/10/2026 → i promemoria "di oggi" vanno al lunedì 2/11
const OGGI = '2026-11-02'; // lunedì
const barra = (p: Partial<Barra>): Barra => ({ id: 1, etichetta: 'ACME · A1', inizio: '2026-11-10', fine: '2026-11-11', giorni: 2, ore: 12,
  stimata: false, inRitardo: false, oltreConsegna: false, consegna: '2026-11-12', ...p });
const commessa = (p: Partial<CommessaAperta>): CommessaAperta => ({ id: 7, numero: '26-100', cliente: 'ACME', codice: 'A1', stato: 'in_produzione',
  consegna: '2026-11-20', uomoPrevistoSec: 36000, uomoFattoSec: 1000, ...p });
const vuoto = { barre: [] as Barra[], carico: {}, oreGiorno: 8, commesse: [] as CommessaAperta[] };

test('calendario ritardi: consegna scaduta, fine superata, doveva partire → promemoria oggi', () => {
  const ev = eventiRitardi({ oggi: OGGI, ...vuoto, barre: [
    barra({ etichetta: 'A · SCADUTA', inizio: '2026-10-20', fine: '2026-10-28', consegna: '2026-10-29' }),
    barra({ etichetta: 'B · FINE', inizio: '2026-10-26', fine: '2026-10-30', consegna: '2026-11-03' }),
    barra({ etichetta: 'C · PARTIRE', inizio: '2026-10-30', fine: '2026-11-04', consegna: '2026-11-05' }),
  ] });
  assert.deepEqual(ev.map(e => e.tipo).sort(), ['consegna_scaduta', 'doveva_partire', 'fine_superata']);
  assert.ok(ev.every(e => e.data === OGGI));
  assert.match(ev.find(e => e.tipo === 'consegna_scaduta')!.descrizione, /29\/10\/2026/);
});

test('calendario ritardi: avviso 2 giorni lavorativi prima dell\'inizio, solo entro 60 giorni', () => {
  const ev = eventiRitardi({ oggi: OGGI, ...vuoto, barre: [barra({ inizio: '2026-11-10' }), barra({ etichetta: 'LONTANA', inizio: '2027-02-01', consegna: '2027-02-05' })] });
  assert.equal(ev.length, 1);
  assert.equal(ev[0].tipo, 'parte_presto');
  assert.equal(ev[0].data, '2026-11-06'); // martedì 10 → venerdì 6
  // inizio domani: l'avviso cadrebbe nel passato → oggi
  const domani = eventiRitardi({ oggi: OGGI, ...vuoto, barre: [barra({ inizio: '2026-11-03' })] });
  assert.equal(domani[0].data, OGGI);
});

test('calendario ritardi: promemoria di oggi nel fine settimana → lunedì', () => {
  const ev = eventiRitardi({ oggi: '2026-10-31', ...vuoto, barre: [barra({ inizio: '2026-10-20', fine: '2026-10-28', consegna: '2026-10-29' })] });
  assert.equal(ev[0].data, '2026-11-02');
});

test('calendario ritardi: sovraccarico solo nei giorni oltre le ore disponibili', () => {
  const ev = eventiRitardi({ oggi: OGGI, barre: [], commesse: [], oreGiorno: 8, carico: { '2026-10-30': 20, '2026-11-03': 8, '2026-11-04': 11.5 } });
  assert.deepEqual(ev.map(e => [e.tipo, e.data]), [['sovraccarico', '2026-11-04']]);
  assert.match(ev[0].titolo, /11,5 h di lavoro su 8 h/);
});

test('calendario ritardi: commesse oltre la consegna e oltre le ore del preventivo', () => {
  const ev = eventiRitardi({ oggi: OGGI, ...vuoto, commesse: [
    commessa({ id: 1, consegna: '2026-10-30' }),
    commessa({ id: 2, uomoFattoSec: 40000 }),
    commessa({ id: 3 }),
    commessa({ id: 4, uomoPrevistoSec: 0, uomoFattoSec: 5000 }),
  ] });
  assert.deepEqual(ev.map(e => e.uid).sort(), ['commessa-scaduta-1', 'commessa-tempi-2']);
  assert.match(ev.find(e => e.uid === 'commessa-tempi-2')!.descrizione, /111 %/);
  assert.equal(ev.find(e => e.uid === 'commessa-tempi-2')!.link, '/commesse/2');
});

test('calendario .ics: giornata intera, testi protetti, righe piegate, link al portale', () => {
  const [e] = eventiRitardi({ oggi: OGGI, ...vuoto, barre: [barra({ etichetta: 'ELETTRONICA ÀÈÌ, S.R.L.; PROVA · CODICE-MOLTO-LUNGO-PER-PIEGARE-LA-RIGA-OLTRE-SETTANTACINQUE' })] });
  const ics = calendarioIcs([e], { adesso: new Date('2026-11-02T08:00:00Z'), indirizzo: 'https://portale.example/' });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261106\r\nDTEND;VALUE=DATE:20261107/);
  assert.match(ics.replace(/\r\n /g, ''), /ÀÈÌ\\, S\.R\.L\.\\; PROVA/);
  assert.match(ics, /URL:https:\/\/portale\.example\/ordini\/gantt/);
  for (const riga of ics.split('\r\n')) assert.ok(Buffer.byteLength(riga) <= 75, riga);
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.equal(piega('abc'), 'abc');
  assert.equal(piega('é'.repeat(40)).split('\r\n ').join(''), 'é'.repeat(40));
});

test('calendario: si ricalcola solo in orario di lavoro e al massimo una volta all\'ora', () => {
  const lun10 = new Date('2026-11-02T09:00:00Z'); // 10:00 a Roma
  assert.equal(daRicalcolare(null, new Date('2026-11-01T02:00:00Z')), true); // senza copia: sempre
  assert.equal(daRicalcolare(new Date('2026-11-02T08:30:00Z'), lun10), false); // 30 minuti fa
  assert.equal(daRicalcolare(new Date('2026-11-02T07:00:00Z'), lun10), true);
  assert.equal(daRicalcolare(new Date('2026-10-30T07:00:00Z'), new Date('2026-11-01T10:00:00Z')), false); // domenica
  assert.equal(daRicalcolare(new Date('2026-11-02T07:00:00Z'), new Date('2026-11-02T21:00:00Z')), false); // 22:00 a Roma
});
