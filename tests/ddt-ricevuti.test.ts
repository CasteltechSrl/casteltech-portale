import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  abbinaDdtCliente, abbinaDdtFornitore, chiaviArticolo, normalizzaDdtRicevuto, ordineCitato, riassuntoAnomalie, stessoArticolo, type RigaOrdineFornitoreAperta,
} from '../src/engine/ddt-ricevuti.js';
import { cercaGuida } from '../src/engine/guida.js';
import { MENU_GRUPPI } from '../src/server/views/layout.js';

test('ddt ricevuti: lettura dell\'IA pulita (maiuscolo, P.IVA senza segni, righe senza quantità tolte)', () => {
  const d = normalizzaDdtRicevuto({ mittente: 'Mouser Electronics, Inc.', partita_iva: 'FR 27512466913', numero: 'DDT 2026/00123', data: '05/11/2026',
    rif_ordine: 'Vs. ordine 205 del 30/10/2026', righe: [{ codice: '595-TPS54302DDCR', descrizione: 'tps54302ddcr Texas', quantita: '1.000' }, { codice: 'X', quantita: 0 }] });
  assert.equal(d.mittente, 'MOUSER ELECTRONICS, INC.');
  assert.equal(d.partitaIva, 'FR27512466913');
  assert.equal(d.numero, 'DDT 2026/00123');
  assert.equal(d.data, '2026-11-05');
  assert.deepEqual(d.righe, [{ codice: '595-TPS54302DDCR', descrizione: 'TPS54302DDCR TEXAS', quantita: 1000 }]);
});

test('ddt ricevuti: numero dell\'ordine citato (date escluse)', () => {
  assert.deepEqual(ordineCitato('Vs. ordine n. 205 del 30/10/2026'), { numero: 205, anno: 2026 });
  assert.deepEqual(ordineCitato('205/2026'), { numero: 205, anno: 2026 });
  assert.deepEqual(ordineCitato('ORD 2026/205'), { numero: 205, anno: 2026 });
  assert.deepEqual(ordineCitato('PO 205'), { numero: 205, anno: null });
  assert.equal(ordineCitato('conto lavoro'), null);
  assert.equal(ordineCitato(''), null);
});

test('ddt ricevuti: stesso articolo con codice del distributore o part number', () => {
  assert.ok(stessoArticolo(chiaviArticolo('595-TPS54302DDCR', 'TPS54302DDCR TEXAS INSTRUMENTS'), chiaviArticolo('595-TPS54302DDCR', 'TPS54302DDCR TI RIF. U1')));
  assert.ok(stessoArticolo(chiaviArticolo(null, 'TPS54302DDCR'), chiaviArticolo('595-TPS54302DDCR', 'CONVERTITORE')));   // codice Mouser finisce con il P/N
  assert.ok(stessoArticolo(chiaviArticolo('296-23466-1-ND', ''), chiaviArticolo('296234661ND', '')));
  assert.ok(!stessoArticolo(chiaviArticolo('ABC', 'VITE M3'), chiaviArticolo('XYZ', 'VITE M4')));
  assert.ok(!stessoArticolo(chiaviArticolo('1234', ''), chiaviArticolo('51234', '')));   // troppo corti per il "finisce con"
});

const aperte: RigaOrdineFornitoreAperta[] = [
  { ordineId: 10, ordine: '205/2026', fornitoreId: 7, posizione: 1, codice: '595-TPS54302DDCR', descrizione: 'TPS54302DDCR TEXAS', quantita: 1000, arrivati: 0 },
  { ordineId: 10, ordine: '205/2026', fornitoreId: 7, posizione: 2, codice: '81-GRM188R71C104KA1D', descrizione: 'GRM188R71C104KA01D MURATA', quantita: 4000, arrivati: 4000 },
  { ordineId: 11, ordine: '206/2026', fornitoreId: 7, posizione: 1, codice: '595-TPS54302DDCR', descrizione: 'TPS54302DDCR TEXAS', quantita: 500, arrivati: 0 },
  { ordineId: 11, ordine: '206/2026', fornitoreId: 7, posizione: 2, codice: '667-ERJ-3EKF1001V', descrizione: 'ERJ-3EKF1001V PANASONIC', quantita: 100, arrivati: 0 },
];

test('ddt ricevuti dal fornitore: righe abbinate all\'ordine citato, consegna parziale e pezzi in più segnalati', () => {
  const e = abbinaDdtFornitore({ rifOrdine: 'Vs. ordine 206/2026', righe: [
    { codice: '595-TPS54302DDCR', descrizione: 'TPS54302DDCR', quantita: 600 },
    { codice: 'ZZZ', descrizione: 'ARTICOLO MAI ORDINATO', quantita: 3 },
  ] }, { fornitoreId: 7, aperte });
  assert.equal(e.righe[0].ordine, '206/2026');          // l'ordine citato vince su quello più vecchio
  assert.equal(e.righe[0].attesi, 500);
  assert.match(e.righe[0].anomalia!, /arrivati 600 pezzi, ne restavano da ricevere 500/);
  assert.equal(e.righe[1].ordineId, null);
  assert.ok(e.anomalie.some(a => a.livello === 'errore' && /1 riga del DDT non corrisponde.*ZZZ/.test(a.testo)));
  assert.ok(e.anomalie.some(a => a.livello === 'avviso' && /Consegna parziale.*206\/2026.*ERJ-3EKF1001V \(100\)/.test(a.testo)));
});

test('ddt ricevuti dal fornitore: senza ordine citato vince la riga con pezzi da ricevere, già arrivata tutta = anomalia', () => {
  const e = abbinaDdtFornitore({ rifOrdine: '', righe: [
    { codice: '', descrizione: 'GRM188R71C104KA01D', quantita: 4000 },
    { codice: '', descrizione: 'TPS54302DDCR', quantita: 1000 },
  ] }, { fornitoreId: 7, aperte });
  assert.match(e.righe[0].anomalia!, /già arrivata tutta \(4\.000 su 4\.000\)/);
  assert.equal(e.righe[1].ordine, '205/2026');          // il più vecchio con pezzi da ricevere
  assert.equal(e.righe[1].anomalia, null);
  assert.equal(e.anomalie.filter(a => a.livello === 'errore').length, 0);
});

test('ddt ricevuti dal fornitore: mittente non in anagrafica, nessun ordine, ordine di un altro fornitore', () => {
  assert.match(abbinaDdtFornitore({ rifOrdine: '', righe: [] }, { fornitoreId: null, aperte: [] }).anomalie[0].testo, /anagrafica fornitori/);
  const senza = abbinaDdtFornitore({ rifOrdine: '', righe: [{ codice: 'A1', descrizione: 'X', quantita: 1 }] }, { fornitoreId: 9, aperte: [] });
  assert.match(senza.anomalie[0].testo, /senza ordine/);
  assert.equal(senza.righe[0].anomalia, 'nessun ordine');
  const altro = abbinaDdtFornitore({ rifOrdine: 'ordine 300/2026', righe: [] }, { fornitoreId: 7, aperte, altri: [{ ordineId: 50, numero: 300, anno: 2026, fornitore: 'DIGI-KEY' }] });
  assert.ok(altro.anomalie.some(a => a.livello === 'errore' && /emesso a un altro fornitore \(DIGI-KEY\)/.test(a.testo)));
  const nonTrovato = abbinaDdtFornitore({ rifOrdine: 'ordine 300/2026', righe: [] }, { fornitoreId: 7, aperte });
  assert.ok(nonTrovato.anomalie.some(a => a.livello === 'avviso' && /non è tra gli ordini emessi/.test(a.testo)));
});

test('ddt ricevuti dal fornitore: la scelta dell\'ufficio resta (anche "nessun ordine")', () => {
  const e = abbinaDdtFornitore({ rifOrdine: '', righe: [{ codice: '', descrizione: 'TPS54302DDCR', quantita: 10 }, { codice: '', descrizione: 'TPS54302DDCR', quantita: 5 }] },
    { fornitoreId: 7, aperte, scelte: [{ ordineId: 11, posizione: 1 }, null] });
  assert.equal(e.righe[0].ordine, '206/2026');
  assert.equal(e.righe[1].ordineId, null);
  assert.equal(e.righe[1].anomalia, null);
});

const ctxCliente = {
  clienteId: 3,
  componenti: [{ id: 100, codice: 'SEL-RES-10K', descrizione: 'RESISTENZA 10K' }, { id: 101, codice: 'SEL-PCB-WPA', descrizione: 'PCB WPA' }],
  prodotti: [{ id: 200, codice: 'WPAFLATRASPX6', descrizione: 'FLAT RASP' }],
  ordini: [
    { id: 1, numero: 9001, anno: 2026, rifCliente: '260', righe: [{ id: 11, codice: 'WPAFLATRASPX6', codiceCliente: null, descrizione: 'FLAT RASP', prodottoId: 200, residuo: 1050 }] },
    { id: 2, numero: 9002, anno: 2026, rifCliente: '271', righe: [{ id: 21, codice: 'ALTRO', codiceCliente: null, descrizione: 'ALTRO', prodottoId: null, residuo: 10 }] },
  ],
};

test('ddt ricevuti dal cliente: componenti e prodotti riconosciuti, ordine dal riferimento del cliente, codici sconosciuti segnalati', () => {
  const e = abbinaDdtCliente({ rifOrdine: 'Vs. rif. ns. ordine 260', righe: [
    { codice: 'SEL-RES-10K', descrizione: 'RESISTENZA', quantita: 5000 },
    { codice: '', descrizione: 'PCB WPA CODICE SEL-PCB-WPA', quantita: 1100 },
    { codice: 'WPAFLATRASPX6', descrizione: 'SCHEDE DA RILAVORARE', quantita: 20 },
    { codice: 'BOH-1', descrizione: 'MATERIALE SCONOSCIUTO', quantita: 1 },
  ] }, ctxCliente);
  assert.equal(e.ordineId, 1);
  assert.equal(e.righe[0].componenteClienteId, 100);
  assert.equal(e.righe[1].componenteClienteId, 101);            // codice del cliente dentro la descrizione
  assert.equal(e.righe[2].prodottoId, 200);
  assert.equal(e.righe[2].rigaOrdineId, 11);
  assert.match(e.righe[3].anomalia!, /non in anagrafica del cliente/);
  assert.ok(e.anomalie.some(a => a.livello === 'avviso' && /1 codice non è nell'anagrafica del cliente: BOH-1/.test(a.testo)));
  assert.equal(e.anomalie.filter(a => a.livello === 'errore').length, 0);
});

test('ddt ricevuti dal cliente: più ordini aperti senza riferimento, nessun ordine, cliente non in anagrafica', () => {
  const piu = abbinaDdtCliente({ rifOrdine: '', righe: [] }, ctxCliente);
  assert.equal(piu.ordineId, null);
  assert.ok(piu.anomalie.some(a => /2 ordini aperti/.test(a.testo)));
  const unico = abbinaDdtCliente({ rifOrdine: '', righe: [] }, { ...ctxCliente, ordini: [ctxCliente.ordini[0]] });
  assert.equal(unico.ordineId, 1);
  const nonTrovato = abbinaDdtCliente({ rifOrdine: 'ordine 999', righe: [] }, ctxCliente);
  assert.ok(nonTrovato.anomalie.some(a => /cita l'ordine «ORDINE 999»/i.test(a.testo) || /cita l'ordine «ordine 999»/.test(a.testo)));
  const senza = abbinaDdtCliente({ rifOrdine: '', righe: [] }, { ...ctxCliente, ordini: [] });
  assert.ok(senza.anomalie.some(a => a.livello === 'errore' && /non ha ordini aperti/.test(a.testo)));
  const nessuno = abbinaDdtCliente({ rifOrdine: '', righe: [] }, { ...ctxCliente, clienteId: null, ordini: [] });
  assert.match(nessuno.anomalie[0].testo, /anagrafica clienti/);
  // la scelta dell'ufficio vince: ordine 2 e riga "non in anagrafica" voluta
  const scelto = abbinaDdtCliente({ rifOrdine: '', righe: [{ codice: 'BOH-1', descrizione: 'X', quantita: 1 }] }, { ...ctxCliente, ordineScelto: 2, scelte: [''] });
  assert.equal(scelto.ordineId, 2);
  assert.equal(scelto.righe[0].anomalia, null);
  assert.equal(scelto.anomalie.length, 0);
});

test('ddt ricevuti: riassunto delle anomalie, voce nel menu Acquisti e argomento della guida', () => {
  assert.equal(riassuntoAnomalie([]), '');
  assert.equal(riassuntoAnomalie([{ livello: 'avviso', testo: 'a' }, { livello: 'errore', testo: 'b' }]), '2 anomalie (1 da sistemare)');
  assert.ok(MENU_GRUPPI.find(g => g.chiave === 'acquisti')!.voci.some(([nome, url]) => nome === 'DDT ricevuti' && url === '/acquisti/ddt'));
  assert.ok(cercaGuida('ddt ricevuto dal fornitore anomalie').some(a => a.argomento.id === 'ddt-ricevuti'));
});
