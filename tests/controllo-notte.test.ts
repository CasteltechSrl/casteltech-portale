/** Correzioni del controllo notturno del 4/11/2026. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { valoreAttributo } from '../src/engine/attributi-fatturapa.js';
import { emailFattura } from '../src/engine/fattura-email.js';

test('attributi FatturaPA: numero colli 0 rifiutato (lo schema vuole da 1), giorni termini pagamento 0 ammesso', () => {
  assert.match(valoreAttributo({ nome: 'NumeroColli', tipo: 'intero', max: 4 } as any, '0').errore ?? '', /almeno 1/);
  assert.equal(valoreAttributo({ nome: 'NumeroColli', tipo: 'intero', max: 4 } as any, '3').valore, '3');
  assert.equal(valoreAttributo({ nome: 'GiorniTerminiPagamento', tipo: 'intero', max: 3 } as any, '0').valore, '0');
});

test('email della fattura in split payment: dice anche il netto da pagare', () => {
  const e = emailFattura({ tipo: 'fattura', numero: 5, data: '2026-11-04', azienda: 'Casteltech S.r.l.', totale: 122, nettoDaPagare: 100 });
  assert.match(e.testo, /totale 122,00 €, netto da pagare 100,00 €/);
  const n = emailFattura({ tipo: 'fattura', numero: 5, data: '2026-11-04', azienda: 'Casteltech S.r.l.', totale: 122 });
  assert.doesNotMatch(n.testo, /netto da pagare/);
});
