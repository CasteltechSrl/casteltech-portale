/**
 * CATALOGO INIZIALE — fasi della scheda di produzione Casteltech (@@_MASTERspec_costruzione.docx).
 *
 * Questo file serve solo a riempire il database la prima volta. Dopo, fasi, parametri,
 * materiali e formule si modificano dal pannello "Impostazioni" del portale.
 *
 * Regole:
 *  - formulaSecondi = TEMPO CICLO (impegno linea/fase) dell'intero lotto, in secondi.
 *  - persone       = persone previste di default; tempo uomo = ciclo × persone.
 *  - scala         = come si riporta un tempo reale a un'altra quantità:
 *                    'fisso' (non dipende dai pezzi: attrezzaggi, programmi),
 *                    'scheda' (proporzionale alle schede), 'pannello' (proporzionale ai PCB/pannelli).
 *  - legacy        = fase del vecchio portale da cui arriva la formula (per l'import e i confronti).
 */
import type { FaseDef, VoceDef } from '../engine/calcolo.js';

export type Scala = 'fisso' | 'scheda' | 'pannello';

export interface FaseCatalogo extends FaseDef {
  numero: string;            // numero sulla scheda di produzione (A, 1T, 13, …)
  scala: Scala;
  legacy?: string[];
}

export interface ParametroDef {
  codice: string;
  etichetta: string;
  unita: string;
  gruppo: string;
  default?: number;
  suggerimento?: string;
  tipo?: 'numero' | 'si_no' | 'durata';   // durata = ore, mostrate e scritte come h:mm
}

export interface MaterialeDef { codice: string; descrizione: string; costo: number; um: string; quantita?: number }

// ───────────────────────────── PARAMETRI (dati da inserire nel preventivo) ─────────────────────────────
const P = (codice: string, etichetta: string, unita: string, gruppo: string, def?: number, suggerimento?: string, tipo?: 'si_no' | 'durata'): ParametroDef =>
  ({ codice, etichetta, unita, gruppo, default: def, suggerimento, tipo });

export const PARAMETRI: ParametroDef[] = [
  P('nPCB', 'Quantità pannelli (PCB)', 'pz', 'GENERALE', undefined, 'Calcolato: schede ÷ schede per pannello'),
  // Informazioni generali (Adriano, 24/10/2026): spunte che decidono quali sezioni, fasi e costi contano
  P('campionatura', 'Campionatura', '', 'INFORMAZIONI GENERALI', 0, 'Campionatura: il ricarico passa al 35%', 'si_no'),
  P('variazioneQuantita', 'Variazione quantità', '', 'INFORMAZIONI GENERALI', 0, 'Stesso prodotto già prodotto, cambia solo la quantità (niente 1ª produzione)', 'si_no'),
  P('primaProduzione', '1ª produzione', '', 'INFORMAZIONI GENERALI', 0, 'Prima produzione: si contano le programmazioni (SMD e/o saldatrice ad onda)', 'si_no'),
  P('presenteSmd', 'TOP', '', 'INFORMAZIONI GENERALI', 1, 'Componenti SMD sul lato TOP', 'si_no'),
  // Solo TOP (0) oppure TOP + BOT (1): raddoppia i tempi "per lato" e le lamine, abilita le fasi BOT
  P('doppiaFaccia', 'BOT', '', 'INFORMAZIONI GENERALI', 0, 'SMD anche sul lato BOT: raddoppiano programmazioni a lato e lamine, si attivano le fasi BOT', 'si_no'),
  P('usaOnda', 'THT saldatura ad onda', '', 'INFORMAZIONI GENERALI', 0, 'THT con saldatrice ad onda: tempi, energia, carrelli e programmazione', 'si_no'),
  P('presenteTht', 'THT saldatura a mano', '', 'INFORMAZIONI GENERALI', 0, 'THT senza saldatrice: nessun costo legato alla saldatrice ad onda', 'si_no'),
  P('acquistoComponenti', 'Componenti', '', 'INFORMAZIONI GENERALI', 0, 'Acquisto componenti: tempo di acquisto e costo componenti', 'si_no'),
  P('acquistoPcb', 'PCB', '', 'INFORMAZIONI GENERALI', 0, 'Acquisto PCB: tempo di acquisto e costo PCB', 'si_no'),
  P('acquistoLamina', 'Lamina std', '', 'INFORMAZIONI GENERALI', 0, 'Lamina standard: 110 € di vendita fissi (senza ricarico), due con TOP+BOT', 'si_no'),
  P('laminaTrattamenti', 'Lamina con trattamenti', '', 'INFORMAZIONI GENERALI', 0, 'Lamina con trattamenti: 165 € di vendita fissi (senza ricarico), due con TOP+BOT', 'si_no'),
  P('etichette', 'Etichette', '', 'INFORMAZIONI GENERALI', 0, 'Etichettatura delle schede (15 s a scheda) e costo etichetta se non la fornisce il cliente', 'si_no'),
  P('puliziaSaldature', 'Pulizia saldature', '', 'INFORMAZIONI GENERALI', 0, 'Pulizia punti saldatura: 2 min a scheda + liquido 0,20 € a scheda', 'si_no'),
  P('usaSplicing', 'Splicing', '', 'INFORMAZIONI GENERALI', 0, 'Splicing: un tape extender per ogni feeder SMD (TOP e BOT)', 'si_no'),
  P('lavaggioSchede', 'Lavaggio schede', '', 'INFORMAZIONI GENERALI', 0, 'Lavaggio: 45 s a scheda + liquido 0,10 € a scheda + 5 € a lotto di energia e avvio', 'si_no'),
  // Pre-produzione (ore)
  P('oreFoglioTempi', 'Preparazione foglio tempi', 'h', 'PRE-PRODUZIONE', undefined, undefined, 'durata'),
  P('oreAnalisiBom', 'Analisi BOM e ricerca prezzi', 'h', 'PRE-PRODUZIONE', undefined, undefined, 'durata'),
  P('orePreventivo', 'Preparazione preventivo', 'h', 'PRE-PRODUZIONE', undefined, undefined, 'durata'),
  P('oreAcquistoPcb', 'Acquisto PCB', 'h', 'PRE-PRODUZIONE', undefined, undefined, 'durata'),
  P('oreAcquistoComponenti', 'Acquisto componenti', 'h', 'PRE-PRODUZIONE', undefined, undefined, 'durata'),
  P('oreAcquistoLamine', 'Acquisto lamine', 'h', 'PRE-PRODUZIONE', undefined, undefined, 'durata'),
  P('orePrepDoc', 'Preparazione documentazione (per lato)', 'h', 'PRE-PRODUZIONE', undefined, undefined, 'durata'),
  P('oreAttrezzature3D', 'Disegno e stampa 3D attrezzature', 'h', 'PRE-PRODUZIONE', undefined, undefined, 'durata'),
  P('oreCheckPreProduzione', 'Check pre-produzione', 'h', 'PRE-PRODUZIONE', undefined, undefined, 'durata'),
  // Programmazioni: contano solo con "Prima produzione" (armadi solo se il materiale va a nostro magazzino)
  P('oreProgArmadi', 'Programmazione armadi (per lato)', 'h', 'PROGRAMMAZIONI', 0.25, undefined, 'durata'),
  P('oreFilePeP', 'Preparazione file P&P (per lato)', 'h', 'PROGRAMMAZIONI', 0.5, undefined, 'durata'),
  P('oreProgPeP', 'Programmazione P&P (per lato)', 'h', 'PROGRAMMAZIONI', 1, undefined, 'durata'),
  P('oreProgSerigrafia', 'Programmazione serigrafia (per lato)', 'h', 'PROGRAMMAZIONI', 0.5, undefined, 'durata'),
  P('oreProgForno', 'Programmazione profilo forno', 'h', 'PROGRAMMAZIONI', 1 / 6, undefined, 'durata'),
  P('oreProgAOI', 'Programmazione AOI (per lato)', 'h', 'PROGRAMMAZIONI', 2, undefined, 'durata'),
  P('oreProgOnda', 'Programmazione saldatrice ad onda', 'h', 'PROGRAMMAZIONI', 0.25, undefined, 'durata'),
  // Gestione materiale (Adriano, 23/10/2026). Provenienza: 1 = del cliente, da restituire a fine lavoro (non passa dal
  // magazzino); 2 = tutti gli altri casi: gestito a nostro magazzino (acquistato da noi, del cliente o misto).
  // Tutto a ogni lotto. Tempo = numero di item (codici SMD + THT + PCB + altro) × tempo standard per item.
  P('provenienzaMateriale', 'Provenienza del materiale', '', 'GESTIONE MATERIALE', 1),
  P('nItemMateriale', 'Numero item (codici SMD + THT + PCB + altro)', 'pz', 'GESTIONE MATERIALE'),
  P('tempoControlloBolla', 'Controllo bolla e materiale per item', 's', 'GESTIONE MATERIALE', 60),
  P('tempoEtichettaturaItem', 'Etichettatura per item', 's', 'GESTIONE MATERIALE', 60),
  P('tempoStoccaggioItem', 'Stoccaggio in armadio per item', 's', 'GESTIONE MATERIALE', 30),
  P('tempoEstrazioneItem', 'Estrazione da magazzino per item', 's', 'GESTIONE MATERIALE', 30),
  P('tempoPreparazioneItem', 'Preparazione per la produzione per item', 's', 'GESTIONE MATERIALE', 30),
  P('minChiusuraItem', 'Chiusura sessione, conteggio e rientro per item', 'min', 'GESTIONE MATERIALE', 2),
  // SMD lato TOP
  P('qtSmd', 'Componenti SMD TOP per scheda', 'pz', 'SMD TOP'),
  P('qtFeeder', 'Feeder TOP', 'pz', 'SMD TOP'),
  P('tempoAttrezSerigrafia', 'Attrezzaggio serigrafia', 'min', 'SMD TOP', 20, '40–60 min se campionatura'),
  P('tempoAttrezPeP', 'Attrezzaggio P&P per feeder', 'min', 'SMD TOP', 2),
  P('tempoAvvioProduzione', 'Avvio produzione + controllo 1ª scheda', 'min', 'SMD TOP', 30, 'da 30 a 120 min'),
  P('tempoSerigrafia', 'Serigrafia per pannello', 's', 'SMD TOP', 30),
  P('pepChipH', 'Velocità P&P', 'chip/h', 'SMD TOP', 6000, '3000 campionatura — 6000 iPulse — 10000 MyData'),
  P('tempoSmontaggio', 'Smontaggio P&P per feeder', 'min', 'SMD TOP', 1),
  // SMD lato BOT
  P('qtSmdLatoB', 'Componenti SMD BOT per scheda', 'pz', 'SMD BOT'),
  P('qtFeederLatoB', 'Feeder BOT', 'pz', 'SMD BOT'),
  P('tempoAttrezSerigrafiaLatoB', 'Attrezzaggio serigrafia BOT', 'min', 'SMD BOT', 20),
  P('tempoAttrezPePLatoB', 'Attrezzaggio P&P per feeder BOT', 'min', 'SMD BOT', 2),
  P('tempoAvvioProduzioneLatoB', 'Avvio produzione BOT', 'min', 'SMD BOT', 30),
  P('tempoSerigrafiaLatoB', 'Serigrafia BOT per pannello', 's', 'SMD BOT', 30),
  P('pepChipHLatoB', 'Velocità P&P BOT', 'chip/h', 'SMD BOT', 6000),
  P('tempoSmontaggioLatoB', 'Smontaggio P&P per feeder BOT', 'min', 'SMD BOT', 1),
  // Forno fuori linea (stesso forno per TOP e BOT): la prima scheda impiega il tempo di percorrenza,
  // poi ne esce una ogni "cadenza". Tempo fase = percorrenza + (pannelli − 1) × cadenza.
  P('tempoTransitoForno', 'Percorrenza forno', 's', 'FORNO', 240),
  P('cadenzaForno', 'Cadenza forno (un pannello ogni…)', 's', 'FORNO', 15),
  // AOI / riparazione
  P('tempoRevisioneAoi', 'Ispezione AOI TOP per scheda', 's', 'AOI', 60),
  P('tempoRevisioneAoiLatoB', 'Ispezione AOI BOT per scheda', 's', 'AOI', 30),
  P('tempoRiparazioneSmd', 'Riparazione SMD per scheda', 's', 'AOI', 0),
  // THT
  P('qtTht', 'Componenti THT per scheda', 'pz', 'THT'),
  P('qtTipolTht', 'Tipologie componenti THT', 'pz', 'THT'),
  P('qtPthdaPreparare', 'Componenti THT da preparare per scheda', 'pz', 'THT'),
  P('tempoDiPrepTht', 'Preparazione per componente', 's', 'THT', 4),
  P('qntCompMontaggio', 'Componenti montati in giostra per scheda', 'pz', 'THT'),
  P('tempoMontaggioTht', 'Giostra per componente', 's', 'THT', 5),
  P('tempoProtezione', 'Protezioni per scheda', 's', 'THT', 0, 'tipico 3 s'),
  P('tempoTransitoOnda', 'Percorrenza saldatrice a onda', 's', 'THT', 240),
  P('cadenzaOnda', 'Cadenza saldatrice a onda (un pannello ogni…)', 's', 'THT', 90),
  P('minPrepCarrelli', 'Preparazione carrelli saldatrice (a lotto)', 'min', 'THT', 15),
  P('qntPuntiSaldaturaMano', 'Punti di saldatura a mano per scheda', 'pz', 'THT'),
  P('tempoSaldaturaaMano', 'Saldatura a mano per punto', 's', 'THT', 10),
  P('tempoDiRevisione', 'Revisione per scheda', 's', 'THT', 0, 'tipico 30 s'),
  P('tempoSeparazioneSchede', 'Separazione per scheda', 's', 'THT', 0, 'tipico 10 s'),
  // Completamento
  P('componentiMeccanici', 'Montaggio meccanico per scheda', 's', 'COMPLETAMENTO', 0),
  P('tropicalizzazione', 'Conformal coating / potting per scheda', 's', 'COMPLETAMENTO', 0),
  P('tempoLavaggio', 'Lavaggio per scheda', 's', 'COMPLETAMENTO', 45),
  P('costoLiquidoLavaggio', 'Liquido lavaggio per scheda', '€', 'COMPLETAMENTO', 0.1),
  P('costoAvvioLavaggio', 'Energia e avvio lavaggio (a lotto)', '€', 'COMPLETAMENTO', 5),
  P('tempoPulizia', 'Pulizia punti saldatura per scheda', 's', 'COMPLETAMENTO', 120),
  P('costoLiquidoPulizia', 'Liquido pulizia saldature per scheda', '€', 'COMPLETAMENTO', 0.2),
  P('tempoCablaggio', 'Cablaggio per scheda', 's', 'COMPLETAMENTO', 0),
  P('tempoTagliaSpela', 'Taglia e spela fili per scheda', 's', 'COMPLETAMENTO', 0),
  P('programmazioneFlash', 'Caricamento firmware per scheda', 's', 'COMPLETAMENTO', 0),
  P('collaudo', 'Test elettrico/funzionale per scheda', 's', 'COMPLETAMENTO', 0),
  P('tempoRiparazione', 'Riparazione per scheda', 's', 'COMPLETAMENTO', 0),
  P('targhette', 'Etichettatura per scheda', 's', 'COMPLETAMENTO', 15, '5 s a etichetta × n° etichette'),
  P('costoEtichetta', 'Costo etichette per scheda', '€', 'COMPLETAMENTO', 0, 'Solo se il cliente non le fornisce'),
  P('tempoPressfit', 'Pressfit per scheda', 's', 'COMPLETAMENTO', 0),
  P('rivettatura', 'Rivettatura per scheda', 's', 'COMPLETAMENTO', 0, '12 s a rivetto'),
  P('tempoPartiElettroniche', 'Montaggio parti elettroniche per scheda', 's', 'COMPLETAMENTO', 0),
  P('modifica', 'Modifiche varie per scheda', 's', 'COMPLETAMENTO', 0),
  // preparazione: montare le scatole e preparare le buste, in base a quante se ne usano (cartoni e buste qui sotto)
  P('minPrepScatola', 'Preparazione per scatola', 'min', 'IMBALLAGGIO', 1),
  P('secPrepBusta', 'Preparazione per busta', 's', 'IMBALLAGGIO', 10),
  P('tempoDiImballaggio', 'Imballaggio per scheda', 's', 'IMBALLAGGIO', 15),
  P('minResoMateriale', 'Reso materiale avanzato al cliente (a lotto)', 'min', 'IMBALLAGGIO', 10, 'Solo con materiale del cliente da restituire'),
  // Materiali di consumo (quantità)
  P('crema', 'Pasta saldante per scheda', 'gr', 'MATERIALE DI CONSUMO', 0, '0,6–1,5–2,6 gr (0,0034 gr/comp.; 500 comp. ≈ 1,5 gr/scheda)'),
  P('stagno', 'Stagno saldatrice per scheda', 'reofori', 'MATERIALE DI CONSUMO', 0, '0,45 gr/comp — 0,016 gr/foro'),
  P('stagnoPerSaldature', 'Stagno saldatrice per scheda', 'gr', 'MATERIALE DI CONSUMO', 0),
  P('scorieSaldatrice', 'Scorie stagno saldatrice', '%', 'MATERIALE DI CONSUMO', 20, 'Si aggiungono allo stagno della saldatrice (reofori e peso)'),
  P('stagnoInFilo', 'Stagno in filo per scheda', 'gr', 'MATERIALE DI CONSUMO', 0, '0,125 gr a pin'),
  P('rivetto', 'Rivetti per scheda', 'pz', 'MATERIALE DI CONSUMO', 0),
  P('kaptonInNastro', 'Kapton nastro per scheda', 'cm', 'MATERIALE DI CONSUMO', 0),
  P('bolliniKapton', 'Bollini kapton per scheda', 'pz', 'MATERIALE DI CONSUMO', 0),
  P('spellicolabile', 'Spellicolabile per scheda', 'gr', 'MATERIALE DI CONSUMO', 0),
  P('splicing', 'Giunzioni splicing (totali)', 'pz', 'MATERIALE DI CONSUMO', 0),
  P('tropicalizzante', 'Bombolette tropicalizzante (totali)', 'pz', 'MATERIALE DI CONSUMO', 0),
  P('pastaTermoconduttiva', 'Pasta termoconduttiva per scheda', 'gr', 'MATERIALE DI CONSUMO', 0, '1 gr, 2 gr per componenti grandi'),
  P('viteria', 'Viteria per scheda', '€', 'MATERIALE DI CONSUMO', 0, 'M4x16 + rondella + spaccata = 0,07 €'),
  P('altriCosti', 'Altri costi per scheda', '€', 'MATERIALE DI CONSUMO', 0),
  P('buste', 'Buste ESD (totali)', 'pz', 'IMBALLAGGIO', 0),
  P('cartoni', 'Cartoni (totali)', 'pz', 'IMBALLAGGIO', 0),
  // Acquisti e una tantum
  P('nLamine', 'Lamine serigrafiche', 'pz', 'ACQUISTI', undefined, 'Vuoto = una per lato'),
  P('prezzoLamina', 'Costo lamina std', '€', 'ACQUISTI', 75),
  P('prezzoVenditaLamina', 'Prezzo vendita lamina std', '€', 'ACQUISTI', 110, 'Fisso, già ricaricato'),
  P('costoLaminaTrattata', 'Costo lamina con trattamenti', '€', 'ACQUISTI', 110, 'Vuoto = come il prezzo di vendita'),
  P('prezzoVenditaLaminaTrattata', 'Prezzo vendita lamina con trattamenti', '€', 'ACQUISTI', 165, 'Fisso, già ricaricato'),
  P('nAttrezzaggiPcb', 'Attrezzature PCB', 'pz', 'ACQUISTI', 0),
  P('costoAttrezzaggioPcb', 'Costo attrezzatura PCB', '€', 'ACQUISTI', 0),
  P('costoComponentiScheda', 'Costo componenti per scheda', '€', 'ACQUISTI', 0),
  P('costoPcbScheda', 'Costo PCB per scheda', '€', 'ACQUISTI', 0),
  P('nSpedizioni', 'Spedizioni', 'pz', 'ACQUISTI', 0),
  // Energia (forno e saldatrice a onda)
  P('preriscaldamentoForno', 'Preriscaldamento forno (fisso a lotto)', '€', 'ENERGIA', 6),
  P('potenzaFornoKw', 'Consumo forno a regime', 'kW', 'ENERGIA', 15, '15–20 kW a regime'),
  P('preriscaldamentoOnda', 'Preriscaldamento saldatrice a onda (fisso a lotto)', '€', 'ENERGIA', 10, 'Accensione divisa tra più prodotti'),
  P('potenzaOndaKw', 'Consumo saldatrice a onda a regime', 'kW', 'ENERGIA', 15, '15–20 kW a regime'),
  P('prezzoKwh', 'Prezzo energia', '€/kWh', 'ENERGIA', 0.4),
  P('costoSpedizione', 'Costo per spedizione', '€', 'ACQUISTI', 0),
];

// ───────────────────────────── MATERIALI (prezzi, modificabili) ─────────────────────────────
// Prezzi dall'ultimo preventivo salvato sul vecchio portale. Nelle formule: prezzo_<codice>, qta_<codice>.
export const MATERIALI: MaterialeDef[] = [
  { codice: 'busteEsd', descrizione: 'Buste ESD', costo: 0.1, um: 'pz' },
  { codice: 'cremaLF', descrizione: 'Pasta saldante', costo: 0.15, um: 'gr' },
  { codice: 'stagnoSaldatriceLF', descrizione: 'Stagno saldatrice', costo: 0.06, um: 'gr' },
  { codice: 'kaptonBollini10', descrizione: 'Kapton bollini Ø10 mm', costo: 0.01776, um: 'pz' },
  { codice: 'kaptonBollini6', descrizione: 'Kapton bollini Ø6 mm', costo: 0.01405, um: 'pz' },
  { codice: 'kaptonNastro', descrizione: 'Kapton nastro', costo: 0.0014, um: 'cm' },
  { codice: 'rivetto', descrizione: 'Rivetto', costo: 0.038, um: 'pz' },
  { codice: 'scatolone', descrizione: 'Scatolone', costo: 4, um: 'pz' },
  { codice: 'spellicolabile', descrizione: 'Spellicolabile', costo: 0.042, um: 'gr' },
  { codice: 'stagnoLF', descrizione: 'Stagno saldatrice (a reoforo)', costo: 0.06, um: 'gr', quantita: 0.02 },
  { codice: 'stagnoFilo', descrizione: 'Stagno in filo per saldatura a mano', costo: 0.13, um: 'gr' },
  { codice: 'tropicalizzante', descrizione: 'Tropicalizzante', costo: 35, um: 'ml', quantita: 400 },
  { codice: 'etichettaSplicing', descrizione: 'Etichetta splicing', costo: 0.05, um: 'pz' },
  { codice: 'clipsSplicing', descrizione: 'Clips splicing', costo: 0.0175, um: 'pz' },
  { codice: 'pastaTermo', descrizione: 'Pasta termoconduttiva', costo: 0.2, um: 'gr' },
  { codice: 'tapeExtender', descrizione: 'Tape extender', costo: 0.3, um: 'pz' },
];

// ───────────────────────────── FASI ─────────────────────────────
type T = 'produzione' | 'ufficio';
const F = (numero: string, codice: string, nome: string, gruppo: string, formulaSecondi: string,
  o: { persone?: number; tariffa?: T; unaTantum?: boolean; scala: Scala; legacy?: string[] }): FaseCatalogo =>
  ({ numero, codice, nome, gruppo, formulaSecondi, persone: o.persone ?? 1, tariffa: o.tariffa ?? 'produzione',
     unaTantum: o.unaTantum ?? false, scala: o.scala, legacy: o.legacy });

const PRE = 'PRE-PRODUZIONE';
const GM = 'GESTIONE MATERIALE';
// pre-produzione = costi una tantum di avvio produzione (indicazione di Adriano, 23/10/2026)
const uff = (_unaTantum?: boolean) => ({ tariffa: 'ufficio' as T, unaTantum: true, scala: 'fisso' as Scala });

export const FASI: FaseCatalogo[] = [
  F('A', 'foglioTempi', 'Preparazione foglio tempi', PRE, 'oreFoglioTempi * 3600', uff(false)),
  F('B', 'analisiBom', 'Analisi BOM e ricerca prezzi', PRE, 'oreAnalisiBom * 3600', uff(false)),
  F('C', 'preventivo', 'Preventivo', PRE, 'orePreventivo * 3600', uff(false)),
  F('D', 'acquistoPcb', 'Acquisto PCB', PRE, 'se(acquistoPcb, oreAcquistoPcb * 3600, 0)', uff(false)),
  F('E', 'acquistoComponenti', 'Acquisto componenti', PRE, 'se(acquistoComponenti, oreAcquistoComponenti * 3600, 0)', uff(false)),
  F('F', 'acquistoLamine', 'Acquisto lamine', PRE, 'se(acquistoLamina + laminaTrattamenti > 0, oreAcquistoLamine * 3600, 0)', uff(true)),
  F('G', 'prepDocumentazione', 'Preparazione documentazione', PRE, 'orePrepDoc * 3600 * se(doppiaFaccia, 2, 1)', { ...uff(true), legacy: ['utPrepDoc'] }),
  F('I', 'progArmadi', 'Programmazione armadi TOP e BOT', PRE, 'se(primaProduzione * (provenienzaMateriale != 1) * (qtSmd + doppiaFaccia * qtSmdLatoB) > 0, oreProgArmadi * 3600 * se(doppiaFaccia, 2, 1), 0)', { ...uff(true), legacy: ['utProgArmadi'] }),
  F('L', 'filePeP', 'Preparazione file P&P', PRE, 'se(primaProduzione * (qtSmd + doppiaFaccia * qtSmdLatoB) > 0, oreFilePeP * 3600 * se(doppiaFaccia, 2, 1), 0)', uff(true)),
  F('M', 'progPeP', 'Programmazione P&P TOP e BOT', PRE, 'se(primaProduzione * (qtSmd + doppiaFaccia * qtSmdLatoB) > 0, oreProgPeP * 3600 * se(doppiaFaccia, 2, 1), 0)', { ...uff(true), legacy: ['utProgPeP'] }),
  F('O', 'attrezzature3D', 'Disegno e stampa 3D attrezzature', PRE, 'oreAttrezzature3D * 3600', uff(true)),
  F('P', 'checkPreProduzione', 'Check pre-produzione', PRE, 'oreCheckPreProduzione * 3600', uff(false)),

  // Gestione materiale, tutto a ogni lotto. Con materiale del cliente da restituire (caso 1) niente magazzino:
  // né etichettatura, né stoccaggio, né estrazione.
  F('M1', 'controlloBollaLotto', 'Controllo bolla e materiale arrivato', GM, 'nItemMateriale * tempoControlloBolla', { scala: 'fisso', legacy: ['controlloMaterialeSmd', 'controlloMaterialeTHT'] }),
  F('M2', 'etichettaturaMateriale', 'Etichettatura materiale (software magazzino)', GM, 'se(provenienzaMateriale != 1, nItemMateriale * tempoEtichettaturaItem, 0)', { scala: 'fisso' }),
  F('M3', 'stoccaggioMateriale', 'Stoccaggio in armadio / magazzino', GM, 'se(provenienzaMateriale != 1, nItemMateriale * tempoStoccaggioItem, 0)', { scala: 'fisso' }),
  F('M4', 'estrazioneMateriale', 'Estrazione da magazzino', GM, 'se(provenienzaMateriale != 1, nItemMateriale * tempoEstrazioneItem, 0)', { scala: 'fisso' }),
  F('M5', 'preparazioneMateriale', 'Preparazione materiale per la produzione', GM, 'nItemMateriale * tempoPreparazioneItem', { scala: 'fisso' }),
  F('M6', 'chiusuraSessione', 'Chiusura sessione, conteggio e rientro avanzi', GM, 'nItemMateriale * minChiusuraItem * 60', { scala: 'fisso' }),

  F('2T', 'progSerigrafiaTop', 'Programmazione serigrafia TOP', 'SMD', 'se(primaProduzione * qtSmd > 0, oreProgSerigrafia * 3600, 0)', { unaTantum: true, scala: 'fisso', legacy: ['utProgSerigrafia'] }),
  F('3T', 'equipSerigrafiaTop', 'Equipaggiamento serigrafia TOP', 'SMD', 'se(qtSmd > 0, tempoAttrezSerigrafia * 60, 0)', { scala: 'fisso', legacy: ['equipaggiamentoSerig'] }),
  F('4T', 'equipPePTop', 'Equipaggiamento Pick&Place TOP', 'SMD', 'se(qtSmd > 0, tempoAttrezPeP * 60 * qtFeeder, 0)', { scala: 'fisso', legacy: ['equipaggiamentoPeP'] }),
  F('5T', 'avvioTop', 'Avvio produzione + controllo 1ª scheda TOP', 'SMD', 'se(qtSmd > 0, tempoAvvioProduzione * 60, 0)', { scala: 'fisso', legacy: ['avvioProduzione'] }),
  F('6T.1', 'serigrafiaTop', 'Serigrafia TOP', 'SMD', 'se(qtSmd > 0, tempoSerigrafia * nPCB, 0)', { scala: 'pannello', legacy: ['serigrafia'] }),
  F('6T.2', 'pepTop', 'Pick&Place TOP', 'SMD', 'qtSmd / (pepChipH / 3600) * nSchede', { persone: 2, scala: 'scheda', legacy: ['montaggioSmd'] }),
  F('7T', 'fornoTop', 'Forno TOP', 'SMD', 'se(qtSmd > 0, tempoTransitoForno + max(nPCB - 1, 0) * cadenzaForno, 0)', { persone: 2, scala: 'pannello' }),
  F('8T', 'smontaggioTop', 'Smontaggio macchina TOP', 'SMD', 'se(qtSmd > 0, tempoSmontaggio * 60 * qtFeeder, 0)', { scala: 'fisso', legacy: ['smontaggioPeP'] }),
  F('2B', 'progSerigrafiaBot', 'Programmazione serigrafia BOT', 'SMD', 'se(primaProduzione * doppiaFaccia * qtSmdLatoB > 0, oreProgSerigrafia * 3600, 0)', { unaTantum: true, scala: 'fisso', legacy: ['utProgSerigrafia'] }),
  F('3B', 'equipSerigrafiaBot', 'Equipaggiamento serigrafia BOT', 'SMD', 'se(doppiaFaccia * qtSmdLatoB > 0, tempoAttrezSerigrafiaLatoB * 60, 0)', { scala: 'fisso', legacy: ['equipaggiamentoSerigB'] }),
  F('4B', 'equipPePBot', 'Equipaggiamento Pick&Place BOT', 'SMD', 'se(doppiaFaccia * qtSmdLatoB > 0, tempoAttrezPePLatoB * 60 * qtFeederLatoB, 0)', { scala: 'fisso', legacy: ['equipaggiamentoPePB'] }),
  F('5B', 'avvioBot', 'Avvio produzione + controllo 1ª scheda BOT', 'SMD', 'se(doppiaFaccia * qtSmdLatoB > 0, tempoAvvioProduzioneLatoB * 60, 0)', { scala: 'fisso', legacy: ['avvioProduzioneLatoB'] }),
  F('6B.1', 'serigrafiaBot', 'Serigrafia BOT', 'SMD', 'se(doppiaFaccia * qtSmdLatoB > 0, tempoSerigrafiaLatoB * nPCB, 0)', { scala: 'pannello', legacy: ['serigrafiaLatoB'] }),
  F('6B.2', 'pepBot', 'Pick&Place BOT', 'SMD', 'se(doppiaFaccia * qtSmdLatoB > 0, qtSmdLatoB / (pepChipHLatoB / 3600) * nSchede, 0)', { persone: 2, scala: 'scheda', legacy: ['montaggioSmdLatoB'] }),
  F('7B', 'fornoBot', 'Forno BOT', 'SMD', 'se(doppiaFaccia * qtSmdLatoB > 0, tempoTransitoForno + max(nPCB - 1, 0) * cadenzaForno, 0)', { persone: 2, scala: 'pannello' }),
  F('8B', 'smontaggioBot', 'Smontaggio macchina BOT', 'SMD', 'se(doppiaFaccia * qtSmdLatoB > 0, tempoSmontaggioLatoB * 60 * qtFeederLatoB, 0)', { scala: 'fisso', legacy: ['smontaggioPePLatoB'] }),
  F('9', 'progAOI', 'Programmazione AOI TOP e BOT', 'SMD', 'se(primaProduzione * (qtSmd + doppiaFaccia * qtSmdLatoB) > 0, oreProgAOI * 3600 * se(doppiaFaccia, 2, 1), 0)', { unaTantum: true, scala: 'fisso', legacy: ['utProgAOI'] }),
  F('9F', 'progForno', 'Programmazione profilo forno', 'SMD', 'se(primaProduzione * (qtSmd + doppiaFaccia * qtSmdLatoB) > 0, oreProgForno * 3600, 0)', { unaTantum: true, scala: 'fisso' }),
  F('10', 'ispezioneAOI', 'Ispezione ottica / test AOI', 'SMD', '(se(qtSmd > 0, tempoRevisioneAoi, 0) + se(doppiaFaccia * qtSmdLatoB > 0, tempoRevisioneAoiLatoB, 0)) * nSchede', { scala: 'scheda', legacy: ['revisioneAoi', 'revisioneAoiLatoB'] }),
  F('11', 'riparazioneSmd', 'Riparazione SMD', 'SMD', 'tempoRiparazioneSmd * nSchede', { scala: 'scheda' }),

  F('14', 'preparazioneManuale', 'Preparazione manuale componenti', 'THT', 'tempoDiPrepTht * qtPthdaPreparare * nSchede', { scala: 'scheda', legacy: ['preparazioneComponenti'] }),
  F('15', 'giostra', 'Giostra', 'THT', 'tempoMontaggioTht * qntCompMontaggio * nSchede', { scala: 'scheda', legacy: ['giostra'] }),
  F('16', 'protezioni', 'Protezioni', 'THT', 'tempoProtezione * nSchede', { scala: 'scheda', legacy: ['protezioni'] }),
  F('17P', 'progOnda', 'Programmazione saldatrice ad onda', 'THT', 'se(primaProduzione * usaOnda > 0, oreProgOnda * 3600, 0)', { unaTantum: true, scala: 'fisso' }),
  F('17C', 'prepCarrelli', 'Preparazione carrelli saldatrice', 'THT', 'se(usaOnda > 0, minPrepCarrelli * 60, 0)', { scala: 'fisso' }),
  F('17', 'saldaturaOnda', 'Saldatura ad onda', 'THT', 'se(usaOnda * nPCB > 0, tempoTransitoOnda + max(nPCB - 1, 0) * cadenzaOnda, 0)', { persone: 2, scala: 'pannello', legacy: ['saldaturaAdOnda'] }),
  F('18', 'saldaturaMano', 'Saldatura a mano', 'THT', 'qntPuntiSaldaturaMano * tempoSaldaturaaMano * nSchede', { scala: 'scheda', legacy: ['saldaturaAMano'] }),
  F('19', 'revisione', 'Revisione', 'THT', 'tempoDiRevisione * nSchede', { scala: 'scheda', legacy: ['revisione'] }),
  F('20', 'separazione', 'Separazione schede', 'THT', 'tempoSeparazioneSchede * nSchede', { scala: 'scheda', legacy: ['separazioneSchede'] }),
  F('21', 'montaggioMeccanico', 'Montaggio meccanico', 'COMPLETAMENTO', 'componentiMeccanici * nSchede', { scala: 'scheda', legacy: ['montaggioComponentiMec'] }),
  F('22', 'conformalCoating', 'Conformal coating / potting', 'COMPLETAMENTO', 'tropicalizzazione * nSchede', { scala: 'scheda', legacy: ['tropicalizzazione'] }),
  F('24', 'lavaggio', 'Lavaggio schede', 'COMPLETAMENTO', 'se(lavaggioSchede, tempoLavaggio * nSchede, 0)', { scala: 'scheda' }),
  F('25', 'pulizia', 'Pulizia punti saldatura', 'COMPLETAMENTO', 'se(puliziaSaldature, tempoPulizia * nSchede, 0)', { scala: 'scheda' }),
  F('26', 'cablaggio', 'Cablaggio', 'COMPLETAMENTO', 'tempoCablaggio * nSchede', { scala: 'scheda' }),
  F('27', 'tagliaSpela', 'Taglia e spela fili', 'COMPLETAMENTO', 'tempoTagliaSpela * nSchede', { scala: 'scheda' }),
  F('28', 'firmware', 'Caricamento firmware', 'COMPLETAMENTO', 'programmazioneFlash * nSchede', { scala: 'scheda', legacy: ['programmazioneFlash'] }),
  F('29', 'test', 'Test elettrico e/o funzionale', 'COMPLETAMENTO', 'collaudo * nSchede', { scala: 'scheda', legacy: ['collaudo'] }),
  F('30', 'riparazione', 'Riparazione', 'COMPLETAMENTO', 'tempoRiparazione * nSchede', { scala: 'scheda' }),
  F('31', 'etichettatura', 'Etichettatura', 'COMPLETAMENTO', 'se(etichette, targhette * nSchede, 0)', { scala: 'scheda', legacy: ['targhetta'] }),
  F('32', 'pressfit', 'Pressfit', 'COMPLETAMENTO', 'tempoPressfit * nSchede', { scala: 'scheda' }),
  F('33', 'rivettatura', 'Rivettatura', 'COMPLETAMENTO', 'rivettatura * nSchede', { scala: 'scheda', legacy: ['rivettatura'] }),
  F('34', 'partiElettroniche', 'Montaggio parti elettroniche (es. display)', 'COMPLETAMENTO', 'tempoPartiElettroniche * nSchede', { scala: 'scheda' }),
  F('34M', 'modifiche', 'Modifiche varie', 'COMPLETAMENTO', 'modifica * nSchede', { scala: 'scheda', legacy: ['modifica'] }),
  F('35', 'prepScatole', 'Preparazione scatole e buste', 'IMBALLAGGIO', 'cartoni * minPrepScatola * 60 + buste * secPrepBusta', { scala: 'scheda' }),
  F('36', 'imballaggio', 'Imballaggio', 'IMBALLAGGIO', 'tempoDiImballaggio * nSchede', { scala: 'scheda', legacy: ['imballaggio'] }),
  F('36R', 'resoMaterialeCliente', 'Reso materiale avanzato al cliente', 'IMBALLAGGIO', 'se(provenienzaMateriale == 1, minResoMateriale * 60, 0)', { scala: 'fisso' }),
];

// ───────────────────────────── VOCI DI COSTO ─────────────────────────────
const CONSUMO = [
  'crema * prezzo_cremaLF * nSchede',
  '+ prezzo_stagnoLF * qta_stagnoLF * stagno * (1 + scorieSaldatrice / 100) * nSchede',
  '+ prezzo_stagnoSaldatriceLF * stagnoPerSaldature * (1 + scorieSaldatrice / 100) * nSchede',
  '+ prezzo_stagnoFilo * stagnoInFilo * nSchede',
  '+ rivetto * prezzo_rivetto * nSchede',
  '+ prezzo_kaptonNastro * kaptonInNastro * nSchede',
  '+ bolliniKapton * prezzo_kaptonBollini10 * nSchede',
  '+ spellicolabile * prezzo_spellicolabile * nSchede',
  '+ (prezzo_etichettaSplicing + prezzo_clipsSplicing) * splicing',
  '+ tropicalizzante * prezzo_tropicalizzante',
  '+ viteria * nSchede',
  '+ altriCosti * nSchede',
  '+ pastaTermoconduttiva * prezzo_pastaTermo * nSchede',
  '+ prezzo_scatolone * cartoni',
  '+ prezzo_busteEsd * buste',
].join(' ');

export const VOCI: VoceDef[] = [
  { codice: 'spedizione', nome: 'Spedizione', gruppo: 'SPEDIZIONE', formulaEuro: 'costoSpedizione * nSpedizioni', unaTantum: false },
  { codice: 'materialeDiConsumo', nome: 'Materiale di consumo', gruppo: 'MATERIALE DI CONSUMO', formulaEuro: CONSUMO, unaTantum: false },
  { codice: 'etichette', nome: 'Etichette', gruppo: 'MATERIALE DI CONSUMO', formulaEuro: 'se(etichette, costoEtichetta * nSchede, 0)', unaTantum: false },
  { codice: 'liquidoPulizia', nome: 'Liquido pulizia saldature', gruppo: 'MATERIALE DI CONSUMO', formulaEuro: 'se(puliziaSaldature, costoLiquidoPulizia * nSchede, 0)', unaTantum: false },
  { codice: 'tapeExtender', nome: 'Tape extender (splicing)', gruppo: 'MATERIALE DI CONSUMO', formulaEuro: 'se(usaSplicing, (qtFeeder + doppiaFaccia * qtFeederLatoB) * prezzo_tapeExtender, 0)', unaTantum: false },
  { codice: 'lavaggio', nome: 'Lavaggio (liquido, energia e avvio)', gruppo: 'MATERIALE DI CONSUMO', formulaEuro: 'se(lavaggioSchede, costoLiquidoLavaggio * nSchede + costoAvvioLavaggio, 0)', unaTantum: false },
  // lamina: prezzo di vendita fisso (110 € std, 165 € con trattamenti), il ricarico non si applica
  { codice: 'laminaSerigrafica', nome: 'Lamina serigrafica', gruppo: 'COSTI UNA TANTUM', unaTantum: true,
    formulaEuro: 'se(acquistoLamina + laminaTrattamenti > 0, se(nLamine > 0, nLamine, 1 + doppiaFaccia) * se(laminaTrattamenti, se(costoLaminaTrattata > 0, costoLaminaTrattata, prezzoVenditaLaminaTrattata), prezzoLamina), 0)',
    formulaPrezzo: 'se(acquistoLamina + laminaTrattamenti > 0, se(nLamine > 0, nLamine, 1 + doppiaFaccia) * se(laminaTrattamenti, prezzoVenditaLaminaTrattata, prezzoVenditaLamina), 0)' },
  { codice: 'attrezzaggioPCB', nome: 'Attrezzaggio PCB', gruppo: 'COSTI UNA TANTUM', formulaEuro: 'costoAttrezzaggioPcb * nAttrezzaggiPcb', unaTantum: true },
  { codice: 'valoreAcquistoComponenti', nome: 'Componenti', gruppo: 'MATERIALE PER PRODUZIONE', formulaEuro: 'se(acquistoComponenti, costoComponentiScheda * nSchede, 0)', unaTantum: false },
  { codice: 'valoreAcquistoPCB', nome: 'PCB', gruppo: 'MATERIALE PER PRODUZIONE', formulaEuro: 'se(acquistoPcb, costoPcbScheda * nSchede, 0)', unaTantum: false },
  // energia: si attiva solo se la fase ha un tempo (preriscaldamento una volta per lotto)
  { codice: 'energiaForno', nome: 'Energia forno', gruppo: 'ENERGIA', unaTantum: false,
    formulaEuro: 'se(ore_fornoTop + ore_fornoBot > 0, preriscaldamentoForno, 0) + (ore_fornoTop + ore_fornoBot) * potenzaFornoKw * prezzoKwh' },
  { codice: 'energiaOnda', nome: 'Energia saldatrice a onda', gruppo: 'ENERGIA', unaTantum: false,
    formulaEuro: 'se(ore_saldaturaOnda > 0, preriscaldamentoOnda, 0) + ore_saldaturaOnda * potenzaOndaKw * prezzoKwh' },
];
