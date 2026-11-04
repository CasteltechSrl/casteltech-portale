import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esigibilitaDocumento, generaAutofatturaXml, generaFatturaXml } from '../src/engine/fatturapa.js';
import { alberoAttributi, applicaAttributi, attributiAutomatici, attributiDaModulo, passiChiave } from '../src/engine/attributi-fatturapa.js';
import { ALIQUOTE, AUTOFATTURA_UE, AZIENDA, CLIENTE_IT, CLIENTE_PA, FATTURA, FATTURA_PA, FATTURA_RATE, FORNITORE_UE } from '../tools/fatturapa/esempi.js';

const tag = (xml: string, nome: string) => [...xml.matchAll(new RegExp(`<${nome}>([^<]*)</${nome}>`, 'g'))].map(m => m[1]);

test('Esigibilità IVA: immediata predefinita, differita scelta, split payment solo con il cliente in split', () => {
  const base = generaFatturaXml(FATTURA_RATE, CLIENTE_IT, AZIENDA, ALIQUOTE);
  assert.deepEqual([...new Set(tag(base.xml, 'EsigibilitaIVA'))], ['I']);
  assert.equal(base.esigibilita, 'I');
  const differita = generaFatturaXml({ ...FATTURA_RATE, esigibilita_iva: 'D' }, CLIENTE_IT, AZIENDA, ALIQUOTE);
  assert.deepEqual(differita.errori, []);
  assert.deepEqual([...new Set(tag(differita.xml, 'EsigibilitaIVA'))], ['D']);
  // split scelto ma il cliente non è in split: errore (pagamento e stampa non toglierebbero l'IVA)
  assert.match(generaFatturaXml({ ...FATTURA_RATE, esigibilita_iva: 'S' }, CLIENTE_IT, AZIENDA, ALIQUOTE).errori.join(), /Split payment/);
  // cliente PA in split: S da sola; immediata scelta = errore
  assert.deepEqual([...new Set(tag(generaFatturaXml(FATTURA_PA, CLIENTE_PA, AZIENDA, ALIQUOTE).xml, 'EsigibilitaIVA'))], ['S']);
  assert.match(generaFatturaXml({ ...FATTURA_PA, esigibilita_iva: 'I' }, CLIENTE_PA, AZIENDA, ALIQUOTE).errori.join(), /split payment/);
  assert.deepEqual(esigibilitaDocumento(null, false), { esigibilita: 'I' });
  assert.deepEqual(esigibilitaDocumento('X', true), { esigibilita: 'S' });
});

test('Attributi avanzati: chiavi come nelle specifiche, valori controllati, campi calcolati non modificabili', () => {
  assert.equal(passiChiave('2.1.9.3')?.at(-1)?.nodo.nome, 'CausaleTrasporto');
  assert.equal(passiChiave('2.2.1(3).16(2).1')?.at(-1)?.nodo.nome, 'TipoDato');
  assert.equal(passiChiave('1.1.5.2')?.at(-1)?.nodo.nome, 'Email');
  assert.equal(passiChiave('2.1.1.12')?.at(-1)?.nodo.nome, 'Art73');
  assert.equal(passiChiave('2.1.9(2).3'), null);         // DatiTrasporto non si ripete
  assert.equal(passiChiave('9.1'), null);
  const r = applicaAttributi(generaFatturaXml(FATTURA_RATE, CLIENTE_IT, AZIENDA, ALIQUOTE).xml, { '2.1.1.9': '1', '2.1.9.10': '31/02/2026', '2.1.9.4': 'tre' });
  assert.equal(r.errori.length, 3);
  assert.deepEqual(attributiDaModulo({ '2.1.9.3': ' VENDITA ', '2.1.9.4': '', 'x<y': 'no' }), { '2.1.9.3': 'VENDITA' });
});

test('Attributi avanzati: si scrivono nell\'XML al posto giusto, vincono sul valore automatico, blocchi nuovi completi', () => {
  const doc = { ...FATTURA, attributi: {
    '1.1.5.2': 'amministrazione@casteltech.net',
    '2.1.9.3': 'Vendita', '2.1.9.4': '2', '2.1.9.7': '12,5', '2.1.9.10': '04/11/2026', '2.1.9.1.1.1': 'it', '2.1.9.1.1.2': '01234567890', '2.1.9.1.3.1': 'BRT SPA',
    '2.1.2(1).4': '10', '2.1.3(1).2': 'CONTRATTO 7',
    '2.2.1(1).7': '2026-10-01', '2.2.1(1).8': '31/10/2026', '2.2.1(2).16(2).1': 'COMMESSA', '2.2.1(2).16(2).2': 'C2026-0012',
  } };
  const { xml, errori } = generaFatturaXml(doc, CLIENTE_IT, AZIENDA, ALIQUOTE);
  assert.deepEqual(errori, []);
  assert.match(xml, /<CodiceDestinatario>[^<]*<\/CodiceDestinatario><ContattiTrasmittente><Email>amministrazione@casteltech.net<\/Email><\/ContattiTrasmittente>/);
  assert.match(xml, /<\/DatiDDT>(?:<DatiDDT>.*?<\/DatiDDT>)*<DatiTrasporto><DatiAnagraficiVettore><IdFiscaleIVA><IdPaese>IT<\/IdPaese><IdCodice>01234567890<\/IdCodice><\/IdFiscaleIVA><Anagrafica><Denominazione>BRT SPA<\/Denominazione><\/Anagrafica><\/DatiAnagraficiVettore><CausaleTrasporto>Vendita<\/CausaleTrasporto><NumeroColli>2<\/NumeroColli><PesoLordo>12.50<\/PesoLordo><DataInizioTrasporto>2026-11-04<\/DataInizioTrasporto><\/DatiTrasporto>/);
  // ordine già presente (1): NumItem aggiunto dopo la Data, prima del CIG; contratto nuovo dopo l'ordine
  assert.match(xml, /<DatiOrdineAcquisto><IdDocumento>[^<]+<\/IdDocumento>(<Data>[^<]+<\/Data>)?<NumItem>10<\/NumItem>/);
  assert.match(xml, /<\/DatiOrdineAcquisto><DatiContratto><IdDocumento>CONTRATTO 7<\/IdDocumento><\/DatiContratto>/);
  // riga 1: periodo dopo l'unità di misura; riga 2: secondo AltriDatiGestionali dopo quello della lettera d'intento
  assert.match(xml, /<NumeroLinea>1<\/NumeroLinea>.*?<DataInizioPeriodo>2026-10-01<\/DataInizioPeriodo><DataFinePeriodo>2026-10-31<\/DataFinePeriodo><PrezzoUnitario>/);
  assert.match(xml, /<TipoDato>INTENTO<\/TipoDato>.*?<\/AltriDatiGestionali><AltriDatiGestionali><TipoDato>COMMESSA<\/TipoDato><RiferimentoTesto>C2026-0012<\/RiferimentoTesto><\/AltriDatiGestionali><\/DettaglioLinee>/);
  // valore automatico sostituito
  const sost = generaFatturaXml({ ...FATTURA_RATE, attributi: { '2.4(1).2(1).12': 'BANCA PROVA' } }, CLIENTE_IT, AZIENDA, ALIQUOTE);
  assert.ok(tag(sost.xml, 'IstitutoFinanziario').every(v => v === 'BANCA PROVA') && tag(sost.xml, 'IstitutoFinanziario').length > 0, sost.errori.join());
  // blocco nuovo senza il campo obbligatorio
  assert.match(generaFatturaXml({ ...FATTURA, attributi: { '2.1.4(1).6': 'X1' } }, CLIENTE_IT, AZIENDA, ALIQUOTE).errori.join(), /serve anche 2\.1\.4\(1\)\.2 IdDocumento/);
  // riga che non esiste
  assert.match(generaFatturaXml({ ...FATTURA, attributi: { '2.2.1(99).7': '2026-10-01' } }, CLIENTE_IT, AZIENDA, ALIQUOTE).errori.join(), /non c'è nel documento/);
  // senza attributi l'XML resta identico
  const senza = generaFatturaXml(FATTURA, CLIENTE_IT, AZIENDA, ALIQUOTE);
  assert.equal(senza.xml, senza.xmlBase);
});

test('Attributi avanzati: valgono anche per le autofatture; elenco automatico e albero per la bozza', () => {
  const auto = generaAutofatturaXml({ ...AUTOFATTURA_UE, attributi: { '2.1.1.11': 'x', '2.2.1(1).15': 'RIF 1' } }, FORNITORE_UE, AZIENDA, ALIQUOTE);
  assert.match(auto.errori.join(), /2\.1\.1\.11.*calcolato/);
  assert.match(auto.xml, /<RiferimentoAmministrazione>RIF 1<\/RiferimentoAmministrazione><\/DettaglioLinee>/);
  const { xml } = generaFatturaXml(FATTURA, CLIENTE_IT, AZIENDA, ALIQUOTE);
  const automatici = attributiAutomatici(xml);
  assert.ok(automatici.some(a => a.chiave === '2.1.1.1' && a.nome === 'TipoDocumento'));
  assert.ok(automatici.some(a => a.chiave === '2.1.8(1).1' && a.nome === 'NumeroDDT'));
  assert.ok(automatici.some(a => /^2\.2\.2\(1\)\.7$/.test(a.chiave) || a.nome !== 'EsigibilitaIVA'));
  const albero = alberoAttributi(xml, { '2.1.3(2).2': 'C2' });
  const chiavi = albero.map(r => r.chiave);
  assert.ok(chiavi.includes('1.1.5.1') && chiavi.includes('2.1.9.3'));
  assert.ok(chiavi.includes('2.1.3(1)') && chiavi.includes('2.1.3(2)'), 'blocco salvato con indice 2 resta visibile');
  assert.ok(!chiavi.some(k => k.startsWith('2.1.8')), 'DDT: solo automatici');
  const righe = albero.filter(r => r.nome === 'DettaglioLinee');
  assert.equal(righe.length, (xml.match(/<DettaglioLinee>/g) ?? []).length);
  assert.ok(albero.find(r => r.chiave === '2.1.3(2).2')?.valore === 'C2');
});
