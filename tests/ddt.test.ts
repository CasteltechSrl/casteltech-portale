import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controlliDdt, indirizzoSu, righeDdtDaOrdine, trasportoDaModulo, CAUSALI_NON_DA_FATTURARE, SQL_CAUSALE_DA_FATTURARE, causaleDaFatturare } from '../src/engine/ddt.js';
import { righeDaModulo } from '../src/engine/documenti.js';

test('DDT: trasporto dal modulo in MAIUSCOLO, campi vuoti tolti, corriere scritto in "a cura" = vettore', () => {
  assert.deepEqual(trasportoDaModulo({ causale_trasporto: ' reso lavorato ', a_cura: 'mittente', colli: '2', peso: '', destinazione: 'via roma 1\r\ncremona' }),
    { causale: 'RESO LAVORATO', a_cura: 'MITTENTE', colli: '2', destinazione: 'VIA ROMA 1\nCREMONA' });
  assert.deepEqual(trasportoDaModulo({ causale_trasporto: 'VENDITA', a_cura: 'BRT' }), { causale: 'VENDITA', a_cura: 'VETTORE', trasportatore: 'BRT' });
  assert.equal(trasportoDaModulo({ inizio: 'domani' }).inizio, undefined);
  assert.equal(trasportoDaModulo({ inizio: '2026-11-02T09:30' }).inizio, '2026-11-02T09:30');
});

test('DDT: si emette solo con destinatario, righe con quantità, causale e trasporto a cura', () => {
  const base = { cliente_id: 1, data: '2026-11-02', trasporto: { causale: 'RESO LAVORATO', a_cura: 'MITTENTE', colli: '1' } };
  const riga = { solo_descrizione: false, descrizione: 'SCHEDA', quantita: 10 };
  assert.deepEqual(controlliDdt(base, [riga]), { errori: [], avvisi: [] });
  assert.equal(controlliDdt({ ...base, cliente_id: null }, [riga]).errori.length, 1);
  assert.match(controlliDdt(base, [{ ...riga, solo_descrizione: true }]).errori[0], /righe di merce/);
  assert.match(controlliDdt(base, [{ ...riga, quantita: 0 }]).errori[0], /maggiore di 0/);
  assert.match(controlliDdt({ ...base, trasporto: { a_cura: 'MITTENTE' } }, [riga]).errori[0], /causale/);
  assert.match(controlliDdt({ ...base, trasporto: { causale: 'VENDITA', a_cura: 'VETTORE' } }, [riga]).errori[0], /corriere/);
  const senzaColli = controlliDdt({ ...base, trasporto: { causale: 'VENDITA', a_cura: 'MITTENTE', inizio: '2026-11-01T08:00' } }, [riga]);
  assert.deepEqual(senzaColli.errori, []);
  assert.equal(senzaColli.avvisi.length, 2);
});

test('DDT da ordine: solo schede con quantità ancora da spedire, collegate alla riga d\'ordine', () => {
  const righe = righeDdtDaOrdine([
    { id: 1, tipo: 'scheda', codice: 'ea1002', descrizione: 'scheda madre', prodottoId: 5, prezzo: 12.5, residuoQuantita: 40, stato: 'parziale' },
    { id: 2, tipo: 'scheda', codice: 'X', descrizione: 'già spedita', prodottoId: null, prezzo: 1, residuoQuantita: 0, stato: 'evaso' },
    { id: 3, tipo: 'servizio', codice: null, descrizione: 'programmazione attrezzature', prodottoId: null, prezzo: 200, residuoQuantita: 1, stato: 'da_evadere' },
  ]);
  assert.deepEqual(righe, [{ posizione: 1, codice: 'EA1002', descrizione: 'SCHEDA MADRE', quantita: 40, um: 'PZ', prezzo: 12.5, prodotto_id: 5, riga_ordine_id: 1 }]);
});

test('Righe del modulo: il collegamento alla riga d\'ordine resta dopo il salvataggio', () => {
  const { righe } = righeDaModulo([{ descrizione: 'SCHEDA', quantita: '10', riga_ordine_id: '7' }, { descrizione: 'NOTA', solo_descrizione: 'on' }]);
  assert.equal(righe[0].riga_ordine_id, 7);
  assert.equal(righe[1].riga_ordine_id, null);
});

test('Indirizzo su più righe; la nazione solo se estera', () => {
  assert.equal(indirizzoSu({ indirizzo: 'STRADA FIORENZUOLA, 8', cap: '29014', comune: "CASTELL'ARQUATO", provincia: 'PC', nazione: 'IT' }),
    "STRADA FIORENZUOLA, 8\n29014 CASTELL'ARQUATO (PC)");
  assert.equal(indirizzoSu({ indirizzo: 'RUE 1', comune: 'PARIS', nazione: 'FR' }), 'RUE 1\nPARIS\nFR');
});

test('DDT da fatturare: vendita e reso lavorato sì; resi non lavorati, garanzie, conto visione, conto lavorazione, campioni no', () => {
  for (const c of ['VENDITA', 'RESO LAVORATO', 'Reso lavorato', 'Sale', 'Vente de biens', '', null, undefined, 'Completamento Fornitura', 'RESO RIPARATO'])
    assert.equal(causaleDaFatturare(c), true, String(c));
  for (const c of ['RESO NON LAVORATO', 'Returned unworked', 'RIPARAZIONE IN GARANZIA', 'reso riparato in garanzia', 'WARRANTY REPAIR', 'CONTO VISIONE',
    'Resp conto visione', 'CONTO LAVORAZIONE', 'IN CONTO LAVORO', 'C/LAVORAZIONE', 'Conto prova', 'CAMPIONI GRATUITI', "RESO DI PRESTITO D'USO",
    'SOSTITUZIONE SCHEDE', 'C/RIPARAZIONE'])
    assert.equal(causaleDaFatturare(c), false, c);
  // la condizione SQL usa la stessa espressione
  assert.ok(SQL_CAUSALE_DA_FATTURARE.includes(CAUSALI_NON_DA_FATTURARE));
});
