import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { senzaFiltriTabelle } from '../src/engine/excel-filtri.js';

test('Excel con filtri per colore nella tabella: i filtri si tolgono, il resto resta uguale', () => {
  const tabella = '<table><autoFilter ref="A1:L90"><filterColumn colId="10"><colorFilter dxfId="0"/></filterColumn><filterColumn colId="2"/></autoFilter></table>';
  const foglio = '<worksheet><sheetData><row r="1"><c r="A1"/></row></sheetData></worksheet>';
  const zip = Buffer.from(zipSync({ 'xl/tables/table1.xml': strToU8(tabella), 'xl/worksheets/sheet1.xml': strToU8(foglio) }));
  const fuori = unzipSync(new Uint8Array(senzaFiltriTabelle(zip)));
  assert.equal(strFromU8(fuori['xl/tables/table1.xml']), '<table><autoFilter ref="A1:L90"></autoFilter></table>');
  assert.equal(strFromU8(fuori['xl/worksheets/sheet1.xml']), foglio);
});
