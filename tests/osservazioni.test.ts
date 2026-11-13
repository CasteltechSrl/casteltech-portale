import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chiaveSegnalazione, chiusaPerPreventivo, conAccettate, contaOsservazioni, riapri, rispondi, risposteDaRivedere, type Accettate } from '../src/engine/scheda/accettate.js';
import { parametriDaAnalisi } from '../src/engine/scheda/preventivo.js';
import { propostaCosaFare } from '../src/engine/pre-produzione.js';
import { cercaGuida } from '../src/engine/guida.js';
import type { AnalisiScheda, Segnalazione } from '../src/engine/scheda/analisi.js';

const S1: Segnalazione = { livello: 'errore', testo: '4 componenti SMD hanno la stessa posizione di un altro sullo stesso lato.', refs: ['R13', 'R20'] };
const S2: Segnalazione = { livello: 'avviso', testo: 'Manca la BOM: codici e valori non si possono controllare.' };
const analisi = (seg: Segnalazione[]) => ({ segnalazioni: seg, componenti: [{ ref: 'R13', segnalazioni: ['x'] }, { ref: 'R20', segnalazioni: ['x'] }] }) as unknown as AnalisiScheda;

test('osservazioni: "Va bene" senza testo = risolta, come prima', () => {
  const v = rispondi(null, { da: 'Adriano', il: '2026-11-13T10:00:00Z' });
  assert.equal(v.esito, 'va_bene');
  assert.equal(v.risposte, undefined);
  const a = conAccettate(analisi([S1]), { [chiaveSegnalazione(S1)]: v });
  assert.ok(a.segnalazioni[0].accettata);
  assert.equal(a.componenti[0].segnalazioni.length, 0);
});

test('osservazioni: le voci vecchie {da, il} valgono "va bene"', () => {
  const a = conAccettate(analisi([S1]), { [chiaveSegnalazione(S1)]: { da: 'X', il: '2026-10-28' } } as Accettate);
  assert.ok(a.segnalazioni[0].accettata);
});

test('osservazioni: risposta "da vedere prima della produzione" non pesa sul preventivo ma resta aperta per la produzione', () => {
  const v = rispondi(null, { da: 'Adriano', il: '2026-11-13T10:00:00Z', testo: 'R13 e R20 sono alternative: chiedere al cliente quale montare', esito: 'produzione' });
  const a = conAccettate(analisi([S1, S2]), { [chiaveSegnalazione(S1)]: v });
  const s = a.segnalazioni[0];
  assert.ok(s.rimandata && !s.accettata);
  assert.ok(chiusaPerPreventivo(s));
  assert.equal(s.risposte?.[0].testo, 'R13 e R20 sono alternative: chiedere al cliente quale montare');
  assert.equal(a.componenti[0].segnalazioni.length, 1, 'il componente resta critico nelle stampe di produzione');
  assert.deepEqual(contaOsservazioni(a.segnalazioni), { perIlPrezzo: 1, perLaProduzione: 1, conRisposta: 1 });
  const { daControllare } = parametriDaAnalisi({ ...a, conteggi: {}, lavorazione: {}, consumi: {} } as any);
  assert.ok(!daControllare.some(x => /segnalazioni da chiarire/.test(x)), 'l\'errore rimandato non va nel "Da controllare" del preventivo');
  const p = propostaCosaFare({ contesto: {} as any, segnalazioniPreanalisi: a.segnalazioni });
  assert.ok(p.nonFare.some(x => x.includes('Non partire') && x.includes('chiedere al cliente quale montare')));
});

test('osservazioni: le risposte si aggiungono, non si perdono con "riapri"', () => {
  let v = rispondi(null, { da: 'Adriano', il: '2026-11-13T10:00:00Z', testo: 'chiesto al cliente', esito: 'aperta' });
  v = rispondi(v, { da: 'Federico', il: '2026-11-20T10:00:00Z', testo: 'confermato: R13 non si monta', esito: 'va_bene', momento: 'produzione' });
  assert.equal(v.risposte?.length, 2);
  assert.equal(v.esito, 'va_bene');
  assert.equal(v.da, 'Federico');
  assert.equal(v.risposte?.[1].momento, 'produzione');
  const r = riapri(v, { da: 'Adriano', il: '2026-11-21T10:00:00Z' });
  assert.equal(r?.esito, 'aperta');
  assert.equal(r?.risposte?.length, 2);
  assert.equal(riapri({ da: 'X', il: 'Y' }, { da: 'A', il: 'B' }), null, 'senza risposte la voce si toglie');
  // una risposta senza scegliere l'esito mantiene quello di prima
  assert.equal(rispondi({ da: 'X', il: 'Y', esito: 'produzione' }, { da: 'A', il: 'B', testo: 'nota' }).esito, 'produzione');
});

test('osservazioni: risposta che cambia il prezzo dopo l\'ultimo salvataggio = preventivo da ricontrollare', () => {
  const v = rispondi(null, { da: 'Adriano', il: '2026-11-13T10:00:00Z', testo: 'il cliente vuole anche il lato BOT', esito: 'va_bene', prezzo: true });
  const a = conAccettate(analisi([S1]), { [chiaveSegnalazione(S1)]: v });
  assert.equal(risposteDaRivedere(a.segnalazioni, '2026-11-13T09:00:00Z').length, 1);
  assert.equal(risposteDaRivedere(a.segnalazioni, '2026-11-13T11:00:00Z').length, 0, 'salvato dopo: già rivisto');
});

test('osservazioni: la guida trova l\'argomento', () => {
  assert.equal(cercaGuida('rispondere alle osservazioni')[0]?.argomento.id, 'osservazioni-risposte');
});
