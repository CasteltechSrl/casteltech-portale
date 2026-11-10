import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { html } from '../src/server/views/html.js';
import { cercaGuida } from '../src/engine/guida.js';

process.env.DATABASE_URL ??= 'postgres://solo-per-i-test@localhost/nessuno'; // il modulo db non si collega finché non si fanno query
const { disegnaFasce } = await import('../src/server/rotte/cruscotto-generale.js');

const fasce = [
  { chiave: 'produzione', nome: 'Produzione', riquadri: [
    { chiave: 'preparare', titolo: 'Da preparare per produzione', numero: 16, sotto: 'materiale da verificare', link: '/cruscotto?flusso=preparare',
      apriCon: '/cruscotto?flusso=preparare', dettaglio: () => html`<p>ELENCO-PREPARARE</p>` },
    { chiave: 'spedite', titolo: 'Spedite nel mese', numero: 43, link: '/x' },
  ] },
  { chiave: 'amministrazione', nome: 'Amministrazione', riquadri: [
    { chiave: 'da-incassare', titolo: 'Da incassare', numero: '79.799 €', link: '/amministrazione/crediti', livello: 'urgente' as const, dettaglio: () => html`<p>ELENCO-INCASSI</p>` },
  ] },
];

test('cruscotto a fasce (Adriano 8/11/2026): nome dell\'ambito grande, riquadri uguali con Apri e dettagli, dettaglio solo quello aperto', () => {
  const chiuso = String(disegnaFasce(fasce, null));
  assert.match(chiuso, /<section class="fascia fascia-produzione" id="fascia-produzione">\s*<h2 class="ambito">Produzione<\/h2>/);
  assert.match(chiuso, /<h2 class="ambito">Amministrazione<\/h2>/);
  assert.equal((chiuso.match(/class="riquadro /g) ?? []).length, 3);
  assert.equal((chiuso.match(/>Apri ›</g) ?? []).length, 3);
  // dettagli solo dove c'è un elenco; la produzione usa ancora ?flusso= (azioni e menu ci tornano)
  assert.match(chiuso, /href="\/cruscotto\?flusso=preparare#fascia-produzione">▾ dettagli/);
  assert.match(chiuso, /href="\/cruscotto\?apri=da-incassare#fascia-amministrazione">▾ dettagli/);
  assert.equal((chiuso.match(/▾ dettagli/g) ?? []).length, 2);
  assert.doesNotMatch(chiuso, /ELENCO-/);
  assert.match(chiuso, /class="riquadro urgente /);
  const aperto = String(disegnaFasce(fasce, 'da-incassare'));
  assert.match(aperto, /<div class="dettaglio-fascia"><p>ELENCO-INCASSI<\/p><\/div>/);
  assert.doesNotMatch(aperto, /ELENCO-PREPARARE/);
  assert.match(aperto, /href="\/cruscotto#fascia-amministrazione">▴ chiudi/);
});

test('cruscotto: gli ambiti in ordine, da fare oggi in cima', () => {
  const src = readFileSync(new URL('../src/server/rotte/cruscotto-generale.ts', import.meta.url), 'utf8');
  const ordine = ["nome: 'Da fare oggi'", "nome: 'Produzione'", "nome: 'Commerciale'", "nome: 'Ordini clienti'", "nome: 'Acquisti'", "nome: 'Amministrazione'", "nome: 'Dipendenti'", "nome: 'Controlli'", "nome: 'Sistema'"];
  for (const n of ordine) assert.ok(src.includes(n), n);
  assert.match(src, /daFareOggi\(d\.daFare, riprendi, oggi\), produzione\(d, flusso, oggi, solaLettura\), commerciale\(d, oggi\), ordini\(d, oggi\), acquisti\(d\),\s*amministrazione\(d, oggi\), dipendenti\(d\), fasciaControlli\(controlli\), sistema\(d\)/);
  assert.equal(cercaGuida('cruscotto fasce ambiti')[0]?.argomento.id, 'cruscotto-generale');
});
