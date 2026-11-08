import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FINESTRE, aggiungiFineLavorazione, cosaAcquistare, faseMacroDi, fasiPreviste, fineLavorazioneDaScansione, leggiStatoFlusso, nuovaPriorita,
  ordinaPerPriorita, valutaRiga, type RigaFlusso, type StatoFlusso,
} from '../src/engine/flusso.js';
import { cercaGuida } from '../src/engine/guida.js';

const ADESSO = '2026-11-06T14:00:00.000Z';
const F = { da: 'Cinzia', il: ADESSO };
const vuoto = (): StatoFlusso => ({ priorita: null, acquisti: {}, materiale: {}, produzione: {}, inProduzione: null });
const riga = (x: Partial<RigaFlusso> = {}): RigaFlusso => ({ id: 1, quantita: 100, quantitaSpedita: 0, residuoQuantita: 100, stato: 'da_evadere', flusso: vuoto(), ...x });

test('flusso: cinque finestre, lettura tollerante dello stato salvato', () => {
  assert.deepEqual(FINESTRE.map(f => f.nome), ['Da acquistare', 'Da preparare per produzione', 'In produzione', 'Da spedire', 'Spedite nel mese']);
  const s = leggiStatoFlusso({ priorita: '3', acquisti: { pcb: F, rotta: 1 }, in_produzione: { da: 'Adriano', il: ADESSO } });
  assert.equal(s.priorita, 3);
  assert.deepEqual(Object.keys(s.acquisti), ['pcb']);
  assert.equal(s.inProduzione?.da, 'Adriano');
  assert.equal(leggiStatoFlusso(null).priorita, null);
});

test('flusso: cose da acquistare dalle spunte del preventivo e dalle righe di costo dell\'ordine, senza doppioni', () => {
  const voci = cosaAcquistare({ acquistoComponenti: 1, acquistoPcb: 0, acquistoLamina: 1, doppiaFaccia: 1 }, [
    { codice: null, descrizione: 'ACQUISTO COMPONENTI' }, { codice: null, descrizione: 'Acquisto PCB' }, { codice: 'UT-LAMINA', descrizione: 'LAMINA SERIGRAFICA' },
    { codice: 'WPACAMJR3', descrizione: 'CAMJR3_STANDARD' }, { codice: null, descrizione: 'COSTO UNA TANTUM: PROGRAMMA P&P' },
  ]);
  assert.deepEqual(voci.map(v => [v.chiave, v.fonte]), [['componenti', 'preventivo'], ['lamina', 'preventivo'], ['pcb', 'ordine']]);
  assert.equal(voci[1].nome, 'Lamine TOP+BOT');
  assert.deepEqual(cosaAcquistare(null, []), []);
});

test('flusso: fasi del ciclo dalle fasi della commessa o dal preventivo', () => {
  assert.equal(faseMacroDi('pepBot', 'SMD'), 'smd_bot');
  assert.equal(faseMacroDi('estrazioneMateriale', 'GESTIONE MATERIALE'), 'estrazione');
  assert.equal(faseMacroDi('lavaggio', 'COMPLETAMENTO'), null);
  const fasi = fasiPreviste([
    { codice: 'estrazioneMateriale', gruppo: 'GESTIONE MATERIALE', cicloSec: 100 }, { codice: 'pepTop', gruppo: 'SMD', cicloSec: 1000 },
    { codice: 'pepBot', gruppo: 'SMD', cicloSec: 0 }, { codice: 'saldaturaOnda', gruppo: 'THT', cicloSec: 300 }, { codice: 'test', gruppo: 'COMPLETAMENTO', cicloSec: 50 },
    { codice: 'conformalCoating', gruppo: 'COMPLETAMENTO', cicloSec: 50 }, { codice: 'etichettatura', gruppo: 'COMPLETAMENTO', cicloSec: 0 },
  ], { doppiaFaccia: 0 });
  assert.deepEqual(fasi, ['estrazione', 'smd_top', 'tht', 'collaudo', 'coating']);
  assert.deepEqual(fasiPreviste(null, { qtSmd: 50, doppiaFaccia: 1, presenteTht: 1, componentiMeccanici: 30, etichette: 1 }), ['estrazione', 'smd_top', 'smd_bot', 'tht', 'meccanico', 'etichettatura']);
  assert.deepEqual(fasiPreviste(null, null), []);
});

test('flusso: la riga passa da "da acquistare" a "da preparare" a "in produzione" con le spunte', () => {
  const base = riga({ parametri: { acquistoComponenti: 1, qtSmd: 40, presenteTht: 1, etichette: 1 } });
  let v = valutaRiga(base);
  assert.deepEqual(v.finestre, ['acquistare', 'preparare']);
  assert.deepEqual(v.materiale.map(m => m.nome), ['SMD', 'THT', 'Etichettatura']);
  assert.equal(v.materiale[0].nota, 'componenti da acquistare, PCB dal cliente');
  assert.equal(v.materiale[0].manca, true);
  // componenti comprati: resta solo da preparare
  v = valutaRiga({ ...base, flusso: { ...vuoto(), acquisti: { componenti: F } } });
  assert.deepEqual(v.finestre, ['preparare']);
  assert.equal(v.materiale[0].nota, 'componenti acquistati, PCB dal cliente');
  assert.equal(v.materiale[0].manca, false);
  // materiale verificato per tutte le fasi: passa in produzione da sola
  v = valutaRiga({ ...base, flusso: { ...vuoto(), acquisti: { componenti: F }, materiale: { smd_top: F, tht: F, etichettatura: F } } });
  assert.deepEqual(v.finestre, ['produzione']);
  assert.deepEqual(v.produzione.map(p => p.fase), ['estrazione', 'smd_top', 'tht', 'etichettatura']);
  // passaggio dato a mano anche senza spunte
  v = valutaRiga({ ...base, flusso: { ...vuoto(), inProduzione: F } });
  assert.deepEqual(v.finestre, ['acquistare', 'produzione']);
});

test('flusso: in produzione le fasi si spuntano da sole dai tempi del reparto; fine lavorazione parziale → anche da spedire', () => {
  const commessa = { id: 5, numero: 'C2026-0012', stato: 'in_produzione', quantita: 100, fineLavorazione: [{ quantita: 60, da: 'MH', il: ADESSO }],
    fasi: [{ codice: 'estrazioneMateriale', gruppo: 'GESTIONE MATERIALE', cicloSec: 10 }, { codice: 'pepTop', gruppo: 'SMD', cicloSec: 10 }, { codice: 'saldaturaMano', gruppo: 'THT', cicloSec: 10 }, { codice: 'test', gruppo: 'COMPLETAMENTO', cicloSec: 10 }],
    fasiConTempi: ['estrazioneMateriale', 'pepTop'] };
  const v = valutaRiga(riga({ commessa }));
  assert.equal(v.inProduzione, true);
  assert.deepEqual(v.produzione.map(p => [p.fase, p.auto]), [['estrazione', true], ['smd_top', true], ['tht', false], ['collaudo', false]]);
  assert.equal(v.finite, 60);
  assert.equal(v.pronte, 60);
  assert.deepEqual(v.finestre, ['produzione', 'spedire']);
  // DDT fatto per 60: in attesa di corriere; "Spedito" → partite
  const ddt = [{ id: 9, numero: 221, data: '2026-11-06', quantita: 60, partitoIl: null, stato: 'emesso' }];
  const v2 = valutaRiga(riga({ commessa, quantitaSpedita: 60, residuoQuantita: 40, stato: 'parziale', ddt }));
  assert.equal(v2.inAttesaCorriere, 60);
  assert.equal(v2.pronte, 0);
  assert.deepEqual(v2.finestre, ['produzione', 'spedire']);
  const v3 = valutaRiga(riga({ commessa, quantitaSpedita: 60, residuoQuantita: 40, stato: 'parziale', ddt: [{ ...ddt[0], partitoIl: ADESSO }] }));
  assert.equal(v3.partite, 60);
  assert.deepEqual(v3.finestre, ['produzione']);
  // tutto finito e tutto partito: la riga esce dal flusso
  const v4 = valutaRiga(riga({ commessa: { ...commessa, fineLavorazione: [{ quantita: 100, da: 'MH', il: ADESSO }] }, quantitaSpedita: 100, residuoQuantita: 0, stato: 'evaso', ddt: [{ ...ddt[0], quantita: 100, partitoIl: ADESSO }] }));
  assert.deepEqual(v4.finestre, []);
  // commessa rientrata senza dichiarazioni: tutte finite
  const v5 = valutaRiga(riga({ commessa: { ...commessa, stato: 'rientrata', fineLavorazione: [] } }));
  assert.equal(v5.finite, 100);
  assert.deepEqual(v5.finestre, ['spedire']);
});

test('flusso: priorità automatica dalla consegna richiesta, numero scritto a mano vince (Adriano 6/11/2026)', () => {
  const righe = [
    { id: 1, consegna: '2026-11-30', dataOrdine: '2026-10-01', numero: 70 }, { id: 2, consegna: '2026-11-06', dataOrdine: '2026-11-03', numero: 9002 },
    { id: 3, consegna: null, dataOrdine: '2026-09-01', numero: 61 }, { id: 4, consegna: '2026-11-06', dataOrdine: '2026-10-20', numero: 71 },
  ];
  assert.deepEqual(ordinaPerPriorita(righe).map(r => [r.id, r.posizione]), [[4, 1], [2, 2], [1, 3], [3, 4]]);
  const conMano = ordinaPerPriorita(righe.map(r => (r.id === 3 ? { ...r, priorita: 1 } : r)));
  assert.deepEqual(conMano.map(r => r.id), [3, 4, 2, 1]);
  assert.deepEqual(ordinaPerPriorita(righe.map(r => (r.id === 4 ? { ...r, priorita: 99 } : r))).map(r => r.id), [2, 1, 3, 4]);
  assert.equal(nuovaPriorita('su', 3), 2);
  assert.equal(nuovaPriorita('su', 1), 1);
  assert.equal(nuovaPriorita('giu', 3, undefined, 3), 3);
  assert.equal(nuovaPriorita('numero', 3, '7'), 7);
  assert.equal(nuovaPriorita('numero', 3, 'x'), 3);
  assert.equal(nuovaPriorita('auto', 3), null);
});

test('flusso: fine lavorazione parziale e totale, anche dalla scheda scansionata, senza doppioni', () => {
  let e = aggiungiFineLavorazione([], '50', false, 100, 'MH', ADESSO, 'telefono');
  assert.equal(e.righe.length, 1);
  assert.equal(aggiungiFineLavorazione(e.righe, '60', false, 100, 'MH', ADESSO, 'telefono').errore, 'Ne restano 50 da finire (50 già dichiarate su 100).');
  assert.equal(aggiungiFineLavorazione(e.righe, '', false, 100, 'MH', ADESSO, 'telefono').errore?.includes('quante schede'), true);
  e = aggiungiFineLavorazione(e.righe, '', true, 100, 'Ufficio', ADESSO, 'ufficio');
  assert.deepEqual(e.righe.map(x => x.quantita), [50, 50]);
  assert.ok(aggiungiFineLavorazione(e.righe, '', true, 100, 'Ufficio', ADESSO, 'ufficio').errore);
  const s = fineLavorazioneDaScansione({ schede: '30', data: '5/11' }, [], 100, ADESSO);
  assert.equal(s.aggiunta, 30);
  assert.equal(fineLavorazioneDaScansione({ schede: '30', data: '5/11' }, s.righe, 100, ADESSO).aggiunta, 0);
  assert.equal(fineLavorazioneDaScansione({ totale: 'X' }, s.righe, 100, ADESSO).aggiunta, 70);
  assert.equal(fineLavorazioneDaScansione({ schede: '', totale: '' }, [], 100, ADESSO).aggiunta, 0);
});

test('flusso: cruscotto con le cinque finestre, telefono, scheda stampata, guida', () => {
  assert.ok(readFileSync('src/server/rotte/cruscotto-generale.ts', 'utf8').includes('elencoFinestra(f, w.chiave'));
  assert.ok(readFileSync('src/server/rotte/reparto.ts', 'utf8').includes('fine-lavorazione'));
  assert.ok(readFileSync('src/server/rotte/commesse.ts', 'utf8').includes('FINE LAVORAZIONE'));
  assert.ok(readFileSync('src/server/lettura-ordini-ia.ts', 'utf8').includes('fine_lavorazione'));
  for (const q of ['flusso di produzione', 'da spedire in attesa di corriere', 'fine lavorazione parziale'])
    assert.ok(cercaGuida(q).slice(0, 3).some(r => r.argomento.id === 'flusso-produzione'), q);
});
