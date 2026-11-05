import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggiornaPreProduzione, chiaveRigaMateriale, contestoDaParametri, firmaLeggibile, leggiPreProduzione, materialePronto, moduloDaForm,
  propostaCosaFare, situazioneMateriale, statoChecklist, vociPerCommessa, VOCI_CHECKLIST, type RigaMateriale,
} from '../src/engine/pre-produzione.js';
import type { EsitoManca } from '../src/engine/cosa-manca.js';
import { cercaGuida } from '../src/engine/guida.js';

const ADESSO = '2026-11-05T14:30:00.000Z';

test('pre-produzione: lettura tollerante del jsonb salvato', () => {
  const v = leggiPreProduzione(null);
  assert.deepEqual(v, { checklist: {}, fare: '', nonFare: '', inCasa: {}, viaLibera: null, aggiornata: null });
  const x = leggiPreProduzione({ checklist: { ordine: { da: 'Cinzia', il: ADESSO }, rotta: 'no' }, fare: 'x', viaLibera: { da: 'Adriano', il: ADESSO } });
  assert.deepEqual(Object.keys(x.checklist), ['ordine']);
  assert.equal(x.viaLibera?.da, 'Adriano');
});

test('pre-produzione: le voci della checklist seguono le lavorazioni del preventivo', () => {
  assert.equal(new Set(VOCI_CHECKLIST.map(v => v.chiave)).size, VOCI_CHECKLIST.length);
  const onda = contestoDaParametri({ usaOnda: 1, acquistoComponenti: 1, acquistoPcb: 1, aoiTop: 1, lavaggioSchede: 1 }, { haBom: true, haDocumenti: true });
  const chiavi = vociPerCommessa(onda).map(v => v.chiave);
  assert.ok(chiavi.includes('onda') && !chiavi.includes('tht-mano') && chiavi.includes('pcb') && !chiavi.includes('pcb-cliente'));
  assert.ok(chiavi.includes('bom') && chiavi.includes('segnalazioni') && chiavi.includes('materiale') && chiavi.includes('lavaggio') && chiavi.includes('aoi'));
  // conto lavoro: componenti e PCB del cliente, SMD a mano = niente programmi né lamine
  const mano = contestoDaParametri({ presenteTht: 1, smdAMano: 1 });
  const k2 = vociPerCommessa(mano).map(v => v.chiave);
  assert.ok(k2.includes('tht-mano') && k2.includes('materiale-cliente') && k2.includes('pcb-cliente') && !k2.includes('programmi') && !k2.includes('lamine') && !k2.includes('onda'));
});

test('pre-produzione: spunte con firma, via libera solo a checklist completa, decade se si toglie una voce', () => {
  const voci = vociPerCommessa(contestoDaParametri({ presenteTht: 1, smdAMano: 1 }));
  const tutte = voci.map(v => v.chiave);
  const prima = aggiornaPreProduzione(leggiPreProduzione(null), { spunte: ['ordine'], fare: 'Fare A', nonFare: '', inCasa: ['LM358DR'], azione: 'salva' }, voci, 'Cinzia', ADESSO);
  assert.equal(prima.dati.checklist.ordine.da, 'Cinzia');
  assert.equal(prima.dati.inCasa.LM358DR.il, ADESSO);
  assert.match(prima.messaggio, /1 voci su/);
  // via libera con voci mancanti: rifiutato, ma le altre modifiche restano
  const no = aggiornaPreProduzione(prima.dati, { spunte: ['ordine', 'documenti'], fare: 'Fare A', nonFare: 'No B', inCasa: [], azione: 'via-libera' }, voci, 'Adriano', '2026-11-06T08:00:00.000Z');
  assert.ok(no.errore?.includes('mancano'));
  assert.equal(no.dati.viaLibera, null);
  assert.equal(no.dati.checklist.ordine.da, 'Cinzia', 'la firma di chi ha confermato per primo resta');
  assert.equal(no.dati.checklist.documenti.da, 'Adriano');
  assert.equal(no.dati.nonFare, 'No B');
  // tutte spuntate: via libera dato
  const si = aggiornaPreProduzione(no.dati, { spunte: tutte, fare: 'Fare A', nonFare: 'No B', inCasa: [], azione: 'via-libera' }, voci, 'Adriano', '2026-11-06T09:00:00.000Z');
  assert.equal(si.dati.viaLibera?.da, 'Adriano');
  assert.ok(statoChecklist(si.dati, voci).completa);
  // una voce tolta dopo il via libera: decade
  const dec = aggiornaPreProduzione(si.dati, { spunte: tutte.slice(1), fare: '', nonFare: '', inCasa: [], azione: 'salva' }, voci, 'Cinzia', '2026-11-06T10:00:00.000Z');
  assert.equal(dec.dati.viaLibera, null);
  assert.match(dec.messaggio, /decade/);
  // togli esplicito
  const tolto = aggiornaPreProduzione(si.dati, { spunte: tutte, fare: '', nonFare: '', inCasa: [], azione: 'togli-via-libera' }, voci, 'Adriano', ADESSO);
  assert.equal(tolto.dati.viaLibera, null);
  // chiavi sconosciute ignorate
  assert.deepEqual(Object.keys(aggiornaPreProduzione(leggiPreProduzione(null), { spunte: ['boh'], fare: '', nonFare: '', inCasa: [], azione: 'salva' }, voci, 'X', ADESSO).dati.checklist), []);
});

test('pre-produzione: modulo del POST letto con elenchi singoli o multipli', () => {
  const m = moduloDaForm({ spunte: 'ordine', inCasa: ['A', ' B '], fare: ' x ', azione: 'via-libera' });
  assert.deepEqual(m, { spunte: ['ordine'], fare: 'x', nonFare: '', inCasa: ['A', 'B'], azione: 'via-libera' });
  assert.equal(moduloDaForm({ azione: 'altro' }).azione, 'salva');
});

const righe: RigaMateriale[] = [
  { n: 1, pn: 'RC0603FR-0710KL', produttore: 'YAGEO', designatori: 'R1,R2', descrizione: null, codiceProduzione: 'RS-0603-10K', qtaScheda: 2,
    acquisti: [{ schede: 100, lorda: 220, scelta: { fornitore: 'digikey', codice: '311-10KGRCT-ND', mpn: 'RC0603FR-0710KL', qta: 220, prezzo: 0.01, totale: 2.2, disponibile: true } }] },
  { n: 2, pn: 'GRM188R71C104KA01D', produttore: 'MURATA', designatori: 'C1', descrizione: null, codiceProduzione: 'CC-0603-100N', qtaScheda: 1,
    acquisti: [{ schede: 100, lorda: 110, scelta: { fornitore: 'mouser', codice: '81-GRM188', mpn: 'GRM188R71C104KA01D', qta: 110, prezzo: 0.02, totale: 2.2, disponibile: true } }] },
  { n: 3, pn: 'STM32F103C8T6', produttore: 'ST', designatori: 'U1', descrizione: null, codiceProduzione: null, qtaScheda: 1, acquisti: [{ schede: 100, lorda: 105 }] },
  { n: 4, pn: 'SEL-0001', produttore: null, designatori: 'J1', descrizione: null, codiceProduzione: null, qtaScheda: 1 },
  { n: 5, pn: 'X', produttore: null, designatori: 'R9', descrizione: null, codiceProduzione: null, qtaScheda: 1, esito: 'NON MONTATO' },
  { n: 6, pn: 'LM358DR', produttore: 'TI', designatori: 'U2', descrizione: null, codiceProduzione: null, qtaScheda: 1, clienteFornisce: true },
  { n: 7, pn: 'BAT54', produttore: null, designatori: 'D1', descrizione: null, codiceProduzione: null, qtaScheda: 1,
    acquisti: [{ schede: 100, lorda: 105, scelta: { fornitore: 'tme', codice: 'BAT54-X', mpn: 'BAT54', qta: 105, prezzo: 0.05, totale: 5.25, disponibile: true } }] },
];
const esiti: EsitoManca[] = [
  { riga: { codice: '311-10KGRCT-ND', descrizione: 'RC0603FR-0710KL YAGEO RIF. R1,R2', quantita: 220, prezzo: 0.01, distributore: 'digikey' }, ordinata: 220, arrivata: 220, mancante: 0, stato: 'arrivato', ordini: ['205/2026'] },
  { riga: { codice: 'ALTRO', descrizione: 'GRM188R71C104KA01D MURATA RIF. C1', quantita: 110, prezzo: 0.02, distributore: 'mouser' }, ordinata: 50, arrivata: 0, mancante: 60, stato: 'parziale', ordini: ['bozza 9'] },
  { riga: { codice: 'BAT54-X', descrizione: 'BAT54 RIF. D1', quantita: 105, prezzo: 0.05, distributore: 'tme' }, ordinata: 0, arrivata: 0, mancante: 105, stato: 'da_ordinare', ordini: [] },
];

test('pre-produzione: situazione del materiale riga per riga (cliente, in casa, ordini a fornitore, senza prezzo)', () => {
  const s = situazioneMateriale(righe, 100, esiti, ['sel-0001'], { BAT54: { da: 'Cinzia', il: ADESSO } });
  const per = Object.fromEntries(s.righe.map(r => [r.riga.n, r]));
  assert.equal(per[1].stato, 'arrivato'); assert.deepEqual(per[1].ordini, ['205/2026']); assert.equal(per[1].lotto, 220);
  assert.equal(per[2].stato, 'parziale', 'trovato per P/N anche con un altro codice del distributore'); assert.equal(per[2].ordinata, 50);
  assert.equal(per[3].stato, 'senza_prezzo');
  assert.equal(per[4].stato, 'cliente', 'codice in Anagrafiche → Componenti clienti');
  assert.equal(per[5].stato, 'non_montato');
  assert.equal(per[6].stato, 'cliente', 'riga segnata "fornito dal cliente" nella BOM');
  assert.equal(per[7].stato, 'in_casa', 'spuntato dall\'ufficio vince sugli ordini'); assert.equal(per[7].inCasa?.da, 'Cinzia');
  assert.equal(s.conta.cliente, 2); assert.equal(s.conta.in_casa, 1);
  assert.equal(materialePronto(s.conta), false);
  assert.equal(materialePronto({ ...s.conta, parziale: 0, senza_prezzo: 0 }), true);
  assert.equal(chiaveRigaMateriale({ n: 3, pn: ' abc ', alternativaScelta: null }), 'ABC');
  assert.equal(chiaveRigaMateriale({ n: 3, pn: 'abc', alternativaScelta: 'DEF' }), 'DEF');
  assert.equal(chiaveRigaMateriale({ n: 3, pn: null, alternativaScelta: null }), 'riga-3');
  // senza quantità quotata: niente lotto, tutto "senza prezzo" salvo cliente/non montato/in casa
  const s2 = situazioneMateriale(righe, null, [], [], {});
  assert.equal(s2.righe[0].stato, 'senza_prezzo'); assert.equal(s2.righe[0].lotto, null);
});

test('pre-produzione: cosa fare / non fare proposti dal portale', () => {
  const c = contestoDaParametri({ usaOnda: 1, aoiTop: 1, doppiaFaccia: 1 }, { primoLotto: true });
  const p = propostaCosaFare({
    contesto: c, saldaturaMotivo: 'SMD su un lato solo', noteMontaggio: 'C12 dopo il lavaggio', noteCliente: [{ refs: ['U1'], nota: 'non montare' }],
    segnalazioniProdotto: [{ testo: 'attenzione al verso di D3', numero: 'C2026-0001' }],
    segnalazioniPreanalisi: [{ livello: 'errore', testo: 'R5 in BOM e non nel pick and place' }, { livello: 'avviso', testo: 'ok', accettata: { da: 'x', il: 'y' } }, { livello: 'info', testo: 'nota' }],
    componentiCritici: ['STM32 (U1): non disponibile'], notePreventivo: 'Compilato in automatico.\nR7: componente non quotato perché attualmente non disponibile.',
  });
  assert.ok(p.fare.some(x => x.startsWith('SMD su tutti e due i lati')));
  assert.ok(p.fare.some(x => x.includes('saldatrice a onda') && x.includes('SMD su un lato solo')));
  assert.ok(p.fare.some(x => x.includes('Primo lotto')));
  assert.ok(p.fare.some(x => x.includes('Nota del cliente su U1')));
  assert.ok(p.fare.some(x => x.includes('(C2026-0001)')));
  assert.ok(p.fare.some(x => x.includes('C12 dopo il lavaggio')));
  assert.ok(p.nonFare.some(x => x.includes('R5 in BOM')));
  assert.ok(!p.nonFare.some(x => x.includes('nota') && x.includes('info')), 'le note e le segnalazioni accettate non diventano divieti');
  assert.equal(p.nonFare.filter(x => x.includes('ok')).length, 0);
  assert.ok(p.nonFare.some(x => x.includes('STM32')));
  assert.ok(p.nonFare.some(x => x.includes('R7')));
  assert.ok(p.nonFare.some(x => x.startsWith('Non lavare')), 'niente lavaggio nel preventivo');
  const lav = propostaCosaFare({ contesto: contestoDaParametri({ lavaggioSchede: 1 }) });
  assert.ok(!lav.nonFare.some(x => x.startsWith('Non lavare')) && lav.fare.some(x => x.startsWith('Lavaggio')));
});

test('pre-produzione: firma leggibile e guida', () => {
  assert.equal(firmaLeggibile({ da: 'Cinzia', il: ADESSO }), 'Cinzia, 05/11/2026, 15:30');
  assert.equal(firmaLeggibile(null), '');
  assert.equal(cercaGuida('scheda di pre-produzione checklist via libera')[0].argomento.id, 'pre-produzione');
  assert.equal(cercaGuida('istruzioni per chi lavora la commessa: cosa fare e cosa non fare')[0].argomento.id, 'pre-produzione');
  assert.equal(cercaGuida('checklist prima di produrre')[0].argomento.id, 'pre-produzione');
});
