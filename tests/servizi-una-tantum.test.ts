import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controllaServizio, eCodiceServizio, serviziNellaDescrizione, servizioDellaRiga, servizioProposto, vendutoPerServizio, SERVIZI_INIZIALI }
  from '../src/engine/servizi-una-tantum.js';
import { eServizio } from '../src/engine/ordini.js';

const CODICI = SERVIZI_INIZIALI.map(s => s.codice);

test('servizi una tantum: le descrizioni dello storico FIC trovano il servizio giusto', () => {
  assert.equal(servizioDellaRiga('001', 'LAMINA SERIGRAFICA', CODICI), 'UT-LAMINA');
  assert.equal(servizioDellaRiga('', 'LAMINE SERIGRAFICHE GIRKEY E VRS (TOP+BOTTOM)', CODICI), 'UT-LAMINA');
  assert.equal(servizioDellaRiga('003', 'STENCIL SOMU', CODICI), 'UT-LAMINA');
  assert.equal(servizioDellaRiga('007', 'PROGRAMMAZIONE ATTREZZATURE RELATIVA AL CODICE ALSC042', CODICI), 'UT-PROGRAMMAZIONE');
  assert.equal(servizioDellaRiga('', 'PROGRAMMAZIONE MACCHINE COSTO UNA TANTUM', CODICI), 'UT-PROGRAMMAZIONE');
  assert.equal(servizioDellaRiga('CSMISV0211', 'ATTREZZAGGIO PER PRIMA PRODUZIONE PCB', CODICI), 'UT-ATTREZZAGGIO-PCB');
  // più servizi nella stessa riga: non si attribuisce (non si divide a caso)
  assert.equal(servizioDellaRiga('007', 'PROGRAMMAZIONE ATTREZZATURE + LAMINA SERIGRAFICA SMD', CODICI), null);
  assert.deepEqual(serviziNellaDescrizione('PROGRAMMAZIONE ATTREZZATURE E ELABORAZIONE DOCUMENTAZIONE DI PRODUZIONE').sort(), ['UT-DOCUMENTAZIONE', 'UT-PROGRAMMAZIONE']);
  // la riga del prodotto "comprensiva dei costi di attrezzaggio" non è un servizio; nemmeno il generico "costi una tantum"
  assert.equal(servizioDellaRiga('', 'PLANT_POLYAMMIDE_PA25UM COMPRENSIVI DI COSTI DI ATTREZZAGGIO', CODICI), null);
  assert.equal(servizioDellaRiga('', 'COSTI UNA TANTUM', CODICI), null);
  assert.equal(servizioDellaRiga('', 'ATTREZZAGGIO MACCHINE PER 15 PEZZI', CODICI), null);
  // il codice UT vince sulla descrizione
  assert.equal(servizioDellaRiga('ut-lamina', 'LAMINA SERIGRAFICA CON TRATTAMENTI + PROGRAMMAZIONE ATTREZZATURE', CODICI), 'UT-LAMINA');
  assert.equal(servizioDellaRiga('UT-SCONOSCIUTO', 'LAMINA', CODICI), null);
});

test('servizi una tantum: venduto per codice e anno, note di credito in meno, righe miste a parte', () => {
  const v = vendutoPerServizio([
    { codice: '001', descrizione: 'LAMINA SERIGRAFICA', anno: 2025, quantita: 2, importo: 220 },
    { codice: 'UT-LAMINA', descrizione: 'LAMINA SERIGRAFICA CON TRATTAMENTI', anno: 2026, quantita: 1, importo: 165 },
    { codice: 'UT-LAMINA', descrizione: 'LAMINA SERIGRAFICA', anno: 2026, quantita: -1, importo: -110 },
    { codice: '', descrizione: 'COSTI UNA TANTUM - LAMINA SERIGRAFICA - PROGRAMMAZIONE ATTREZZATURE', anno: 2026, quantita: 1, importo: 350 },
  ], CODICI);
  const lamina = v.perCodice.find(x => x.codice === 'UT-LAMINA')!;
  assert.deepEqual(lamina.anni[2025], { quantita: 2, importo: 220, righe: 1 });
  assert.deepEqual(lamina.anni[2026], { quantita: 0, importo: 55, righe: 2 });
  assert.deepEqual(v.insieme, [{ anno: 2026, righe: 1, importo: 350 }]);
  assert.equal(v.perCodice.length, 4);
});

test('servizi una tantum: codice UT-, maiuscolo, descrizione obbligatoria', () => {
  assert.deepEqual(controllaServizio({ codice: 'collaudo', descrizione: ' collaudo  funzionale ', prezzo: '50,5' }),
    { codice: 'UT-COLLAUDO', descrizione: 'COLLAUDO FUNZIONALE', prezzo: 50.5 });
  assert.deepEqual(controllaServizio({ codice: 'UT-LAMINA', descrizione: 'LAMINA', prezzo: '' }), { codice: 'UT-LAMINA', descrizione: 'LAMINA', prezzo: null });
  assert.equal((controllaServizio({ codice: 'UT-', descrizione: 'X' }) as any).campo, 'codice');
  assert.equal((controllaServizio({ codice: 'UT-X1', descrizione: '' }) as any).campo, 'descrizione');
  assert.equal((controllaServizio({ codice: 'UT-X1', descrizione: 'X', prezzo: '-3' }) as any).campo, 'prezzo');
  assert.ok(eCodiceServizio(' ut-lamina') && !eCodiceServizio('LAMINA'));
});

test('servizi una tantum: proposta per gli ordini letti e righe UT sempre servizi (non da evadere)', () => {
  const servizi = SERVIZI_INIZIALI.map(s => ({ codice: s.codice, attivo: true }));
  assert.equal(servizioProposto('LAMINA SERIGRAFICA TOP', servizi), 'UT-LAMINA');
  assert.equal(servizioProposto('PREPARAZIONE DOCUMENTAZIONE', servizi), 'UT-DOCUMENTAZIONE');
  assert.equal(servizioProposto('COSTI UNA TANTUM', servizi), null);
  assert.equal(servizioProposto('LAMINA', servizi.map(s => ({ ...s, attivo: s.codice !== 'UT-LAMINA' }))), null);
  assert.ok(eServizio('UT-DOCUMENTAZIONE', 'PREPARAZIONE DOCUMENTAZIONE DI PRODUZIONE'));
});

test('servizi una tantum: conta la prima riga della descrizione (le righe del prodotto elencano sotto cosa comprendono)', () => {
  assert.equal(servizioDellaRiga('', 'PCB CONTROLLO MOTORE\n- ACQUISTO COMPONENTI\n- LAMINA SERIGRAFICA', CODICI), null);
  assert.equal(servizioDellaRiga('', 'SL_0106\nCON LAMINA SERIGRAFICA', CODICI), null);
  assert.equal(servizioDellaRiga('001', 'LAMINA SERIGRAFICA\nVT61 TOP\nVT60 TOP+BOT', CODICI), 'UT-LAMINA');
  assert.equal(servizioDellaRiga('', 'COSTI UNA TANTUM\n- LAMINA SERIGRAFICA', CODICI), 'UT-LAMINA');
  const v = vendutoPerServizio([{ codice: '', descrizione: 'COSTI UNA TANTUM\n- LAMINA SERIGRAFICA\n- PROGRAMMAZIONE ATTREZZATURE', anno: 2025, quantita: 1, importo: 300 }], CODICI);
  assert.deepEqual(v.insieme, [{ anno: 2025, righe: 1, importo: 300 }]);
});
