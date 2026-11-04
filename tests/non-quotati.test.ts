// Componenti non quotati nelle note del preventivo (Adriano 4/11/2026). Esempi inventati.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FRASE_NON_QUOTATO, aggiornaNoteNonQuotati, righeNonQuotate } from '../src/engine/non-quotati.js';

const riga = (x: any) => ({ pn: null, designatori: null, valore: null, ...x });

test('non quotati: solo i critici, non quelli con prezzo a mano, non montati o forniti dal cliente', () => {
  const righe = righeNonQuotate([
    riga({ pn: 'STM32F103C8T6', designatori: 'U3', reperibilita: { livello: 'critico' } }),
    riga({ pn: 'LM358', designatori: 'U1', reperibilita: { livello: 'ok' } }),
    riga({ pn: 'ADUM1201', designatori: 'U7', reperibilita: { livello: 'critico' }, prezzoManuale: 2.5 }),
    riga({ pn: 'XYZ', esito: 'NON MONTATO', reperibilita: { livello: 'critico' } }),
    riga({ pn: 'ABC', clienteFornisce: true, reperibilita: { livello: 'critico' } }),
    riga({ pn: 'BAV99', alternativaScelta: 'BAV99-7-F', designatori: 'D1, D2', reperibilita: { livello: 'critico' } }),
    riga({ valore: '10uF 50V', reperibilita: { livello: 'critico' } }),
    riga({ pn: 'NE555', designatori: 'U9', reperibilita: { livello: 'attenzione' } }),
  ]);
  assert.deepEqual(righe, [
    `STM32F103C8T6 (U3): ${FRASE_NON_QUOTATO}`,
    `BAV99-7-F (D1, D2): ${FRASE_NON_QUOTATO}`,
    `10uF 50V: ${FRASE_NON_QUOTATO}`,
  ]);
});

test('non quotati: le note scritte a mano restano, le righe vecchie si sostituiscono', () => {
  const prima = `Cliente urgente.\nSTM32 (U3): ${FRASE_NON_QUOTATO}\nBAV99 (D1): ${FRASE_NON_QUOTATO}\n`;
  assert.equal(aggiornaNoteNonQuotati(prima, [`BAV99 (D1): ${FRASE_NON_QUOTATO}`]), `Cliente urgente.\nBAV99 (D1): ${FRASE_NON_QUOTATO}`);
  // prezzo scritto a mano nella BOM: nessun critico, la riga sparisce
  assert.equal(aggiornaNoteNonQuotati(prima, []), 'Cliente urgente.');
  assert.equal(aggiornaNoteNonQuotati('', [`X: ${FRASE_NON_QUOTATO}`]), `X: ${FRASE_NON_QUOTATO}`);
});

test('non quotati: la pagina del preventivo usa la stessa frase', () => {
  assert.ok(readFileSync('public/preventivo.js', 'utf8').includes(`'${FRASE_NON_QUOTATO}'`));
});
