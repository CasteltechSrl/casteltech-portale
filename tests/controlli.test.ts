import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { avvisoMargine, avvisiRighe, riepilogoAvvisi } from '../src/engine/avviso-margine.js';
import { elencoControlli, riepilogoControlli, giorniTra, type DatiControlli } from '../src/engine/controlli.js';
import { MENU_GRUPPI } from '../src/server/views/layout.js';
import { cercaGuida } from '../src/engine/guida.js';

const rif = { numero: 'P2026-0001', prezzoScheda: 5.54, marginePct: 20 };

test('avviso margine: sotto il preventivo oltre l\'1 %, margine basso, niente senza codice o preventivo', () => {
  assert.equal(avvisoMargine({ codice: 'DE0102-012', prezzo: 5.0 }, rif)?.livello, 'critico');
  assert.match(avvisoMargine({ codice: 'DE0102-012', prezzo: 5.0 }, rif)!.testo, /Sotto il preventivo P2026-0001: lì 5,54 € a scheda, qui 5,00 € \(−10 %\)/);
  // lo sconto conta: 5,54 con il 10 % di sconto è sotto
  assert.equal(avvisoMargine({ codice: 'X', prezzo: 5.54, sconto: 10 }, rif)?.livello, 'critico');
  // tolleranza dell'1 %: 5,50 su 5,54 va bene
  assert.equal(avvisoMargine({ codice: 'X', prezzo: 5.5 }, rif), null);
  assert.equal(avvisoMargine({ codice: 'X', prezzo: 6 }, rif), null);
  // prezzo in linea ma margine del preventivo sotto il 10 %
  assert.equal(avvisoMargine({ codice: 'X', prezzo: 6 }, { ...rif, marginePct: 8 })?.livello, 'attenzione');
  assert.equal(avvisoMargine({ codice: 'X', prezzo: 6 }, { ...rif, marginePct: null }), null);
  // niente da dire: riga di testo, senza codice, senza preventivo, prezzo vuoto, preventivo a zero
  assert.equal(avvisoMargine({ codice: 'X', prezzo: 1, solo_descrizione: true }, rif), null);
  assert.equal(avvisoMargine({ codice: null, prezzo: 1 }, rif), null);
  assert.equal(avvisoMargine({ codice: 'X', prezzo: 1 }, undefined), null);
  assert.equal(avvisoMargine({ codice: 'X', prezzo: null }, rif), null);
  assert.equal(avvisoMargine({ codice: 'X', prezzo: 1 }, { ...rif, prezzoScheda: 0 }), null);
  // numeri grandi con il punto delle migliaia
  assert.match(avvisoMargine({ codice: 'X', prezzo: 1000 }, { ...rif, prezzoScheda: 1250 })!.testo, /lì 1\.250,00 € a scheda, qui 1\.000,00 € \(−20 %\)/);
});

test('avviso margine: per riga (codice maiuscolo/minuscolo) e frase di riepilogo', () => {
  const riferimenti = new Map([['DE0102-012', rif], ['ALTRO', { ...rif, marginePct: 5 }]]);
  const avvisi = avvisiRighe([
    { codice: 'de0102-012', prezzo: 4 }, { codice: 'DE0102-012', prezzo: 6 }, { codice: 'altro', prezzo: 9 }, { codice: 'SCONOSCIUTO', prezzo: 1 }, {},
  ], riferimenti);
  assert.deepEqual([...avvisi.keys()], [0, 2]);
  assert.equal(avvisi.get(0)!.livello, 'critico');
  assert.equal(avvisi.get(2)!.livello, 'attenzione');
  assert.equal(riepilogoAvvisi(avvisi), 'Controlla i prezzi: 1 riga sotto il prezzo del preventivo e 1 riga con margine del preventivo sotto il 10 % (righe in giallo). La fattura si può emettere comunque.');
  assert.equal(riepilogoAvvisi(new Map()), null);
});

const vuoti: DatiControlli = { oggi: '2026-11-02', ddtDaFatturare: [], ordiniSenzaConsegna: [], prodottiSenzaPrezzo: [], clientiSenzaRecapitoSdi: [],
  fattureFornitoriSenzaScadenza: [], preventiviFermi: [], commesseOltreConsegna: [], tempiApertiVecchi: [] };

test('controlli settimanali: solo le sezioni con righe, dalle urgenti; DDT urgenti solo oltre 20 giorni', () => {
  assert.deepEqual(elencoControlli(vuoti), []);
  assert.deepEqual(riepilogoControlli([]), { totale: 0, urgenti: 0, daControllare: 0 });
  const c = elencoControlli({ ...vuoti,
    ddtDaFatturare: [{ id: 1, numero: '12', data: '2026-10-01', cliente: 'UNIVAC' }, { id: 2, numero: '13', data: '2026-10-28', cliente: 'UNIVAC' }],
    preventiviFermi: [{ id: 5, numero: 'P2026-0005', cliente: 'LPS', aggiornato: '2026-09-01' }],
    prodottiSenzaPrezzo: [{ id: 9, codice: 'ABC', cliente: 'JOX', clienteId: 3 }],
    commesseOltreConsegna: [{ id: 7, numero: 'C2026-0007', cliente: 'FOIND', consegna: '2026-10-20' }],
  });
  assert.deepEqual(c.map(x => x.chiave), ['commesse-oltre-consegna', 'ddt-vecchi', 'prodotti-senza-prezzo', 'preventivi-fermi']);
  assert.equal(c[1].righe.length, 1, 'solo il DDT di 32 giorni, non quello di 5');
  assert.equal(c[1].righe[0].link, '/amministrazione/documenti/1');
  assert.equal(c[1].righe[0].dettaglio, '32 gg');
  assert.equal(c[0].righe[0].dettaglio, 'consegna 20/10/2026, 13 gg fa');
  assert.equal(c[2].righe[0].link, '/anagrafiche/prodotti?cliente=3');
  assert.equal(c[3].righe[0].dettaglio, 'fermo da 62 gg');
  assert.deepEqual(riepilogoControlli(c), { totale: 4, urgenti: 2, daControllare: 1 });
  assert.equal(giorniTra('2026-10-31', '2026-11-02'), 2);
});

test('controlli e avviso margine: menu, cruscotto, bozza di fattura e guida', () => {
  const amm = MENU_GRUPPI.find(g => g.chiave === 'amministrazione')!;
  assert.ok(amm.voci.some(([, url]) => url === '/amministrazione/controlli'));
  assert.match(readFileSync('src/server/rotte/cruscotto-generale.ts', 'utf8'), /\/amministrazione\/controlli/);
  const rotta = readFileSync('src/server/rotte/amministrazione.ts', 'utf8');
  assert.match(rotta, /r\.get\('\/controlli'/);
  assert.match(rotta, /avvisiRighe\(righe, riferimenti\)/);
  assert.match(rotta, /riga-margine/);
  assert.ok(cercaGuida('controlli settimanali lunedì').slice(0, 2).some(r => r.argomento.id === 'controlli-settimanali'));
  assert.ok(cercaGuida('fattura prezzo sotto il preventivo').slice(0, 2).some(r => r.argomento.id === 'avviso-margine-fattura'));
});
