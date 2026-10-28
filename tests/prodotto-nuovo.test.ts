// Prodotto nuovo dal preventivo e proposta di codice/descrizione/revisione dai documenti del cliente (esempi inventati).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controllaProdottoNuovo, daNome, propostaProdotto, pulisciRevisione } from '../src/engine/scheda/prodotto.js';

test('prodotto nuovo: tutto maiuscolo, servono codice, descrizione e revisione', () => {
  const ok = controllaProdottoNuovo({ codice: ' ab-12  x ', descrizione: 'scheda  controllo', revisione: '0' });
  assert.equal(ok.errore, undefined);
  assert.deepEqual(ok.valori, { codice: 'AB-12 X', descrizione: 'SCHEDA CONTROLLO', revisione: '0' });
  assert.match(controllaProdottoNuovo({ codice: 'AB12', descrizione: '', revisione: '0' }).errore!, /descrizione/);
  // revisione mancante: si chiede di scrivere 0
  assert.match(controllaProdottoNuovo({ codice: 'AB12', descrizione: 'SCHEDA' }).errore!, /revisione.*0/);
  assert.match(controllaProdottoNuovo({}).errore!, /codice.*descrizione.*revisione/);
});

test('proposta: codice e revisione dal nome della cartella o del caricamento', () => {
  assert.deepEqual(daNome('EA1002-0_impianti_30-07-2026'), { codice: 'EA1002', revisione: '0' });
  assert.deepEqual(daNome('SB-002 REV B'), { codice: 'SB-002', revisione: 'B' });
  assert.deepEqual(daNome('DB04_rev2'), { codice: 'DB04', revisione: '2' });
  assert.deepEqual(daNome('documenti cliente'), {});
  assert.deepEqual(daNome('BOM.xlsx'), {});
  assert.equal(pulisciRevisione('Rev. A'), 'A');
  assert.equal(pulisciRevisione('v1.1'), '1.1');
  assert.equal(pulisciRevisione('02'), '02');
});

test('proposta: intestazione della BOM prima di Gerber, GenCAD e nomi', () => {
  const p = propostaProdotto({
    nomePacchetto: 'EA1002-0', nomiFile: ['EA1002-0/bom.xlsx'],
    bomIntestazione: [['Project:', 'Scheda relè', ''], ['Title', '', 'Controllo pompe'], ['Revision: C']],
    gerber: ['%TF.ProjectId,QX55,1234-abcd,2*%\n'],
  })!;
  assert.equal(p.codice, 'SCHEDA RELÈ');
  assert.equal(p.descrizione, 'CONTROLLO POMPE');
  assert.equal(p.revisione, 'C');
  assert.equal(p.fonti.revisione, 'intestazione della BOM');
  assert.equal(propostaProdotto({ nomePacchetto: '', nomiFile: [], bomIntestazione: [['Project: EA1002.PrjPcb']] })!.codice, 'EA1002');
});

test('proposta: Gerber X2, GenCAD e cartelle quando la BOM non dice niente', () => {
  const g = propostaProdotto({ nomePacchetto: 'pacchetto', nomiFile: [], gerber: ['G04 x*\n%TF.ProjectId,qx55-main,1234-abcd,rev3*%\n'] })!;
  assert.deepEqual([g.codice, g.revisione, g.descrizione], ['QX55-MAIN', '3', null]);
  const c = propostaProdotto({ nomePacchetto: 'pacchetto', nomiFile: [],
    gencad: '$HEADER\nGENCAD 1.4\nDRAWING "C:\\\\progetti\\\\VT106.pcb"\nREVISION "B"\nUNITS MM\n$ENDHEADER\n' })!;
  assert.deepEqual([c.codice, c.revisione], ['VT106', 'B']);
  const d = propostaProdotto({ nomePacchetto: 'scheda nuova', nomiFile: ['XA2001-1 impianti/top.gbr', 'XA2001-1 impianti/bom.csv'] })!;
  assert.deepEqual([d.codice, d.revisione], ['XA2001', '1']);
  assert.match(d.fonti.codice!, /cartella/);
  assert.equal(propostaProdotto({ nomePacchetto: 'prova', nomiFile: ['a/b.gbr'] }), null);
});
