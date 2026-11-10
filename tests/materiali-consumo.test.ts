import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { categoriaProposta, datiMateriale, descrizioneDaRiga, filtraMateriali, leggiFilePrezziMateriali, prossimoCodice, righeFuoriAnagrafica,
  CATEGORIE_MATERIALI } from '../src/engine/materiali-consumo.js';

// elenco iniziale della migrazione (lo stesso che trova l'ufficio in Anagrafiche → Materiali di consumo)
const sql = readFileSync(new URL('../db/migrazioni/065_materiali_consumo.sql', import.meta.url), 'utf8');
const iniziali = [...sql.matchAll(/\('(MC-[A-Z]{3}-\d{3})', '([A-Z]{3})', '([A-Z]+)', '((?:[^']|'')+)'\)/g)]
  .map(([, codice, categoria, um, descrizione], i) => ({ id: i + 1, codice, categoria, um, descrizione: descrizione.replace(/''/g, "'"), attivo: true }));

test('Materiali: elenco iniziale con codici nostri unici, una categoria valida e i sei materiali chiesti da Adriano', () => {
  assert.ok(iniziali.length >= 60);
  assert.equal(new Set(iniziali.map(m => m.codice)).size, iniziali.length);
  for (const m of iniziali) {
    assert.ok(m.categoria in CATEGORIE_MATERIALI, m.codice);
    assert.ok(m.codice.startsWith(`MC-${m.categoria}-`), m.codice);
    assert.equal(m.descrizione, m.descrizione.toUpperCase(), m.codice);
  }
  for (const parola of ['lamina', 'pasta saldante', 'barre', 'filo di stagno', 'kapton', 'punta saldatore weller'])
    assert.ok(filtraMateriali(iniziali, parola).length, parola);
  // punte Weller: un solo codice, il modello si scrive nella descrizione della riga
  assert.equal(iniziali.filter(m => /^PUNTA SALDATORE WELLER/.test(m.descrizione)).length, 1);
});

test('Materiali: "lamina" trova le lamine serigrafiche (e non altro), più parole e accenti non contano', () => {
  const lamine = filtraMateriali(iniziali, 'lamina', 50);
  assert.ok(lamine.length >= 5);
  assert.ok(lamine.every(m => m.categoria === 'LAM'));
  assert.equal(filtraMateriali(iniziali, 'lamina 0,12')[0].codice, 'MC-LAM-001');
  assert.equal(filtraMateriali(iniziali, 'pasta')[0].categoria, 'PAS');   // prima la pasta saldante, poi le altre paste
  assert.equal(filtraMateriali(iniziali, 'filo')[0].categoria, 'FIL');
  assert.equal(filtraMateriali(iniziali, 'kapton 12 mm')[0].codice, 'MC-KAP-007');
  assert.ok(filtraMateriali(iniziali, 'stagno').some(m => m.categoria === 'BAR') && filtraMateriali(iniziali, 'stagno').some(m => m.categoria === 'FIL'));
  // il codice del fornitore nella descrizione si trova anche lui
  assert.equal(filtraMateriali(iniziali, 'CMLPKF23012LL')[0].codice, 'MC-LAM-001');
  assert.equal(filtraMateriali(iniziali, 'mc-lam-003')[0].codice, 'MC-LAM-003');
  assert.deepEqual(filtraMateriali(iniziali, 'l'), []);
  assert.deepEqual(filtraMateriali([{ ...iniziali[0], attivo: false }], 'lamina'), []);
});

test('Materiali: il codice nuovo è il progressivo dopo il più alto della categoria', () => {
  assert.equal(prossimoCodice('LAM', ['MC-LAM-001', 'MC-LAM-007', 'MC-PAS-020', 'ALTRO']), 'MC-LAM-008');
  assert.equal(prossimoCodice('VAR', []), 'MC-VAR-001');
  assert.equal(prossimoCodice('KAP', ['mc-kap-099']), 'MC-KAP-100');
});

test('Materiali: descrizione e categoria obbligatorie, tutto MAIUSCOLO', () => {
  assert.deepEqual(datiMateriale({ descrizione: '  lamina   serigrafica 0,12 ', categoria: 'lam', um: 'pz' }),
    { dati: { descrizione: 'LAMINA SERIGRAFICA 0,12', categoria: 'LAM', um: 'PZ', note: null } });
  assert.equal((datiMateriale({ descrizione: 'x', categoria: 'LAM' }) as any).campo, 'descrizione');
  assert.equal((datiMateriale({ descrizione: 'LAMINA', categoria: 'ZZZ' }) as any).campo, 'categoria');
});

test('Ordine a fornitore: righe non in anagrafica, codice del fornitore nella descrizione, categoria proposta', () => {
  const righe = [
    { posizione: 1, codice: 'MC-LAM-001', descrizione: 'LAMINA' },
    { posizione: 2, codice: 'HK2002845', descrizione: 'PASTA LOCTITE GC10' },
    { posizione: 3, codice: null, descrizione: 'TRASPORTO' },
    { posizione: 4, codice: 'rc0603fr-0710kl', descrizione: '' },
    { posizione: 5, codice: '', descrizione: '' },
  ];
  assert.deepEqual(righeFuoriAnagrafica(righe, new Set(['MC-LAM-001', 'RC0603FR-0710KL'])).map(r => r.posizione), [2, 3]);
  assert.equal(descrizioneDaRiga(righe[1]), 'PASTA LOCTITE GC10 (COD. FORNITORE HK2002845)');
  assert.equal(descrizioneDaRiga({ codice: 'TTBC-10', descrizione: 'spugnetta ottone TTBC-10' }), 'SPUGNETTA OTTONE TTBC-10');
  assert.equal(descrizioneDaRiga({ codice: 'ABC', descrizione: '' }), 'ABC');
  assert.equal(categoriaProposta('Pasta saldante SAC305'), 'PAS');
  assert.equal(categoriaProposta('Nastro Kapton 10mm'), 'KAP');
  assert.equal(categoriaProposta('Punta Weller XNT H'), 'PUN');
  assert.equal(categoriaProposta('Stencil 0,12'), 'LAM');
  assert.equal(categoriaProposta('Filo stagno 0,7'), 'FIL');
  assert.equal(categoriaProposta('Cacciavite'), 'VAR');
});

test('Materiali: file degli ultimi prezzi, righe non valide scartate', () => {
  const { prezzi, scartate } = leggiFilePrezziMateriali({ tipo: 'prezzi_materiali', prezzi: [
    { codice: 'mc-lam-001', prezzo: 75, fornitore: 'I-Tronik s.r.l.', data: '2026-09-30', quantita: 2 },
    { codice: 'MC-PAS-001', prezzo: 0 },
    { codice: 'ABC', prezzo: 3 },
  ] });
  assert.deepEqual(prezzi, [{ codice: 'MC-LAM-001', prezzo: 75, fornitore: 'I-TRONIK S.R.L.', data: '2026-09-30', quantita: 2, nota: null }]);
  assert.equal(scartate, 2);
  assert.throws(() => leggiFilePrezziMateriali({ prodotti: [] }), /prezzi dei materiali/);
});

// Ordini a fornitore (Adriano 10/11/2026): "scrivendo pcb nella descrizione voglio la riga della PCB in anagrafica", note libere per riga
test('Materiali: articoli standard degli ordini a fornitore (PCB, attrezzatura, coating DOWSIL) trovati con una parola', async () => {
  const sql086 = readFileSync(new URL('../db/migrazioni/086_materiali_pcb.sql', import.meta.url), 'utf8');
  const nuovi = [...sql086.matchAll(/\('(MC-[A-Z]{3}-\d{3})', '([A-Z]{3})', '([A-Z]+)', '((?:[^']|'')+)'\)/g)]
    .map(([, codice, categoria, um, descrizione], i) => ({ id: 1000 + i, codice, categoria, um, descrizione, attivo: true }));
  assert.ok(nuovi.length >= 5);
  const tutti = [...iniziali, ...nuovi];
  assert.equal(new Set(tutti.map(m => m.codice)).size, tutti.length, 'codici nuovi diversi da quelli della 065');
  for (const m of nuovi) assert.ok(m.categoria in CATEGORIE_MATERIALI && m.codice.startsWith(`MC-${m.categoria}-`), m.codice);
  assert.equal(filtraMateriali(tutti, 'pcb')[0].codice, 'MC-PCB-001');
  // Adriano 10/11/2026: PCB e prototipi sono la stessa famiglia, un solo codice (la 087 toglie MC-PCB-003)
  assert.match(readFileSync(new URL('../db/migrazioni/087_pcb_un_codice.sql', import.meta.url), 'utf8'), /DELETE FROM materiali_consumo WHERE codice = 'MC-PCB-003'/);
  assert.ok(filtraMateriali(tutti, 'circuito stampato').some(m => m.codice === 'MC-PCB-001'));
  assert.ok(filtraMateriali(tutti, 'dowsil').some(m => m.codice === 'MC-COA-007'));
  assert.equal(categoriaProposta('PCB NASOMETER V11'), 'PCB');
  assert.equal(categoriaProposta('Circuito stampato 4 strati'), 'PCB');
  const { righeConfermaDaModulo } = await import('../src/engine/conferme-ordine.js');
  const { righe, errori } = righeConfermaDaModulo([
    { codice: 'mc-pcb-001', descrizione: 'PCB CIRCUITO STAMPATO', note: '  nasometer v11  fr4 1,6 mm enig ', quantita: '120', prezzo: '2,99' },
    { codice: 'MC-LAM-006', descrizione: 'LAMINA', quantita: '1', prezzo: '75' },
  ]);
  assert.deepEqual(errori, []);
  assert.equal(righe[0].note, 'NASOMETER V11 FR4 1,6 MM ENIG');
  assert.equal(righe[1].note, null);
});
