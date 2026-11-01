/**
 * Vista "Semplice" del preventivo (proposta della revisione, Adriano 1/11/2026 "applica i suggerimenti").
 *
 * Il modulo del preventivo ha più di 130 campi; quasi tutti sono tempi standard che non si toccano mai.
 * In vista Semplice restano visibili solo i campi che cambiano davvero da una scheda all'altra (quantità e costi
 * d'acquisto); gli altri gruppi mostrano "N campi avanzati nascosti". La vista Completo mostra tutto come prima.
 * I valori nascosti NON cambiano: il calcolo usa sempre tutti i campi, visibili o no.
 * La scelta la ricorda il browser (localStorage `preventivo-vista`); al primo uso si parte da Completo.
 */
export const CAMPI_SEMPLICE: ReadonlySet<string> = new Set([
  // SMD: componenti e feeder per lato
  'qtSmd', 'qtFeeder', 'qtSmdLatoB', 'qtFeederLatoB',
  // THT: componenti, tipologie, da preparare, in giostra, punti a mano
  'qtTht', 'qtTipolTht', 'qtPthdaPreparare', 'qntCompMontaggio', 'qntPuntiSaldaturaMano',
  // gestione materiale: numero item
  'nItemMateriale', 'provenienzaMateriale',
  // completamento: lavorazioni che ci sono solo su certe schede
  'collaudo', 'componentiMeccanici', 'tempoCablaggio', 'programmazioneFlash',
  // acquisti: costi e quantità di ciò che si compra
  'costoComponentiScheda', 'costoPcbScheda', 'nLamine', 'nAttrezzaggiPcb', 'costoAttrezzaggioPcb', 'nSpedizioni',
]);

export type VistaPreventivo = 'semplice' | 'completo';

/** La vista salvata nel browser, con "completo" come riserva per valori strani. */
export function vistaPreventivo(salvata: unknown): VistaPreventivo {
  return salvata === 'semplice' ? 'semplice' : 'completo';
}

/** Quanti campi di un gruppo restano nascosti in vista Semplice. */
export function nascostiInSemplice(codiciDelGruppo: string[]): number {
  return codiciDelGruppo.filter(c => !CAMPI_SEMPLICE.has(c)).length;
}
