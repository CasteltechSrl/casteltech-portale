/**
 * Catalogo del VECCHIO portale (portalepreventivicasteltech.ovh), riscritto come dati.
 * Serve a due cose:
 *  1. dimostrare che il nuovo motore dà gli stessi totali del vecchio (tools/verifica-legacy.ts);
 *  2. importare i vecchi preventivi nel nuovo database.
 *
 * Le formule sono copiate da controller/preventivi.js (funzione calcolaPreventivo) del vecchio codice.
 * Nota storica: il vecchio portale contava 2 operatori solo su "Montaggio SMD TOP" e "Saldatura ad onda"
 * (non su "Montaggio SMD BOT").
 */
import type { FaseDef, VoceDef, Tariffe, InputPreventivo } from '../engine/calcolo.js';

const F = (codice: string, nome: string, gruppo: string, formulaSecondi: string, persone = 1): FaseDef =>
  ({ codice, nome, gruppo, formulaSecondi, persone, tariffa: 'produzione', unaTantum: false });

export const FASI_LEGACY: FaseDef[] = [
  F('controlloMaterialeSmd', 'Controllo materiale SMD', 'SMD', 'qtFeeder * tempoContMateriale + qtFeederLatoB * tempoContMaterialeLatoB'),
  F('equipaggiamentoSerig', 'Equipaggiamento serigrafia TOP', 'SMD', 'tempoAttrezSerigrafia * 60'),
  F('equipaggiamentoPeP', 'Equipaggiamento P&P TOP', 'SMD', 'tempoAttrezPeP * 60 * qtFeeder'),
  F('avvioProduzione', 'Avvio produzione TOP', 'SMD', 'tempoAvvioProduzione * 60'),
  F('serigrafia', 'Serigrafia TOP', 'SMD', 'tempoSerigrafia * nPCB'),
  F('montaggioSmd', 'Montaggio SMD TOP', 'SMD', 'qtSmd / (pepChipH / 3600) * nSchede', 2),
  F('smontaggioPeP', 'Smontaggio P&P TOP', 'SMD', 'tempoSmontaggio * 60 * qtFeeder'),
  F('revisioneAoi', 'Revisione / AOI TOP', 'SMD', 'tempoRevisioneAoi * nSchede'),
  F('equipaggiamentoSerigB', 'Equipaggiamento serigrafia BOT', 'SMD', 'tempoAttrezSerigrafiaLatoB * 60'),
  F('equipaggiamentoPePB', 'Equipaggiamento P&P BOT', 'SMD', 'tempoAttrezPePLatoB * 60 * qtFeederLatoB'),
  F('avvioProduzioneLatoB', 'Avvio produzione BOT', 'SMD', 'tempoAvvioProduzioneLatoB * 60'),
  F('serigrafiaLatoB', 'Serigrafia BOT', 'SMD', 'tempoSerigrafiaLatoB * nPCB'),
  F('montaggioSmdLatoB', 'Montaggio SMD BOT', 'SMD', 'qtSmdLatoB / (pepChipHLatoB / 3600) * nSchede'),
  F('smontaggioPePLatoB', 'Smontaggio P&P BOT', 'SMD', 'tempoSmontaggioLatoB * 60 * qtFeederLatoB'),
  F('revisioneAoiLatoB', 'Revisione / AOI BOT', 'SMD', 'tempoRevisioneAoiLatoB * nSchede'),
  F('controlloMaterialeTHT', 'Controllo materiale THT', 'THT', 'tempoControlloMateriale * qtTipolTht'),
  F('preparazioneComponenti', 'Preparazione componenti', 'THT', 'tempoDiPrepTht * qtPthdaPreparare * nSchede'),
  F('rivettatura', 'Rivettatura', 'THT', 'rivettatura * nSchede'),
  F('giostra', 'Giostra', 'THT', 'tempoMontaggioTht * qntCompMontaggio * nSchede'),
  F('protezioni', 'Protezioni', 'THT', 'tempoProtezione * nSchede'),
  F('saldaturaAdOnda', 'Saldatura ad onda', 'THT', 'tempoSaldaturaOnda * nPCB', 2),
  F('saldaturaAMano', 'Saldatura a mano', 'THT', 'qntPuntiSaldaturaMano * tempoSaldaturaaMano * nSchede'),
  F('revisione', 'Revisione', 'THT', 'tempoDiRevisione * nSchede'),
  F('separazioneSchede', 'Separazione schede', 'THT', 'tempoSeparazioneSchede * nSchede'),
  F('collaudo', 'Collaudo', 'COLLAUDO', 'collaudo * nSchede'),
  F('modifica', 'Modifiche', 'COMPLETAMENTO', 'modifica * nSchede'),
  F('montaggioComponentiMec', 'Montaggio componenti meccanici', 'COMPLETAMENTO', 'componentiMeccanici * nSchede'),
  F('targhetta', 'Applicazione targhetta', 'COMPLETAMENTO', 'targhette * nSchede'),
  F('tropicalizzazione', 'Tropicalizzazione/Resinatura', 'COMPLETAMENTO', 'tropicalizzazione * nSchede'),
  F('programmazioneFlash', 'Programmazione prodotti', 'COMPLETAMENTO', 'programmazioneFlash * nSchede'),
  F('imballaggio', 'Imballaggio', 'IMBALLAGGIO', 'tempoDiImballaggio * nSchede'),
  // Costi una tantum a tempo: il vecchio portale salvava direttamente l'importo (ore × costo orario × 2 se TOP+BOT).
  // Qui lo ritrasformiamo in tempo, così passa dalle stesse regole delle altre fasi.
  ...(['ProgPeP', 'ProgAOI', 'ProgArmadi', 'ProgSerigrafia', 'PrepDoc'] as const).map((k, i): FaseDef => ({
    codice: 'ut' + k,
    nome: ['Programmazione P&P', 'Programmazione AOI', 'Programmazione Armadi', 'Programmazione serigrafia', 'Preparazione documentazione'][i],
    gruppo: 'COSTI UNA TANTUM',
    formulaSecondi: `costo${k} * 3600 / (costoAzienda + costoOperatore)`,
    persone: 1, tariffa: 'produzione', unaTantum: true,
  })),
];

const V = (codice: string, nome: string, gruppo: string, unaTantum = false): VoceDef =>
  ({ codice, nome, gruppo, formulaEuro: 'costo_' + codice, unaTantum });

export const VOCI_LEGACY: VoceDef[] = [
  V('spedizione', 'Spedizione', 'SPEDIZIONE'),
  V('materialeDiConsumo', 'Materiale di consumo', 'MATERIALE DI CONSUMO'),
  V('laminaSerigrafica', 'Lamina serigrafica', 'COSTI UNA TANTUM', true),
  V('attrezzaggioPCB', 'Attrezzaggio PCB', 'COSTI UNA TANTUM', true),
  V('valoreAcquistoComponenti', 'Valore acquisto componenti a PCB', 'MATERIALE PER PRODUZIONE'),
  V('valoreAcquistoPCB', 'Valore acquisto PCB', 'MATERIALE PER PRODUZIONE'),
];

/** Converte un documento MongoDB del vecchio portale nell'input del nuovo motore. */
export function daDocumentoLegacy(doc: any): { tariffe: Tariffe; input: InputPreventivo } {
  const c = doc.costi ?? {};
  const tariffe: Tariffe = {
    ricarico: c.ricarico?.CustomCost?.costo ?? 0,
    costoAziendaH: c.costoOrarioAzienda?.CustomCost?.costo ?? 0,
    costoOperatoreProduzioneH: c.costoMedioOperatore?.CustomCost?.costo ?? 0,
    costoOperatoreUfficioH: c.costoMedioOperatore?.CustomCost?.costo ?? 0,
  };
  const ut = doc.costiUnaTantum ?? {};
  const cd = (o: any) => o?.CustomData?.costi;
  const parametri: Record<string, number | null | undefined> = {
    ...doc.smd, ...doc.tht, ...doc.completamento, ...doc.collaudo,
    tempoDiImballaggio: doc.imballaggio?.tempoDiImballaggio,
    nPCB: doc.pcb?.nPCB,
    costoAzienda: tariffe.costoAziendaH,
    costoOperatore: tariffe.costoOperatoreProduzioneH,
    costoProgPeP: cd(ut.programmaPick),
    costoProgAOI: cd(ut.programmaAOI),
    costoProgArmadi: cd(ut.programmaArmadi),
    costoProgSerigrafia: cd(ut.programmaSerigrafia),
    costoPrepDoc: cd(ut.preparazioneDocne),
    costo_spedizione: cd(doc.spedizione?.spedizione),
    costo_materialeDiConsumo: doc.materialiDiConsumo?.costi,
    costo_laminaSerigrafica: cd(ut.laminaSerigrafica),
    costo_attrezzaggioPCB: cd(ut.attrezzaggioPCB),
    costo_valoreAcquistoComponenti: cd(doc.materialePerProduzione?.valoreAcquistoComponenti),
    costo_valoreAcquistoPCB: cd(doc.materialePerProduzione?.valoreAcquistoPCB),
  };
  return { tariffe, input: { nSchede: doc.pcb?.nSchede ?? 0, parametri } };
}
