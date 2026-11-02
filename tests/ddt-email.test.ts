import { test } from 'node:test';
import assert from 'node:assert/strict';
import { destinatarioDdt, emailDdt, nomeFilePdfDdt } from '../src/engine/ddt.js';
import { pdfDdt } from '../src/server/pdf-ddt.js';
import { messaggioEmail } from '../src/engine/conferme-ordine.js';
import { datiNuovoComponente, famigliaFiltro } from '../src/engine/componenti-archivio.js';

test('DDT per email: oggetto e testo proposti con numero, data, riferimento e partenza', () => {
  const e = emailDdt({ numero: '219', data: '2026-11-02', azienda: 'CASTELTECH S.R.L.', riferimento: 'VS. ORDINE 037-26', trasportatore: 'BRT', colli: '2' });
  assert.equal(e.oggetto, 'DDT n. 219 del 02/11/2026 - CASTELTECH S.R.L.');
  assert.match(e.testo, /documento di trasporto n\. 219 del 02\/11\/2026 \(VS\. ORDINE 037-26\)/);
  assert.match(e.testo, /La merce parte 2 colli con BRT\./);
  assert.doesNotMatch(emailDdt({ numero: '1', data: '2026-11-02', azienda: 'X' }).testo, /parte/);
});

test('DDT per email: destinatario proposto = ultimo indirizzo usato per il cliente, poi amministrazione, CRM, PEC', () => {
  assert.equal(destinatarioDdt({ ultimoDdt: 'magazzino@cliente.it', amministrazione: 'amm@cliente.it' }), 'magazzino@cliente.it');
  assert.equal(destinatarioDdt({ ultimoDdt: null, amministrazione: '', crm: 'info@cliente.it', pec: 'cliente@pec.it' }), 'info@cliente.it');
  assert.equal(destinatarioDdt({ pec: 'cliente@pec.it' }), 'cliente@pec.it');
  assert.equal(destinatarioDdt({}), '');
});

test('DDT per email: nome del file PDF pulito', () => {
  assert.equal(nomeFilePdfDdt('219', 2026, 'L.P.S. Srl à'), 'DDT_219_2026_L_P_S_Srl_a.pdf');
  assert.equal(nomeFilePdfDdt(null, 2026, ''), 'DDT_bozza_2026.pdf');
});

test('DDT per email: il PDF si crea (anche con tante righe e caratteri strani) e si allega al messaggio', async () => {
  const d = { id: 1, numero: 219, sezionale: '', data: '2026-11-02', stato: 'emesso', riferimento_esterno: 'VS. ORDINE 037-26',
    dati_trasporto: { causale: 'RESO LAVORATO', a_cura: 'VETTORE', trasportatore: 'BRT', colli: '2', peso: '5 KG', aspetto: 'SCATOLA', inizio: '2026-11-02T09:30' } };
  const righe = Array.from({ length: 60 }, (_, i) => ({ codice: `EA1002-${i}`, descrizione: `SCHEDA ${i} RESISTENZA 10Ω MONTATA`, um: 'PZ', quantita: 10 + i, solo_descrizione: i === 5 }));
  const pdf = await pdfDdt(d, righe, { ragione_sociale: 'CASTELTECH S.R.L.', partita_iva: '01777320332' },
    { ragione_sociale: 'CLIENTE PROVA S.R.L.', indirizzo: 'VIA ROMA 1', cap: '29100', comune: 'PIACENZA', provincia: 'PC' });
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  const m = messaggioEmail({ da: 'info@casteltech.net', a: ['a@b.it'], oggetto: 'DDT', testo: 'ciao', allegato: { nome: 'DDT_219_2026.pdf', mime: 'application/pdf', dati: pdf } });
  assert.match(m, /filename="DDT_219_2026\.pdf"/);
});

test('Componenti: aggiungi dalla ricerca vuota (una parola = P/N, più parole = descrizione)', () => {
  assert.deepEqual(datiNuovoComponente(' grm155r71c104ka88d '), { pn: 'GRM155R71C104KA88D', descrizione: '' });
  assert.deepEqual(datiNuovoComponente('resistenza  2,2k 0603'), { pn: '', descrizione: 'resistenza 2,2k 0603' });
  assert.deepEqual(datiNuovoComponente(''), { pn: '', descrizione: '' });
});

test('Componenti: filtro per famiglia solo tra quelle in archivio', () => {
  assert.equal(famigliaFiltro('rs', ['RS', 'CC']), 'RS');
  assert.equal(famigliaFiltro('XX', ['RS', 'CC']), '');
  assert.equal(famigliaFiltro('-', ['RS']), '-');
  assert.equal(famigliaFiltro(undefined, ['RS']), '');
});
