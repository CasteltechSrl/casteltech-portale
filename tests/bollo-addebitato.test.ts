import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addebitaBollo, calcolaTotali, type Aliquota } from '../src/engine/amministrazione.js';
import { generaFatturaXml } from '../src/engine/fatturapa.js';
import { scadenzeFiscali } from '../src/engine/cruscotto-generale.js';
import { bolloPerTrimestre } from '../src/engine/fiscale.js';
import { riepilogoDocumento } from '../src/engine/registri-iva.js';
import { ALIQUOTE as ALIQUOTE_XML, AZIENDA, CLIENTE_IT, CLIENTE_UE, FATTURA, NOTA_UE } from '../tools/fatturapa/esempi.js';

// Bollo addebitato al cliente (Adriano 7/11/2026, "attivalo e addebitalo al cliente")
const ALIQUOTE: Aliquota[] = [
  { codice: 'IVA22', percentuale: 22, natura: null, soggetta_bollo: false },
  { codice: 'INTENTO', percentuale: 0, natura: 'N3.5', riferimento_normativo: 'Non imponibile art. 8 c. 1 lett. c D.P.R. 633/72', soggetta_bollo: true },
  { codice: 'ESCLUSO15', percentuale: 0, natura: 'N1', riferimento_normativo: 'Escluso art. 15 D.P.R. 633/72', soggetta_bollo: true },
];

const tag = (xml: string, nome: string) => [...xml.matchAll(new RegExp(`<${nome}>([^<]*)</${nome}>`, 'g'))].map(m => m[1]);

test('bollo addebitato: riga N1 da 2 € nel riepilogo, nell\'imponibile e nel totale', () => {
  const t = calcolaTotali([{ quantita: 1, prezzo: 100, aliquota_iva: 'INTENTO' }, { quantita: 1, prezzo: 50 }], ALIQUOTE);
  assert.equal(t.bollo, 2);
  assert.deepEqual(t.riepilogo.map(g => [g.aliquota, g.natura, g.imponibile]), [['INTENTO', 'N3.5', 100], ['IVA22', null, 50], ['ESCLUSO15', 'N1', 2]]);
  assert.equal(t.imponibile, 152);
  assert.equal(t.imposta, 11);
  assert.equal(t.totale, 163);   // 150 + 11 IVA + 2 bollo, una volta sola
  assert.equal(t.rigaBollo?.prezzo, 2);
  assert.equal(t.rigaBollo?.aliquota_iva, 'ESCLUSO15');
  // la riga del bollo non conta per la soglia: 77 € esclusi art. 15 + bollo non fanno scattare un altro bollo
  assert.equal(calcolaTotali([{ quantita: 1, prezzo: 77, aliquota_iva: 'ESCLUSO15' }], ALIQUOTE).bollo, 0);
  // stesso gruppo se in fattura ci sono già righe escluse art. 15
  const s = calcolaTotali([{ quantita: 1, prezzo: 80, aliquota_iva: 'ESCLUSO15' }], ALIQUOTE);
  assert.deepEqual(s.riepilogo.map(g => [g.aliquota, g.imponibile]), [['ESCLUSO15', 82]]);
});

test('bollo non addebitato (note di credito, acconti scalati): solo DatiBollo, il totale non cambia', () => {
  assert.equal(addebitaBollo('fattura'), true);
  assert.equal(addebitaBollo('nota_credito'), false);
  const t = calcolaTotali([{ quantita: 1, prezzo: 100, aliquota_iva: 'INTENTO' }], ALIQUOTE, 'IVA22', { addebita: false });
  assert.equal(t.bollo, 2);
  assert.equal(t.rigaBollo, null);
  assert.equal(t.totale, 100);
  assert.deepEqual(t.riepilogo.map(g => g.aliquota), ['INTENTO']);
});

test('bollo addebitato nella fattura elettronica: linea in fondo con natura N1 anche senza ESCLUSO15 in tabella', () => {
  const { xml, errori } = generaFatturaXml(FATTURA, CLIENTE_IT, AZIENDA, ALIQUOTE_XML);
  assert.deepEqual(errori, []);
  assert.match(xml, /<DatiBollo><BolloVirtuale>SI<\/BolloVirtuale><ImportoBollo>2.00<\/ImportoBollo><\/DatiBollo>/);
  assert.match(xml, /<NumeroLinea>4<\/NumeroLinea><Descrizione>Rivalsa imposta di bollo[^<]*<\/Descrizione><Quantita>1.00<\/Quantita><PrezzoUnitario>2.00<\/PrezzoUnitario><PrezzoTotale>2.00<\/PrezzoTotale><AliquotaIVA>0.00<\/AliquotaIVA><Natura>N1<\/Natura><\/DettaglioLinee>/);
  assert.match(xml, /<DatiRiepilogo><AliquotaIVA>0.00<\/AliquotaIVA><Natura>N1<\/Natura><ImponibileImporto>2.00<\/ImponibileImporto><Imposta>0.00<\/Imposta><RiferimentoNormativo>Escluso art. 15 D.P.R. 633\/72<\/RiferimentoNormativo><\/DatiRiepilogo>/);
  // somma dei riepiloghi + imposta = totale del documento (controllo dello SdI)
  const imponibili = tag(xml, 'ImponibileImporto').reduce((s, x) => s + Number(x), 0);
  const imposte = tag(xml, 'Imposta').reduce((s, x) => s + Number(x), 0);
  assert.equal(Math.round((imponibili + imposte) * 100) / 100, Number(tag(xml, 'ImportoTotaleDocumento')[0]));
  // la nota di credito UE non ha bollo né riga
  const nc = generaFatturaXml(NOTA_UE, CLIENTE_UE, AZIENDA, ALIQUOTE_XML);
  assert.doesNotMatch(nc.xml, /Rivalsa imposta di bollo/);
});

test('registri IVA: il bollo addebitato si riconosce dai totali salvati, i documenti vecchi restano senza', () => {
  const righe = [{ quantita: 1, prezzo: 200, aliquota_iva: 'INTENTO' }];
  assert.deepEqual(riepilogoDocumento({ imponibile: 202, imposta: 0, righe }, ALIQUOTE).voci.map(v => [v.natura, v.imponibile]), [['N3.5', 200], ['N1', 2]]);
  const vecchio = riepilogoDocumento({ imponibile: 200, imposta: 0, righe }, ALIQUOTE);
  assert.equal(vecchio.differenza, false);
  assert.deepEqual(vecchio.voci.map(v => v.imponibile), [200]);
});

test('cruscotto: F24 del bollo tra le scadenze, trimestri rinviati sommati in una riga', () => {
  const doc = [{ data: '2026-02-10', bollo: 2 }, { data: '2026-05-10', bollo: 2 }, { data: '2026-08-10', bollo: 2 }];
  const trimestri = bolloPerTrimestre(2026, doc, '2026-11-07').map(t => ({ ...t, anno: 2026 }));
  const voci = scadenzeFiscali('2026-11-07', 35, trimestri).filter(s => /bollo/.test(s.testo));
  // 1°+2° sotto 5.000 € → con il 3° entro il 30/11
  assert.equal(voci.length, 1);
  assert.equal(voci[0].data, '2026-11-30');
  assert.match(voci[0].testo, /1° trim\. 2026 \+ 2° trim\. 2026 \+ 3° trim\. 2026: 6,00 € \(codice 2521, 2522, 2523\)/);
  assert.equal(scadenzeFiscali('2026-10-01', 35, trimestri).filter(s => /bollo/.test(s.testo)).length, 0);
});
