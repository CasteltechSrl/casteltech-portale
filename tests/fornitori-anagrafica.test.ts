import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controllaPartitaIva, partitaIvaItalianaValida, preparaFornitore } from '../src/engine/anagrafica-fornitori.js';

test('P.IVA italiana: cifra di controllo', () => {
  assert.ok(partitaIvaItalianaValida('01777320332'));   // Casteltech
  assert.ok(partitaIvaItalianaValida('04106160163'));   // TME Italia
  assert.ok(!partitaIvaItalianaValida('01777320333'));
  assert.ok(!partitaIvaItalianaValida('00000000000'));
  assert.ok(!partitaIvaItalianaValida('1777320332'));
});

test('P.IVA: senza P.IVA o con un testo al posto dei numeri il fornitore non entra', () => {
  assert.match(controllaPartitaIva('', 'ITALIA').errore!, /Manca/);
  assert.match(controllaPartitaIva('ALIBABA', 'CINA').errore!, /non è una partita IVA/);
  assert.match(controllaPartitaIva('SHENZHEN', 'CINA').errore!, /non è una partita IVA/);
});

test('P.IVA: scritta uniforme (italiana senza IT, estera con il prefisso del paese)', () => {
  assert.deepEqual(controllaPartitaIva('IT 01777320332', 'ITALIA'), { partitaIva: '01777320332', errore: null });
  assert.deepEqual(controllaPartitaIva('de814584193', 'GERMANIA'), { partitaIva: 'DE814584193', errore: null });
  assert.deepEqual(controllaPartitaIva('5263167208', 'POLONIA'), { partitaIva: 'PL5263167208', errore: null });
  assert.deepEqual(controllaPartitaIva('NL826321380B01', 'REGNO UNITO'), { partitaIva: 'NL826321380B01', errore: null });
  // sede secondaria in Italia di un'azienda estera: 11 cifre con controllo italiano giusto
  assert.deepEqual(controllaPartitaIva('13397910962', 'LUSSEMBURGO'), { partitaIva: '13397910962', errore: null });
  // paesi senza formato conosciuto: bastano i numeri
  assert.equal(controllaPartitaIva('91440300MA5F', 'CINA').errore, null);
  assert.match(controllaPartitaIva('01777320333', 'ITALIA').errore!, /cifra di controllo/);
  assert.match(controllaPartitaIva('DE12345', 'GERMANIA').errore!, /formato di DE/);
});

test('fornitore: tutto in maiuscolo, email e PEC in minuscolo, paese ITALIA se manca', () => {
  const { fornitore: f, errore } = preparaFornitore({ ragione_sociale: '  tme   italia s.r.l. ', partita_iva: '04106160163', comune: 'grassobbio',
    email: ' Ordini@TME.it ', pec: 'TME@PEC.IT', iban: 'it60 x054 2811 1010 0000 0123 456', note: 'pagamento riba' });
  assert.equal(errore, null);
  assert.equal(f.ragione_sociale, 'TME ITALIA S.R.L.');
  assert.equal(f.comune, 'GRASSOBBIO');
  assert.equal(f.email, 'ordini@tme.it');
  assert.equal(f.pec, 'tme@pec.it');
  assert.equal(f.iban, 'IT60X0542811101000000123456');
  assert.equal(f.note, 'PAGAMENTO RIBA');
  assert.equal(f.paese, 'ITALIA');
  assert.equal(f.telefono, null);
  assert.match(preparaFornitore({ partita_iva: '04106160163' }).errore!, /ragione sociale/);
});
