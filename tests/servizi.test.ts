import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avvisiServizi, costoIa, erroreIa, prezzoModello, riavvioInatteso, righeServizi, statoSoglia, type DatiServizi } from '../src/engine/servizi.js';

test('servizi: costo dell\'IA dal listino (cache scritta 1,25×, letta 0,1×)', () => {
  assert.deepEqual(prezzoModello('claude-sonnet-5-5'), { ingresso: 2, uscita: 10 });
  assert.deepEqual(prezzoModello('claude-opus-5-5'), { ingresso: 4, uscita: 20 });
  assert.deepEqual(prezzoModello('claude-opus-4-8'), { ingresso: 5, uscita: 25 });
  assert.deepEqual(prezzoModello('claude-haiku-5-5'), { ingresso: 0.1, uscita: 0.5 });
  // un milione di token letti e 100 mila scritti con Sonnet 5.5: 2 $ + 1 $
  assert.equal(costoIa('claude-sonnet-5-5', { input_tokens: 1_000_000, output_tokens: 100_000 }), 3);
  assert.equal(costoIa('claude-sonnet-5-5', { cache_creation_input_tokens: 1_000_000, cache_read_input_tokens: 1_000_000 }), 2.5 + 0.2);
  // modello sconosciuto: prezzo alto, per non sottostimare
  assert.equal(prezzoModello('modello-nuovo').ingresso, 5);
});

test('servizi: errori dell\'IA in parole chiare (credito finito, tetto, chiave, limite)', () => {
  const credito = erroreIa(400, { error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } });
  assert.equal(credito.tipo, 'credito');
  assert.match(credito.messaggio, /Credito dell'IA .*esaurito/);
  assert.match(credito.messaggio, /Rileggi con l'IA/);
  assert.equal(erroreIa(402, { error: { type: 'billing_error', message: '' } }).tipo, 'credito');
  assert.equal(erroreIa(400, { error: { message: 'You have reached your specified API usage limits.' } }).tipo, 'tetto');
  assert.equal(erroreIa(401, null).tipo, 'chiave');
  assert.equal(erroreIa(429, null).tipo, 'limite');
  assert.equal(erroreIa(529, { error: { type: 'overloaded_error' } }).tipo, 'sovraccarico');
  assert.equal(erroreIa(500, { error: { message: 'boh' } }).tipo, 'altro');
});

test('servizi: soglie all\'80% (attenzione) e al 95% (critico)', () => {
  assert.equal(statoSoglia(50, 100), 'ok');
  assert.equal(statoSoglia(80, 100), 'attenzione');
  assert.equal(statoSoglia(96, 100), 'critico');
  assert.equal(statoSoglia(10, null), 'sconosciuto');
});

const base = (): DatiServizi => ({
  ia: { configurata: true, modello: 'claude-sonnet-5-5', oggi: { chiamate: 2, errori: 0, costoUsd: 0.1 }, mese: { chiamate: 40, errori: 0, tokenIngresso: 900_000, tokenUscita: 80_000, costoUsd: 2.6 } },
  memoria: { usataMb: 200, piccoMb: 250, limiteMb: 512, lavoriMb: 0, budgetLavoriMb: 160, avviatoIl: '2026-10-29T08:00:00Z', riavviiInattesi: [] },
  database: { spazioMb: 120, limiteMb: 512, tabelle: [], ore: null, neonCollegato: false },
  distributori: [{ nome: 'DigiKey', configurato: true, oggi: { chiamate: 100, errori: 0 }, limiteGiorno: 1000 }],
});

test('servizi: tutto a posto = nessun avviso', () => {
  const r = righeServizi(base(), new Date('2026-10-29T10:00:00Z'));
  assert.deepEqual(r.map(x => x.chiave), ['ia', 'render', 'neon', 'dist-DigiKey']);
  assert.deepEqual(avvisiServizi(r), []);
});

test('servizi: credito dell\'IA quasi finito → avviso con quanto resta', () => {
  const d = base();
  d.ia!.credito = { importo: 20, dal: '2026-10-01', speso: 17 };
  const a = avvisiServizi(righeServizi(d));
  assert.equal(a.length, 1);
  assert.equal(a[0].stato, 'attenzione');
  assert.match(a[0].avviso!, /restano circa 3,00 \$/);
});

test('servizi: credito finito (errore dopo l\'ultima lettura riuscita) → critico, sparisce quando torna a funzionare', () => {
  const d = base();
  d.ia!.ultimaRiuscita = '2026-10-29T09:00:00Z';
  d.ia!.ultimoErrore = { tipo: 'credito', messaggio: erroreIa(402, null).messaggio, il: '2026-10-29T09:30:00Z' };
  const a = avvisiServizi(righeServizi(d));
  assert.equal(a[0].stato, 'critico');
  assert.match(a[0].avviso!, /Credito dell'IA/);
  d.ia!.ultimaRiuscita = '2026-10-29T10:00:00Z';
  assert.deepEqual(avvisiServizi(righeServizi(d)), []);
  // un errore che si risolve riprovando (troppe richieste) non è un blocco
  d.ia!.ultimoErrore = { tipo: 'limite', messaggio: 'troppe richieste', il: '2026-10-29T11:00:00Z' };
  assert.deepEqual(avvisiServizi(righeServizi(d)), []);
});

test('servizi: memoria, database e distributori vicini al limite', () => {
  const d = base();
  d.memoria!.piccoMb = 480;
  d.memoria!.riavviiInattesi = ['2026-10-29T09:15:00Z'];
  d.database!.spazioMb = 430;
  d.distributori![0].oggi.chiamate = 900;
  const a = avvisiServizi(righeServizi(d, new Date('2026-10-29T10:00:00Z')));
  assert.deepEqual(a.map(x => x.chiave).sort(), ['dist-DigiKey', 'neon', 'render']);
  assert.match(a.find(x => x.chiave === 'render')!.avviso!, /riavviato da solo una volta/);
  // il riavvio di ieri l'altro non fa più avviso (resta solo nella nota)
  d.memoria!.piccoMb = 250;
  const dopo = righeServizi(d, new Date('2026-10-31T10:00:00Z')).find(x => x.chiave === 'render')!;
  assert.equal(dopo.stato, 'ok');
});

test('servizi: IA senza chiave = non attiva, senza avviso', () => {
  const d = base();
  d.ia!.configurata = false;
  const r = righeServizi(d);
  assert.equal(r[0].stato, 'spento');
  assert.deepEqual(avvisiServizi(r), []);
});

test('servizi: riavvio inatteso solo se la versione è la stessa dell\'avvio prima', () => {
  assert.equal(riavvioInatteso('abc', 'abc'), true);
  assert.equal(riavvioInatteso('abc', 'def'), false);
  assert.equal(riavvioInatteso(null, 'abc'), false);
});

test('servizi: i consumi in memoria fanno scattare l\'avviso in cima alle pagine (senza database)', async () => {
  process.env.ANTHROPIC_API_KEY ??= 'prova';
  const s = await import('../src/server/stato-servizi.js');
  const salvati: number[] = [];
  s.quandoCiSonoConsumi(() => salvati.push(1));
  const prima = s.totale('ia', s.inizioMese()).costoUsd ?? 0;
  s.rispostaIa('lettura documenti', 'claude-sonnet-5-5', { input_tokens: 500_000, output_tokens: 50_000 });
  assert.equal((s.totale('ia', s.inizioMese()).costoUsd ?? 0) - prima, 1.5);
  assert.ok(salvati.length > 0, 'il consumo va in coda per il database');
  assert.ok(s.daSalvare.size > 0);
  s.ia.credito = { importo: 1.7, dal: s.inizioMese(), spesoPrima: 0, contaDa: s.inizioMese() };
  const a = s.avvisoServizi();
  assert.ok(a && a.testi.some(t => /credito dell'IA quasi finito/.test(t)));
  s.erroreServizio('ia', 'credito', 'Credito dell\'IA (Anthropic) esaurito');
  assert.equal(s.avvisoServizi()!.livello, 'critico');
  s.ia.credito = null;
});
