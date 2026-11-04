import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daInviare, mancaSdi, segniInvio } from '../src/engine/invii.js';
import { destinatarioPreventivo, emailPreventivo } from '../src/engine/preventivo-email.js';
import { calcolaPreventivo, type FaseDef, type Tariffe, type VoceDef } from '../src/engine/calcolo.js';
import { contenutoStampa, leggiRitocchi } from '../src/engine/stampa-preventivo.js';
import { cercaGuida } from '../src/engine/guida.js';
process.env.DATABASE_URL ??= 'postgres://solo-per-i-test@localhost/nessuno';
const { pdfPreventivo, nomeFilePdfPreventivo } = await import('../src/server/pdf-preventivo.js');
const { segnoInvioElenco, riquadroInvio } = await import('../src/server/views/invio.js');

test('segno "Inviato" (Adriano 4/11/2026): nessun segno = da inviare; email con data e destinatario', () => {
  assert.deepEqual(segniInvio({ tipo: 'ddt', stato: 'emesso' }), []);
  assert.equal(daInviare({ tipo: 'ddt', stato: 'emesso' }), true);
  assert.equal(daInviare({ tipo: 'ddt', stato: 'bozza' }), false);            // le bozze non sono "da inviare"
  const s = segniInvio({ tipo: 'ddt', stato: 'emesso', email_a: 'magazzino@cliente.it', email_inviata_il: '2026-11-04T09:15:00Z' });
  assert.equal(s.length, 1);
  assert.equal(s[0].canale, 'email');
  assert.equal(s[0].breve, 'Inviato 04/11/2026');
  assert.match(s[0].frase, /magazzino@cliente\.it il 04\/11\/2026 alle 10:15/);
  assert.equal(daInviare({ tipo: 'ddt', stato: 'emesso', email_inviata_il: '2026-11-04T09:15:00Z' }), false);
});

test('segno a mano, Fatture in Cloud e preventivi segnati "inviato" senza email', () => {
  const m = segniInvio({ tipo: 'conferma_ordine', stato: 'inviato', email_a: 'PEC', email_inviata_il: '2026-11-04T09:15:00Z', inviato_a_mano: true });
  assert.equal(m[0].canale, 'mano');
  assert.match(m[0].frase, /a mano.*\(PEC\)/);
  assert.equal(segniInvio({ tipo: 'ddt', stato: 'emesso', origine: 'fic' })[0].canale, 'fic');
  assert.equal(segniInvio({ tipo: 'preventivo', stato: 'inviato' })[0].breve, 'Inviato');
  assert.deepEqual(segniInvio({ tipo: 'preventivo', stato: 'bozza' }), []);
});

test('fatture: invio per email e invio allo SdI sono due segni diversi', () => {
  const f = { tipo: 'fattura', stato: 'consegnato', origine: 'portale', sdi_stato: 'Consegnato', sdi_inviato_il: '2026-11-04T10:00:00Z' };
  assert.deepEqual(segniInvio(f).map(x => [x.canale, x.breve, x.livello]), [['sdi', 'SdI consegnata', 'ok']]);
  const conEmail = segniInvio({ ...f, email_a: 'amm@cliente.it', email_inviata_il: '2026-11-04T11:00:00Z' });
  assert.deepEqual(conEmail.map(x => x.canale), ['email', 'sdi']);
  assert.equal(segniInvio({ ...f, sdi_stato: 'Scartato' })[0].livello, 'errore');
  assert.equal(segniInvio({ ...f, sdi_stato: 'caricato' })[0].livello, 'attesa');
  // emessa ma non partita: nessun segno SdI, e "manca l'invio allo SdI"
  assert.equal(mancaSdi({ tipo: 'fattura', stato: 'emesso', origine: 'portale' }), true);
  assert.equal(mancaSdi({ ...f }), false);
  assert.equal(mancaSdi({ tipo: 'fattura', stato: 'emesso', origine: 'fic' }), false);
  assert.equal(mancaSdi({ tipo: 'ddt', stato: 'emesso' }), false);
  // un DDT non va allo SdI anche se avesse uno stato
  assert.deepEqual(segniInvio({ tipo: 'ddt', stato: 'emesso', sdi_stato: 'Consegnato' }), []);
});

test('segno nelle pagine: etichetta con titolo, riquadro con "Non ancora inviato" e "Segna come inviato"', () => {
  assert.equal(String(segnoInvioElenco({ tipo: 'ddt', stato: 'emesso' })), '');
  const e = String(segnoInvioElenco({ tipo: 'ddt', stato: 'emesso', email_a: 'a@b.it', email_inviata_il: '2026-11-04T09:15:00Z' }));
  assert.match(e, /class="invio invio-ok invio-email" title="Inviato per email a a@b\.it/);
  const r = String(riquadroInvio({ tipo: 'ddt', stato: 'emesso' }, { segna: '/amministrazione/documenti/5/segna-inviato' }));
  assert.match(r, /Non ancora inviato/);
  assert.match(r, /Segna come inviato/);
  const mano = String(riquadroInvio({ tipo: 'ddt', stato: 'emesso', email_inviata_il: '2026-11-04T09:15:00Z', inviato_a_mano: true }, { segna: '/x' }));
  assert.match(mano, /Togli il segno/);
  const email = String(riquadroInvio({ tipo: 'ddt', stato: 'emesso', email_inviata_il: '2026-11-04T09:15:00Z' }, { segna: '/x' }));
  assert.doesNotMatch(email, /Togli il segno|Segna come inviato/);       // l'email partita resta
  assert.match(String(riquadroInvio({ tipo: 'fattura', stato: 'emesso', origine: 'portale' })), /Non ancora inviata allo SdI/);
});

test('preventivo per email: destinatario proposto, oggetto e testo', () => {
  assert.equal(destinatarioPreventivo({ richiesta: 'rdo@cliente.it', ultimoPreventivo: 'acq@cliente.it' }), 'rdo@cliente.it');
  assert.equal(destinatarioPreventivo({ ultimoPreventivo: 'acq@cliente.it', crm: 'info@cliente.it' }), 'acq@cliente.it');
  assert.equal(destinatarioPreventivo({ crm: '', amministrazione: 'amm@cliente.it' }), 'amm@cliente.it');
  assert.equal(destinatarioPreventivo({}), '');
  const e = emailPreventivo({ numero: 'P2026-0100', data: '2026-11-04', codice: 'EA1002', descrizione: 'SCHEDA MAIN', revisione: 'B', nSchede: 50, azienda: 'Casteltech S.r.l.' });
  assert.equal(e.oggetto, 'Preventivo n. P2026-0100 - EA1002 - SCHEDA MAIN - Casteltech S.r.l.');
  assert.match(e.testo, /preventivo n\. P2026-0100 del 04\/11\/2026 per EA1002 - SCHEDA MAIN rev\. B \(50 schede\)/);
  assert.equal(emailPreventivo({ numero: '1', data: '2026-11-04', nSchede: 1, azienda: 'X', oggettoRichiesta: 'RDO 20149766' }).oggetto, 'Re: RDO 20149766');
  assert.equal(emailPreventivo({ numero: '1', data: '2026-11-04', nSchede: 1, azienda: 'X', oggettoRichiesta: 'RE: RDO' }).oggetto, 'RE: RDO');
});

const t: Tariffe = { costoAziendaH: 0, costoOperatoreProduzioneH: 60, costoOperatoreUfficioH: 60, ricarico: 1 };
const F = (codice: string, gruppo: string, euro: number, unaTantum = false): FaseDef =>
  ({ codice, nome: codice, gruppo, formulaSecondi: String(euro * 60), persone: 1, tariffa: 'produzione', unaTantum });
const V = (codice: string, gruppo: string, euro: number, unaTantum = false): VoceDef => ({ codice, nome: codice, gruppo, formulaEuro: String(euro), unaTantum });
const ris = calcolaPreventivo([F('pep', 'SMD', 100), F('onda', 'THT', 100), F('prog', 'SMD', 200, true)],
  [V('valoreAcquistoComponenti', 'MATERIALE PER PRODUZIONE', 500), V('laminaSerigrafica', 'COSTI UNA TANTUM', 110, true)], t, { nSchede: 10, parametri: {} });

test('PDF del preventivo: stesse righe e stesso totale della stampa, per tutte le versioni', async () => {
  for (const versione of ['essenziale', 'dettaglio', 'macro', 'fasi'] as const) {
    const c = contenutoStampa({ ris, nSchede: 10, doppia: false, nLamine: 1, versione, rit: leggiRitocchi({ scontoValore: '10', rigaDescrizione: 'Collaudo', rigaQuantita: '1', rigaPrezzo: '50' }), descrizione: 'SCHEDA' });
    assert.equal(c.righe[0].tipo, 'prodotto');
    assert.ok(c.righe.some(r => r.tipo === 'aggiunta') && c.righe.some(r => r.tipo === 'sconto'));
    assert.equal(c.totale, Math.round((700 + 310 + 50) * 0.9 * 100) / 100);
    const pdf = await pdfPreventivo({ numero: 'P2026-0100', data: '2026-11-04',
      azienda: { nome: 'CASTELTECH S.R.L.', indirizzo: 'X', piva: '01777320332', rea: 'PC-1', tel: '1', email: 'info@casteltech.net', pec: 'p@pec.it' },
      cliente: { ragione_sociale: 'CLIENTE Ω SRL' }, codice: 'EA1002', revisione: '0', nSchede: 10, righe: c.righe, riquadro: c.riquadro, scontato: c.scontato,
      primoLotto: c.primoLotto, totale: c.totale, note: 'Nota per il cliente', pagamento: 'Bonifico 30 gg', condizioni: versione !== 'macro', firma: true });
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  }
  assert.equal(nomeFilePdfPreventivo('P2026-0100', 'EA 1002/B'), 'Preventivo_P2026-0100_EA-1002-B.pdf');
});

test('guida: invio del preventivo e documenti inviati si trovano', () => {
  const primi = (q: string, n = 2) => cercaGuida(q).slice(0, n).map(r => r.argomento.id);
  assert.ok(primi('mandare il preventivo per email').includes('stampa-preventivo'));
  assert.ok(primi('documenti già inviati', 3).includes('documenti-inviati'));
  assert.ok(primi('segna come inviato', 3).includes('documenti-inviati'));
});
