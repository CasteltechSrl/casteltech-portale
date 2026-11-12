import { test } from 'node:test';
import assert from 'node:assert/strict';
const vicino = (a: number | null, b: number) => assert.ok(a != null && Math.abs(a - b) < 0.01, `${a} ≠ ${b}`);
import { costoOrarioMesi, costoRiga, media, mediaDodiciMesi, mediePerAnno, oreCedolino, reparto, tariffeProposte, CATEGORIE_ESCLUSE } from '../src/engine/costo-orario.js';

test('costo orario: reparti dalla qualifica', () => {
    assert.equal(reparto('OPERAIO'), 'produzione');
    assert.equal(reparto('APPRENDISTA'), 'produzione');
    assert.equal(reparto('TIROCINANTI'), 'produzione');
    assert.equal(reparto('IMPIEGATO'), 'ufficio');
    assert.equal(reparto('SOCIO'), 'socio');
    assert.equal(reparto('SOCI E COLLABORATORI'), 'socio');
  });

test('costo orario: il TFR liquidato non conta, quello che matura sì', () => {
    vicino(costoRiga({ anno: 2026, mese: 3, qualifica: 'OPERAIO', lordo: 1350, contributi: 400, tfr: 3628, altri: 20 }), 1350 + 400 + 20 + 100);
    assert.equal(costoRiga({ anno: 2019, mese: 4, qualifica: 'TIROCINANTI', lordo: 450, contributi: 0, tfr: 0, altri: 0 }), 450);
  });

test('costo orario: ore del cedolino: ore lavorate, altrimenti giorni × 8; la tredicesima non ha ore', () => {
    assert.equal(oreCedolino({ anno: 2026, mese: 9, qualifica: 'OPERAIO', mensilita: 'ordinaria', ore: 168, giorni: 21 }), 168);
    assert.equal(oreCedolino({ anno: 2026, mese: 9, qualifica: 'OPERAIO', mensilita: 'ordinaria', ore: null, giorni: 20 }), 160);
    assert.equal(oreCedolino({ anno: 2026, mese: 9, qualifica: 'OPERAIO', mensilita: 'ordinaria', ore: null, giorni: null }), null);
    assert.equal(oreCedolino({ anno: 2025, mese: 12, qualifica: 'OPERAIO', mensilita: 'tredicesima', ore: null, giorni: null }), 0);
  });

  const mesi = costoOrarioMesi({
    mesi: [{ anno: 2026, mese: 1 }, { anno: 2026, mese: 2 }, { anno: 2026, mese: 3 }],
    personale: [
      { anno: 2026, mese: 1, qualifica: 'OPERAIO', lordo: 2700, contributi: 800, tfr: 0, altri: 0 },
      { anno: 2026, mese: 1, qualifica: 'IMPIEGATO', lordo: 1350, contributi: 400, tfr: 0, altri: 0 },
      { anno: 2026, mese: 1, qualifica: 'SOCIO', lordo: 2800, contributi: 448, tfr: 0, altri: 0 },
      { anno: 2026, mese: 2, qualifica: 'OPERAIO', lordo: 2700, contributi: 800, tfr: 5000, altri: 0 },
      { anno: 2026, mese: 3, qualifica: 'OPERAIO', lordo: 2700, contributi: 800, tfr: 0, altri: 0 },
    ],
    ore: [
      { anno: 2026, mese: 1, qualifica: 'OPERAIO', mensilita: 'ordinaria', ore: 160, giorni: 20 },
      { anno: 2026, mese: 1, qualifica: 'OPERAIO', mensilita: 'ordinaria', ore: 160, giorni: 20 },
      { anno: 2026, mese: 1, qualifica: 'IMPIEGATO', mensilita: 'ordinaria', ore: 160, giorni: 20 },
      { anno: 2026, mese: 1, qualifica: 'SOCIO', mensilita: 'ordinaria', ore: null, giorni: null },
      { anno: 2026, mese: 2, qualifica: 'OPERAIO', mensilita: 'ordinaria', ore: 320, giorni: 40 },
    ],
    gestione: [
      { anno: 2026, mese: 1, famiglie: { servizi: 6000, compensi: 3248, personale: 99999, materie: 50000 }, fonte: 'portale' },
      { anno: 2026, mese: 2, famiglie: { servizi: 6400 }, fonte: 'portale' },
      { anno: 2026, mese: 3, famiglie: { servizi: 6400 }, fonte: 'portale' },
    ],
  });

test('costo orario: ora operatore e ora azienda del mese; socio nella gestione, materie e dipendenti fuori', () => {
    const g = mesi[0];
    vicino(g.produzione.orario, (2700 + 800 + 200) / 320);
    vicino(g.ufficio.orario, (1350 + 400 + 100) / 160);
    assert.equal(g.azienda.costo, 9248);
    vicino(g.azienda.orario, 9248 / 480);
    assert.equal(mesi[1].tfrLiquidato, 5000);
    vicino(mesi[1].produzione.orario, 3700 / 320);
  });

test('costo orario: mese senza cedolini: fuori dalle medie; media = somma costi ÷ somma ore', () => {
    assert.equal(mesi[2].valido, false);
    const m = media(mesi);
    assert.equal(m.mesi, 2);
    vicino(m.azienda.orario, (9248 + 6400) / 800);
    assert.equal(mediaDodiciMesi(mesi, '2026-01').mesi, 1);
    assert.equal(mediePerAnno(mesi)[0].anno, 2026);
  });

test('costo orario: tariffe proposte arrotondate al mezzo euro', () => {
    assert.equal(tariffeProposte(media(mesi)).costoAziendaH, 19.5);
  });

test('costo orario: le lavorazioni rivendute sono escluse, le consulenze no', () => {
    assert.ok(CATEGORIE_ESCLUSE.includes('montaggi_esterni'));
    assert.ok(CATEGORIE_ESCLUSE.includes('progettazione'));
    assert.ok(!CATEGORIE_ESCLUSE.includes('consulenze_tecniche'));
  });

test('costo orario: il cedolino della liquidazione senza ore non aggiunge ore stimate', () => {
  const [m] = costoOrarioMesi({
    mesi: [{ anno: 2026, mese: 4 }],
    personale: [{ anno: 2026, mese: 4, qualifica: 'OPERAIO', lordo: 1800, contributi: 500, tfr: 3300, altri: 0 }],
    ore: [
      { anno: 2026, mese: 4, qualifica: 'OPERAIO', mensilita: 'ordinaria', ore: 168, giorni: 21, lordo: 1800 },
      { anno: 2026, mese: 4, qualifica: 'OPERAIO', mensilita: 'ordinaria', ore: null, giorni: null, lordo: 3300 },
    ],
    gestione: [],
  });
  assert.equal(m.produzione.ore, 168);
  assert.equal(m.cedoliniSenzaOre, 1);
});

test('costo orario: anni con più soci al lavoro non sono attendibili', () => {
  const mesi2 = costoOrarioMesi({
    mesi: [{ anno: 2023, mese: 1 }],
    personale: [{ anno: 2023, mese: 1, qualifica: 'OPERAIO', lordo: 1000, contributi: 300, tfr: 0, altri: 0 }],
    ore: [
      { anno: 2023, mese: 1, qualifica: 'OPERAIO', mensilita: 'ordinaria', ore: 160, giorni: 20, lordo: 1000 },
      { anno: 2023, mese: 1, qualifica: 'SOCIO', mensilita: 'ordinaria', ore: null, giorni: null, lordo: 2800 },
      { anno: 2023, mese: 1, qualifica: 'SOCIO', mensilita: 'ordinaria', ore: null, giorni: null, lordo: 2500 },
    ],
    gestione: [],
  });
  assert.equal(media(mesi2).sociAlLavoro, true);
  assert.equal(media(mesi2).attendibile, false);
});

test('costo orario: titolare e familiare senza cedolino entrano nell\'ora azienda, non nell\'ora operatore', () => {
  const m = costoOrarioMesi({
    mesi: [{ anno: 2026, mese: 1 }, { anno: 2026, mese: 2 }],
    personale: [{ anno: 2026, mese: 1, qualifica: 'OPERAIO', lordo: 1350, contributi: 400, tfr: 0, altri: 0 }],
    ore: [{ anno: 2026, mese: 1, qualifica: 'OPERAIO', mensilita: 'ordinaria', ore: 160, giorni: 20 }],
    gestione: [{ anno: 2026, mese: 1, famiglie: { servizi: 4000 }, fonte: 'portale' }, { anno: 2026, mese: 2, famiglie: { servizi: 4000 }, fonte: 'portale' }],
    senzaCedolino: { oreMese: 240, costoMese: 400 },
  });
  vicino(m[0].azienda.orario, 4400 / 400);
  vicino(m[0].produzione.orario, (1350 + 400 + 100) / 160);
  assert.equal(m[1].valido, false);
  assert.equal(m[1].azienda.ore, 0);
});
