import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completaAzienda } from '../src/engine/crm-completamento.js';

const vuota = { codice: 'AZ00001', partita_iva: null, email: null, telefono: null, sito: null };
const nessuna = () => null;

test('crm completamento: si riempiono solo i campi vuoti, con la fonte nelle note', () => {
  const e = completaAzienda({ ...vuota, email: 'info@vecchia.it' },
    { codice: 'AZ00001', email: 'info@nuova.it', telefono: '+39 0523 123456', sito: 'WWW.Nuova.it/', partita_iva: 'IT 03705390981',
      fonti: { telefono: 'https://www.nuova.it/contatti', partita_iva: 'https://www.nuova.it' } }, nessuna, '01/11/2026');
  assert.deepEqual(e.campi, { partita_iva: '03705390981', telefono: '+39 0523 123456', sito: 'http://www.nuova.it' });
  assert.match(e.nota!, /^Ricerca online del 01\/11\/2026: P\.IVA da https:\/\/www\.nuova\.it; telefono da https:\/\/www\.nuova\.it\/contatti; sito da ricerca online\.$/);
});

test('crm completamento: P.IVA con cifra di controllo sbagliata o già di un\'altra azienda non entra', () => {
  const sbagliata = completaAzienda(vuota, { codice: 'AZ00001', partita_iva: '03705390982' }, nessuna, '01/11/2026');
  assert.deepEqual(sbagliata.campi, {});
  assert.match(sbagliata.nota!, /Da verificare.*non valida/);
  const altrui = completaAzienda(vuota, { codice: 'AZ00001', partita_iva: '03705390981' }, () => 'AZ00777', '01/11/2026');
  assert.deepEqual(altrui.campi, {});
  assert.deepEqual(altrui.scartati, ["P.IVA 03705390981 già dell'azienda AZ00777"]);
  // la stessa azienda che ce l'ha già non è un conflitto (e il campo pieno non si tocca)
  assert.deepEqual(completaAzienda({ ...vuota, partita_iva: '03705390981' }, { codice: 'AZ00001', partita_iva: '03705390981' }, () => 'AZ00001', 'x').scartati, []);
});

test('crm completamento: i dubbi vanno solo nelle note, i campi restano vuoti', () => {
  const e = completaAzienda(vuota, { codice: 'AZ00001', dubbi: 'sul sito ci sono due P.IVA: 03705390981, 01777320332' }, nessuna, '01/11/2026');
  assert.deepEqual(e.campi, {});
  assert.equal(e.nota, 'Da verificare (ricerca online del 01/11/2026): sul sito ci sono due P.IVA: 03705390981, 01777320332.');
  assert.equal(completaAzienda(vuota, { codice: 'AZ00001' }, nessuna, 'x').nota, null);
});
