import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vociConsumo, consumoReale } from '../src/engine/consumi.js';
import { controllaRientro } from '../src/engine/rientro.js';
import { tempiRealiPerFase, type Rilevazione } from '../src/engine/consuntivo.js';

test('scheda: materiale di consumo previsto dal preventivo e reale a scheda dal totale del lotto', () => {
  const prev = {
    n_schede: 100,
    catalogo: { parametri: [{ codice: 'crema', default: 0 }, { codice: 'viteria', default: 0 }] },
    parametri: { crema: 1.5, stagnoInFilo: 0.25, kaptonInNastro: 4, bolliniKapton: 2, tropicalizzante: 2, viteria: 0.07 },
  };
  const v = Object.fromEntries(vociConsumo(prev, 250).map(m => [m.codice, m]));
  assert.equal(v.pastaSaldante.previstoTesto, '1,5 gr');
  assert.equal(v.kaptonNastro.previsto, 4);
  assert.equal(v.conformal.previsto, 5);                   // 2 bombolette per 100 schede → 5 per 250
  assert.equal(v.viteria.previsto, null);                  // nel preventivo è in €: si stampa ma non si confronta
  assert.equal(v.viteria.previstoTesto, '0,07 €');
  assert.equal(v.flussante.previstoTesto, '');
  assert.equal(consumoReale(v.pastaSaldante, 400, 250), 1.6);   // 400 gr sul lotto = 1,6 gr a scheda
  assert.equal(consumoReale(v.conformal, 4, 250), 4);           // bombolette: totale del lotto
  assert.equal(consumoReale(v.pastaSaldante, null, 250), null);
  // stagno saldatrice: (100 reofori × 0,02 gr + 3 gr) × 1,2 di scorie = 6 gr a scheda
  const s2 = vociConsumo({ n_schede: 100, catalogo: { parametri: [], materiali: [{ codice: 'stagnoLF', quantita: 0.02 }] },
    parametri: { stagno: 100, stagnoPerSaldature: 3, scorieSaldatrice: 20 } }, 100).find(m => m.codice === 'stagnoSaldatrice')!;
  assert.ok(Math.abs(s2.previsto! - 6) < 1e-9);
});

test('rientro: righe con solo il tempo totale contano nel ciclo e nell\'uomo', () => {
  const t = tempiRealiPerFase([
    { fase: 'imb', data: '2026-10-02', inizio: '14:00', fine: '14:30', tipo: 'S' },
    { fase: 'imb', durataMin: 20, persone: 2, tipo: 'S' },
  ] as Rilevazione[]);
  assert.equal(t.imb.cicloSec, (30 + 20) * 60);
  assert.equal(t.imb.uomoSec, (30 + 40) * 60);
});

test('rientro: controlli su righe non chiuse, P senza causa, tempi dimenticati o fuori misura, sovrapposizioni', () => {
  const previste = [
    { codice: 'pep', numero: '6T.2', nome: 'Pick&Place TOP', cicloSec: 3600 },
    { codice: 'imb', numero: '36', nome: 'Imballaggio', cicloSec: 1800 },
    { codice: 'aoi', numero: '10', nome: 'AOI', cicloSec: 1800 },
  ];
  const c = controllaRientro([
    { fase: 'pep', operatore: 'Luca', data: '2026-10-20', inizio: '08:00', fine: '11:00', tipo: 'S' },         // +200%
    { fase: 'pep', operatore: 'luca', data: '2026-10-20', inizio: '10:30', fine: '10:45', tipo: 'P' },         // P senza causa + sovrapposta
    { fase: 'imb', operatore: 'Anna', data: '2026-10-21', inizio: '09:00', tipo: 'S' },                        // non chiusa
    { fase: 'imb', durataMin: 25, tipo: 'S' },                                                                  // solo totale: ok
    { fase: 'sep', data: '2026-10-21', inizio: '09:00', fine: '09:20', tipo: 'S', totaleScrittoMin: 40 },      // totale incoerente, fase non prevista
  ] as any, previste);
  const errori = c.filter(x => x.livello === 'errore').map(x => x.testo);
  const avvisi = c.filter(x => x.livello === 'avviso').map(x => x.testo);
  assert.ok(errori.some(t => t.includes('Riga 2') && t.includes('senza causa')));
  assert.ok(errori.some(t => t.includes('Riga 3') && t.includes('mai chiuso')));
  assert.equal(errori.length, 2);
  assert.ok(avvisi.some(t => t.includes('AOI') && t.includes('Dimenticato')));
  assert.ok(avvisi.some(t => t.includes('Pick&Place') && t.includes('+200%')));
  assert.ok(avvisi.some(t => t.includes('stesso orario')));
  assert.ok(avvisi.some(t => t.includes('totale scritto 0:40')));
  assert.ok(avvisi.some(t => t.includes('non prevista')));
  assert.ok(!avvisi.some(t => t.includes('Imballaggio')));   // 25 min contro 30 previsti: nella norma
});

test('etichette corte del preventivo: unità e "a scheda" tra parentesi', async () => {
  const { etichettaBreve } = await import('../src/server/views/etichette.js');
  assert.equal(etichettaBreve({ etichetta: 'Montaggio meccanico per scheda', unita: 's' }), 'Montaggio meccanico (sec. a scheda)');
  assert.equal(etichettaBreve({ etichetta: 'Pasta saldante per scheda', unita: 'gr' }), 'Pasta saldante (gr a scheda)');
  assert.equal(etichettaBreve({ etichetta: 'Stagno saldatrice per scheda', unita: 'reofori' }), 'Stagno saldatrice (nr. reofori a scheda)');
  assert.equal(etichettaBreve({ etichetta: 'Programmazione P&P (per lato)', unita: 'h', tipo: 'durata' }), 'Programmazione P&P (h:mm a lato)');
  assert.equal(etichettaBreve({ etichetta: 'Buste ESD (totali)', unita: 'pz' }), 'Buste ESD (nr. totali)');
  assert.equal(etichettaBreve({ etichetta: 'Preriscaldamento forno (fisso a lotto)', unita: '€' }), 'Preriscaldamento forno (€ a lotto)');
  assert.equal(etichettaBreve({ etichetta: 'Numero item (codici SMD + THT + PCB + altro)', unita: 'pz' }), 'Numero item (nr.)');
  assert.equal(etichettaBreve({ etichetta: 'Feeder TOP', unita: 'pz' }), 'Feeder TOP (nr.)');
  assert.equal(etichettaBreve({ etichetta: 'Smontaggio P&P per feeder', unita: 'min' }), 'Smontaggio P&P (min a feeder)');
  assert.equal(etichettaBreve({ etichetta: 'Saldatura a onda prevista', unita: 'sì/no' }), 'Saldatura a onda prevista');
});

test('operatori: sigle di 2 caratteri dalle iniziali, senza doppioni; si possono scrivere a mano', async () => {
  const { leggiOperatori } = await import('../src/engine/operatori.js');
  const o = leggiOperatori('Norberto Gambi\nAdriano Gambi\nAdriano Croci\nAndrea Gatti\nZZ = Mario Rossi\nSingh Harpreet');
  const s = Object.fromEntries(o.map(x => [x.nome, x.sigla]));
  assert.equal(s['Norberto Gambi'], 'NG');
  assert.equal(s['Adriano Gambi'], 'AG');
  assert.equal(s['Adriano Croci'], 'AC');
  assert.equal(s['Andrea Gatti'], 'AA');          // AG è già usata: iniziale + 2ª lettera del cognome
  assert.equal(s['Mario Rossi'], 'ZZ');           // sigla scritta a mano
  assert.equal(s['Singh Harpreet'], 'SH');
  assert.equal(new Set(o.map(x => x.sigla)).size, o.length);
});

test('prog. forno: TOP STD con solo TOP; TOP+BOT STD e BOT TOP STD con due lati; vale quello scritto', async () => {
  const { programmaForno } = await import('../src/engine/forno.js');
  const vuoto = { programmi: {} as Record<string, { top: string; bot: string }> };
  assert.deepEqual(programmaForno(vuoto, false), { top: 'TOP STD', bot: '' });
  assert.deepEqual(programmaForno(vuoto, true), { top: 'TOP+BOT STD', bot: 'TOP STD' });
  assert.deepEqual(programmaForno({ programmi: { progForno: { top: 'PROFILO_X', bot: '' } } }, true), { top: 'PROFILO_X', bot: 'TOP STD' });
});
