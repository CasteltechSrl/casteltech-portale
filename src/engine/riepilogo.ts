/**
 * Riepilogo del preventivo per il riquadro in alto (Adriano, 24/10/2026). Usa solo i risultati del calcolo
 * (src/engine/calcolo.ts), senza cambiare le formule economiche.
 *  - prezzo standard a scheda (senza una tantum) e del lotto;
 *  - una tantum divisi in costi interni (pre-produzione, programmazioni: fasi una tantum) e acquisti (lamine,
 *    attrezzaggio PCB: voci una tantum);
 *  - prezzo a scheda e del lotto con le una tantum (primo lotto);
 *  - margine a scheda e del lotto (lotti successivi), margine sulle una tantum;
 *  - ore ciclo e ore uomo del lotto, con il prezzo per ora di ciclo e per ora uomo.
 */
import { r2, type Risultato } from './calcolo.js';

export interface Riepilogo {
  prezzoScheda: number; prezzoLotto: number;
  unaTantum: number; unaTantumInterni: number; unaTantumAcquisti: number;
  prezzoSchedaConUnaTantum: number; prezzoLottoConUnaTantum: number;
  margineScheda: number; margineLotto: number; margineUnaTantum: number;
  oreCicloSec: number; oreUomoSec: number; oreCicloPrimoLottoSec: number; oreUomoPrimoLottoSec: number;
  prezzoOraCiclo: number; prezzoOraUomo: number;
}

export function riepilogo(ris: Risultato): Riepilogo {
  const t = ris.totali, n = t.nSchede;
  const somma = (xs: number[]) => r2(xs.reduce((a, x) => a + x, 0));
  const fasiUT = ris.fasi.filter(f => f.unaTantum), vociUT = ris.voci.filter(v => v.unaTantum);
  const unaTantumInterni = somma(fasiUT.map(f => f.prezzo));
  const unaTantumAcquisti = somma(vociUT.map(v => v.prezzo));
  const costoUnaTantum = somma([...fasiUT.map(f => f.costo), ...vociUT.map(v => v.costo)]);
  const prezzoFasiRic = t.prezzoFasiSecondoLotto;
  return {
    prezzoScheda: t.prezzoSchedaSecondoLotto, prezzoLotto: t.totaleSecondoLotto,
    unaTantum: t.costiUnaTantum, unaTantumInterni, unaTantumAcquisti,
    prezzoSchedaConUnaTantum: t.prezzoSchedaPrimoLotto, prezzoLottoConUnaTantum: t.totalePrimoLotto,
    margineScheda: n ? r2(t.guadagnoLotto / n) : 0, margineLotto: t.guadagnoLotto,
    margineUnaTantum: r2(t.costiUnaTantum - costoUnaTantum),
    oreCicloSec: t.secondiCicloSecondoLotto, oreUomoSec: t.secondiUomoSecondoLotto,
    oreCicloPrimoLottoSec: t.secondiCicloPrimoLotto, oreUomoPrimoLottoSec: t.secondiUomoPrimoLotto,
    prezzoOraCiclo: t.prezzoOrarioMedio,
    prezzoOraUomo: t.secondiUomoSecondoLotto ? r2(prezzoFasiRic / (t.secondiUomoSecondoLotto / 3600)) : 0,
  };
}
