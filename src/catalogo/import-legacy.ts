/**
 * Converte un preventivo del vecchio portale nei parametri del NUOVO catalogo (src/catalogo/iniziale.ts).
 * Usato per importare i vecchi preventivi e per misurare l'effetto delle nuove regole.
 */
import { MATERIALI } from './iniziale.js';

const ore = (hms?: string | null) => {
  if (!hms) return 0;
  const [h = 0, m = 0, s = 0] = hms.split(':').map(Number);
  return h + m / 60 + s / 3600;
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const MAPPA_MATERIALI: Record<string, string> = {
  bustesd: 'busteEsd', busteesd: 'busteEsd', cremaleadfree: 'cremaLF', stagnopersaldatricelf: 'stagnoSaldatriceLF',
  kaptonbollinidi10mm: 'kaptonBollini10', kaptonbollinidi6mm: 'kaptonBollini6', kaptonnastro: 'kaptonNastro',
  rivetto: 'rivetto', scatolone: 'scatolone', spellicolabile: 'spellicolabile', stagnoleadfree: 'stagnoLF',
  stagnoinfilopersaldaturaamano: 'stagnoFilo', tropicalizzante: 'tropicalizzante', etichettasplicing: 'etichettaSplicing',
  clipssplicing: 'clipsSplicing', pastatermoconduttiva: 'pastaTermo',
};

export interface PreventivoImportato {
  cliente: string; codice: string; descrizione: string; data?: string; note?: string;
  nSchede: number; nSchedeInPCB: number;
  tariffe: { ricarico: number; costoAziendaH: number; costoOperatoreProduzioneH: number };
  parametri: Record<string, number>;
  prezziMateriali: Record<string, number>;   // prezzi salvati nel preventivo (fotografia del momento)
}

export function importaPreventivoLegacy(d: any): PreventivoImportato {
  const ut = d.costiUnaTantum ?? {};
  const u = (k: string) => ut[k]?.CustomData ?? {};
  const num = (x: any) => (x == null || x === '' || Number.isNaN(Number(x)) ? 0 : Number(x));
  const p: Record<string, number> = {};
  for (const sez of [d.smd, d.tht, d.completamento, d.collaudo, d.materialiDiConsumo, d.imballaggio]) {
    for (const [k, v] of Object.entries(sez ?? {})) if (k !== 'costi' && k !== '_id') p[k] = num(v);
  }
  p.nPCB = num(d.pcb?.nPCB);
  // onda: il vecchio portale usava "secondi × pannelli" = percorrenza + (pannelli − 1) × cadenza con entrambi uguali
  p.usaOnda = p.tempoSaldaturaOnda > 0 ? 1 : 0;
  p.tempoTransitoOnda = p.tempoSaldaturaOnda ?? 0; p.cadenzaOnda = p.tempoSaldaturaOnda ?? 0;
  delete p.tempoSaldaturaOnda;
  // TOP + BOT se c'erano componenti BOT o una programmazione segnata "BOT"
  p.doppiaFaccia = p.qtSmdLatoB > 0 || [p.botProgPeP, p.botProgAOI, p.botProgArmadi, p.botProgSerigrafia, p.botPrepDoc].some(Boolean) ? 1 : 0;
  // il vecchio portale non aveva il forno fuori linea
  p.tempoTransitoForno = 0; p.cadenzaForno = 0;
  p.oreProgPeP = ore(u('programmaPick').nOre); p.botProgPeP = u('programmaPick').bottom ? 1 : 0;
  p.oreProgAOI = ore(u('programmaAOI').nOre); p.botProgAOI = u('programmaAOI').bottom ? 1 : 0;
  p.oreProgArmadi = ore(u('programmaArmadi').nOre); p.botProgArmadi = u('programmaArmadi').bottom ? 1 : 0;
  p.oreProgSerigrafia = ore(u('programmaSerigrafia').nOre); p.botProgSerigrafia = u('programmaSerigrafia').bottom ? 1 : 0;
  p.orePrepDoc = ore(u('preparazioneDocne').nOre); p.botPrepDoc = u('preparazioneDocne').bottom ? 1 : 0;
  p.prezzoLamina = num(u('laminaSerigrafica').costoDiAcquisto); p.nLamine = num(u('laminaSerigrafica').n);
  p.costoAttrezzaggioPcb = num(u('attrezzaggioPCB').costoDiAcquisto); p.nAttrezzaggiPcb = num(u('attrezzaggioPCB').n);
  const mp = d.materialePerProduzione ?? {};
  p.costoComponentiScheda = num(mp.valoreAcquistoComponenti?.CustomData?.costoDiAcquisto);
  p.costoPcbScheda = num(mp.valoreAcquistoPCB?.CustomData?.costoDiAcquisto);
  const sp = d.spedizione?.spedizione?.CustomData ?? {};
  p.costoSpedizione = num(sp.costoDiAcquisto); p.nSpedizioni = num(sp.n);

  const prezziMateriali: Record<string, number> = Object.fromEntries(MATERIALI.map(m => [m.codice, 0]));
  for (const m of d.listaMateriali ?? []) {
    const cod = MAPPA_MATERIALI[norm(m.descrizione ?? '')];
    if (cod) {
      prezziMateriali[cod] = num(m.costo);
      if (cod === 'stagnoLF' || cod === 'tropicalizzante') p['qta_' + cod] = num(m.quantita);
    }
  }
  const c = d.costi ?? {};
  return {
    cliente: (d.cliente ?? '').trim(), codice: (d.codice ?? '').trim(), descrizione: (d.descrizione ?? '').trim(),
    data: d.data?.$date, note: d.note,
    nSchede: num(d.pcb?.nSchede), nSchedeInPCB: num(d.pcb?.nSchedeInPCB) || 1,
    tariffe: {
      ricarico: num(c.ricarico?.CustomCost?.costo),
      costoAziendaH: num(c.costoOrarioAzienda?.CustomCost?.costo),
      costoOperatoreProduzioneH: num(c.costoMedioOperatore?.CustomCost?.costo),
    },
    parametri: p, prezziMateriali,
  };
}

/** Variabili per le formule: parametri + prezzo_<materiale>. */
export function variabiliFormule(parametri: Record<string, number>, prezzi: Record<string, number>) {
  const v: Record<string, number> = { ...parametri };
  for (const [k, x] of Object.entries(prezzi)) v['prezzo_' + k] = x;
  return v;
}
