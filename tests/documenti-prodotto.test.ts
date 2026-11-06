import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confrontaRevisioni, revisioneDaNomi, revisioneProposta, riassuntoDaAnalisi, testoConfronto, type RiassuntoDocumenti } from '../src/engine/documenti-prodotto.js';
import type { AnalisiScheda } from '../src/engine/scheda/analisi.js';

const comp = (ref: string, pn: string, extra: Partial<RiassuntoDocumenti['componenti'][0]> = {}) =>
  ({ ref, pn, valore: '', case: '0603', descrizione: '', tipo: 'SMD' as const, lato: 'TOP' as const, montato: true, ...extra });

const riassunto = (componenti: RiassuntoDocumenti['componenti'], extra: Partial<RiassuntoDocumenti> = {}): RiassuntoDocumenti => ({
  file: [], fonti: { bom: 'bom.xlsx', pickPlace: [], gerber: [], cad: null, forature: [] }, componenti,
  conteggi: { smdTop: componenti.filter(c => c.tipo === 'SMD' && c.lato === 'TOP').length, smdBot: 0, tht: 0, nonMontati: 0, codiciDiversi: new Set(componenti.map(c => c.pn)).size, feederTop: 0, feederBot: 0, refori: null },
  lavorazione: { latiSmd: 1, saldaturaTht: null }, dimensioni: { larghezza: 100, altezza: 50, stima: false }, strati: [{ nome: 'top.gbr', ruolo: 'rame', lato: 'TOP' }],
  segnalazioni: { errori: 0, avvisi: 0, testi: [] }, prodotto: null, ...extra,
});

test('documentazione prodotto: revisione dai nomi di cartelle e file ("Rev.C", "V1.0.7", "r2"), mai un anno; senza niente = 0', () => {
  assert.deepEqual(revisioneDaNomi(['lamine M2204 Rev.C/gerber/top.gbr']), { revisione: 'C', fonte: 'nome "lamine M2204 Rev.C"' });
  assert.equal(revisioneDaNomi(['Pesee/Botisum_Pesee_rs485_V1.0.7_for_manufacturing/BOM.xlsx'])?.revisione, '1.0.7');
  assert.equal(revisioneDaNomi(['GA-634r2/BOM_GA634r2.xlsx'])?.revisione, '2');
  assert.equal(revisioneDaNomi(['SCR-SA RevA/Bill of Materials.xlsx'])?.revisione, 'A');
  assert.equal(revisioneDaNomi(['CPUMODULEM3.BOM_R04.xlsx'])?.revisione, '04');
  assert.equal(revisioneDaNomi(['EA1002-0_impianti_30-07-2026/EC/EC_EA1002-01-1.xlsx']), null);
  assert.equal(revisioneDaNomi(['Gerber_V2026/top.gbr']), null);
  assert.deepEqual(revisioneProposta({ daFile: null, nomi: ['BOM_CSG1.xlsx'], esistenti: [] }), { revisione: '0', fonte: 'non trovata nei file: revisione 0' });
  // dai file vince sui nomi; già presente → "-2"
  assert.equal(revisioneProposta({ daFile: 'Rev. B', fonteFile: 'intestazione della BOM', nomi: ['x RevC/bom.xlsx'], esistenti: [] }).revisione, 'B');
  assert.equal(revisioneProposta({ daFile: 'B', nomi: [], esistenti: ['A', 'b'] }).revisione, 'B-2');
  assert.equal(revisioneProposta({ daFile: null, nomi: [], esistenti: ['0'] }).revisione, '0-2');
});

test('documentazione prodotto: confronto = aggiunti, tolti, cambiati (P/N, case, lato, montato) e conteggi', () => {
  const vecchia = riassunto([comp('R1', 'RC0603FR-0710KL'), comp('R2', 'RC0603FR-071KL'), comp('C1', 'GRM188R71H104KA93D'), comp('U1', 'LM358')]);
  const nuova = riassunto([comp('R1', 'RC0603FR-0710KL'), comp('R2', 'RC0603FR-072K2L'), comp('C1', 'GRM188R71H104KA93D', { lato: 'BOT' }), comp('U2', 'LM358', { montato: false }), comp('D1', '1N4148W')]);
  const c = confrontaRevisioni(vecchia, nuova);
  assert.equal(c.stravolto, false);
  assert.equal(c.inComune, 3);
  assert.deepEqual(c.aggiunti.map(x => x.ref), ['D1', 'U2']);
  assert.deepEqual(c.tolti.map(x => x.ref), ['U1']);
  assert.deepEqual(c.cambiati, [{ ref: 'R2', campo: 'P/N', prima: 'RC0603FR-071KL', dopo: 'RC0603FR-072K2L' }, { ref: 'C1', campo: 'lato', prima: 'TOP', dopo: 'BOT' }]);
  assert.ok(c.conteggi.some(v => v.voce === 'SMD TOP' && v.prima === 4 && v.dopo === 4) === false); // SMD TOP: 4 → 4 (U2 non montato conta lo stesso come riga)
  assert.match(testoConfronto(c, 'A', 'B'), /^Revisione A → B: 2 aggiunti \(D1, U2\); 1 tolti \(U1\); 2 cambiati \(R2 P\/N, C1 lato\)/);
  const uguale = confrontaRevisioni(vecchia, riassunto(vecchia.componenti));
  assert.equal(uguale.uguale, true);
  assert.equal(testoConfronto(uguale, 'A', 'A-2'), 'Revisione A → A-2: nessuna differenza.');
});

test('documentazione prodotto: progetto stravolto (meno della metà dei riferimenti in comune o misure molto diverse) = niente confronto riga per riga', () => {
  const vecchia = riassunto([comp('R1', 'A'), comp('R2', 'B'), comp('R3', 'C'), comp('R4', 'D')]);
  const rifatta = riassunto([comp('R1', 'A'), comp('X1', 'Z'), comp('X2', 'Z'), comp('X3', 'Z'), comp('X4', 'Z')]);
  const c = confrontaRevisioni(vecchia, rifatta);
  assert.equal(c.stravolto, true);
  assert.match(c.motivo, /solo 1 riferimenti su 5/);
  assert.match(testoConfronto(c, '0', '1'), /^Revisione 0 → 1: solo 1 riferimenti su 5 sono in comune/);
  const altraScheda = riassunto(vecchia.componenti, { dimensioni: { larghezza: 160, altezza: 50, stima: false } });
  assert.equal(confrontaRevisioni(vecchia, altraScheda).stravolto, true);
  assert.match(confrontaRevisioni(vecchia, altraScheda).motivo, /misure molto diverse/);
  // misure stimate non bastano per dire "altra scheda"
  const stimata = riassunto(vecchia.componenti, { dimensioni: { larghezza: 160, altezza: 50, stima: true } });
  assert.equal(confrontaRevisioni(vecchia, stimata).stravolto, false);
});

test('documentazione prodotto: il riassunto tiene i componenti compatti, i file con il solo nome, le segnalazioni non accettate', () => {
  const analisi = {
    componenti: [
      { ref: 'R2', lato: 'TOP', tipo: 'SMD', tipoDa: 'BOM', montato: true, piediniTht: null, codiceCliente: 'RC0603', bom: { riga: 2, pn: 'RC0603', produttore: '', valore: '10K', footprint: '0603', descrizione: 'RES 10K', note: '' }, segnalazioni: [] },
      { ref: 'R1', lato: null, tipo: 'THT', tipoDa: 'BOM', montato: false, piediniTht: 2, codiceCliente: '', pp: { valore: '1K', footprint: 'AXIAL', x: 0, y: 0, rot: 0 }, segnalazioni: [] },
    ],
    conteggi: { smdTop: 1, smdBot: 0, tht: 0, nonMontati: 1, feederTop: 1, feederBot: 0, codiciTht: 0, item: 2, refori: 0, reforiDa: null, vias: null, foriNonMetallizzati: null, fiducialTop: 0, fiducialBot: 0 },
    lavorazione: { latiSmd: 1, latoSmdUnico: 'TOP', latoCorpiTht: null, saldaturaTht: null, motivo: '' },
    consumi: { pastaGrammi: 0, stagnoOndaGrammi: 0, filoGrammi: 0 }, dimensioni: null, noteCliente: [],
    segnalazioni: [{ livello: 'errore', testo: 'R9 manca' }, { livello: 'avviso', testo: 'accettata', accettata: { da: 'x', il: 'y' } }],
    prodotto: { codice: 'ABC', descrizione: null, revisione: 'B', fonti: { revisione: 'intestazione della BOM' } },
  } as unknown as AnalisiScheda;
  const r = riassuntoDaAnalisi(analisi, [{ nome: 'a/bom.xlsx', tipo: 'bom', byte: 1000, usato: true }], { bom: 'a/bom.xlsx', pickPlace: [], gerber: [], cad: null, forature: [] }, [{ nome: 'top.gbr', ruolo: 'rame', lato: 'TOP' }]);
  assert.deepEqual(r.componenti.map(c => c.ref), ['R1', 'R2']);
  assert.deepEqual(r.componenti[1], { ref: 'R2', pn: 'RC0603', valore: '10K', case: '0603', descrizione: 'RES 10K', tipo: 'SMD', lato: 'TOP', montato: true });
  assert.deepEqual(r.componenti[0], { ref: 'R1', pn: '', valore: '1K', case: 'AXIAL', descrizione: '', tipo: 'THT', lato: null, montato: false });
  assert.equal(r.conteggi.codiciDiversi, 1);
  assert.deepEqual(r.segnalazioni, { errori: 1, avvisi: 0, testi: ['R9 manca'] });
  assert.equal(r.prodotto?.revisione, 'B');
  assert.ok(!('dati' in r.file[0]));
});
