import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calcolaPagina, righePagina, PER_PAGINA } from '../src/engine/paginazione.js';
import { ordinaRiprendi, quandoBreve } from '../src/engine/riprendi.js';
import { excelSemplice } from '../src/server/excel.js';
import { paginata } from '../src/server/views/paginazione.js';
import { cercaGuida } from '../src/engine/guida.js';

test('elenchi a pagine: 100 righe per pagina, pagina fuori intervallo riportata dentro, numeri della barra', () => {
  assert.equal(PER_PAGINA, 100);
  const p = calcolaPagina(350, '2');
  assert.deepEqual([p.pagina, p.pagine, p.da, p.a], [2, 4, 101, 200]);
  assert.deepEqual(p.numeri, [1, 2, 3, 4]);
  assert.equal(calcolaPagina(350, '99').pagina, 4);
  assert.equal(calcolaPagina(350, 'abc').pagina, 1);
  assert.equal(calcolaPagina(350, '-3').pagina, 1);
  assert.deepEqual(calcolaPagina(0, '1'), { pagina: 1, pagine: 1, totale: 0, da: 0, a: 0, numeri: [1] });
  const grande = calcolaPagina(2000, '10');
  assert.deepEqual(grande.numeri, [1, 8, 9, 10, 11, 12, 20]);
  const righe = Array.from({ length: 350 }, (_, i) => i + 1);
  assert.deepEqual(righePagina(righe, p).slice(0, 2), [101, 102]);
  assert.equal(righePagina(righe, calcolaPagina(350, '4')).length, 50);
});

test('elenchi a pagine: la barra tiene gli altri filtri e non compare se basta una pagina', () => {
  const righe = Array.from({ length: 250 }, (_, i) => ({ n: i }));
  const { righe: pagina2, barra, info } = paginata(righe, { q: 'univac', pagina: '2' });
  assert.equal(pagina2.length, 100);
  assert.equal(info.pagina, 2);
  const h = String(barra);
  assert.ok(h.includes('q=univac') && h.includes('pagina=1') && h.includes('pagina=3'), h);
  assert.equal(String(paginata(righe.slice(0, 40), {}).barra), '');
});

test('Riprendi da dove eri: prima le cose dell\'utente collegato, poi le altre, al massimo 8, senza doppioni', () => {
  const voci = Array.from({ length: 12 }, (_, i) => ({ tipo: 'preventivo', titolo: `P${i}`, href: `/preventivi/${i}`, quando: `2026-11-01T${String(10 + i).padStart(2, '0')}:00:00`, utenteId: i % 3 === 0 ? 7 : 2 }));
  const out = ordinaRiprendi(voci, 7);
  assert.equal(out.length, 8);
  assert.deepEqual(out.slice(0, 4).map(v => v.utenteId), [7, 7, 7, 7]);
  assert.equal(out[0].titolo, 'P9');   // la più recente dell'utente 7
  assert.equal(out[4].titolo, 'P11');  // poi la più recente degli altri
  assert.equal(ordinaRiprendi([voci[0], { ...voci[0], titolo: 'doppione' }], null).length, 1);
  assert.equal(ordinaRiprendi(voci, null, 3).length, 3);
});

test('Riprendi: "oggi 10:32", "ieri 16:05", altrimenti giorno/mese', () => {
  assert.equal(quandoBreve('2026-11-02T10:32:00', '2026-11-02'), 'oggi 10:32');
  assert.equal(quandoBreve('2026-11-01T16:05:00', '2026-11-02'), 'ieri 16:05');
  assert.equal(quandoBreve('2026-10-30T09:12:00', '2026-11-02'), '30/10 09:12');
  assert.equal(quandoBreve('2026-10-31T23:59:00', '2026-11-01'), 'ieri 23:59');
});

test('Excel su ogni elenco: intestazioni in grassetto, date e importi come numeri', async () => {
  const buf = await excelSemplice('Prova', [{ header: 'Codice', key: 'codice' }, { header: 'Data', key: 'data', formato: 'data' }, { header: 'Totale €', key: 'totale', formato: 'euro' }],
    [{ codice: 'A1', data: '2026-11-02', totale: '12.5' }, { codice: 'B2', data: new Date('2026-10-01T00:00:00Z'), totale: null }]);
  assert.ok(buf.length > 1000 && buf.subarray(0, 2).toString() === 'PK');
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf as any);
  const ws = wb.worksheets[0];
  assert.equal(ws.getRow(1).font?.bold, true);
  assert.equal(ws.getCell('C2').value, 12.5);
  assert.ok(ws.getCell('B2').value instanceof Date);
  assert.equal(ws.getColumn('C').numFmt, '#,##0.00 €');
  assert.equal(ws.getCell('C3').value, '');
});

test('Excel su ogni elenco: preventivi, commesse, ordini, clienti, prodotti, fornitori, CRM, fatture fornitori', () => {
  const attese: [string, string][] = [
    ['src/server/rotte/preventivi.ts', "r.get('/elenco.xlsx'"], ['src/server/rotte/commesse.ts', "r.get('/elenco.xlsx'"], ['src/server/rotte/ordini.ts', "r.get('/elenco.xlsx'"],
    ['src/server/rotte/anagrafiche.ts', "r.get('/clienti.xlsx'"], ['src/server/rotte/anagrafiche.ts', "r.get('/prodotti.xlsx'"],
    ['src/server/rotte/fornitori-anagrafica.ts', "r.get('/elenco.xlsx'"], ['src/server/rotte/crm.ts', "r.get('/elenco.xlsx'"],
    ['src/server/rotte/amministrazione.ts', "formato === 'xlsx'"],
  ];
  for (const [f, s] of attese) assert.ok(readFileSync(f, 'utf8').includes(s), `${f}: manca ${s}`);
  // gli elenchi lunghi sono a pagine
  for (const f of ['src/server/rotte/preventivi.ts', 'src/server/rotte/commesse.ts', 'src/server/rotte/ordini.ts', 'src/server/rotte/amministrazione.ts'])
    assert.ok(readFileSync(f, 'utf8').includes('paginata('), `${f}: elenco non a pagine`);
});

test('tasti rapidi: tasti.js in ogni pagina con Alt+N, Esc e "?"', () => {
  assert.ok(readFileSync('src/server/views/layout.ts', 'utf8').includes('/static/tasti.js?v='));
  const js = readFileSync('public/tasti.js', 'utf8');
  assert.ok(js.includes("e.altKey") && js.includes("'KeyN'") && js.includes("'Escape'") && js.includes("e.key === '?'") && js.includes('pannello-tasti'));
  assert.ok(readFileSync('public/stile.css', 'utf8').includes('.pannello-tasti'));
});

test('guida: tasti rapidi, Excel degli elenchi, elenchi a pagine, Riprendi', () => {
  for (const [q, id] of [['tasti rapidi scorciatoie da tastiera', 'tasti-rapidi'], ['scaricare un elenco in excel', 'excel-elenchi'], ['riprendi da dove eri', 'riprendi-cruscotto'], ['pagine dell\'elenco troppo lungo', 'excel-elenchi']] as const)
    assert.ok(cercaGuida(q).slice(0, 3).some(r => r.argomento.id === id), `${q} → ${id}`);
});
