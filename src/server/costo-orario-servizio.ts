/**
 * Letture per Analisi → Costo orario (Adriano 12/11/2026). Regole in `engine/costo-orario.ts`.
 * Personale dalle note contabili (`costi_personale`), ore dai cedolini (`cedolini`), spese di gestione dal Punto di pareggio
 * (bilancino se c'è, altrimenti fatture ricevute con le categorie di Casteltech + stime). Letto solo all'apertura della pagina (Neon).
 */
import { q, q1 } from './db.js';
import { CATEGORIE } from '../engine/categorie-acquisti.js';
import { contoEconomico, mesiDelPeriodo, type CodiceFamiglia, type MesePortale } from '../engine/pareggio.js';
import { bilanciUfficiali, mesiDalPortale, vociCommercialista } from './pareggio-servizio.js';
import {
  CATEGORIE_ESCLUSE, costoOrarioMesi, FAMIGLIE_GESTIONE, IMPOSTAZIONI_COSTO_ORARIO, mediaDodiciMesi, tariffeProposte,
  type GestioneMese, type ImpostazioniCostoOrario, type MeseCostoOrario, type RigaCostoPersonale, type RigaOre,
} from '../engine/costo-orario.js';
import { caricaTariffe } from './catalogo-db.js';

const voce = (codice: string) => `${CATEGORIE.find(c => c.codice === codice)?.nome ?? codice} (fatture ricevute)`;
/** Voci del portale che NON sono spese di gestione: materiale rivenduto e lavorazioni rivendute (stessi nomi di `mesiDalPortale`). */
const VOCI_ESCLUSE = new Set(CATEGORIE.filter(c => CATEGORIE_ESCLUSE.includes(c.codice)).map(c => voce(c.codice)));
/** Attrezzature comprate: fuori, perché l'ammortamento (stima dal bilancio) c'è già; contarle anche qui sarebbe due volte. */
const VOCE_ATTREZZATURE = voce('attrezzature');

export async function impostazioniCostoOrario(): Promise<ImpostazioniCostoOrario> {
  const r = await q1<{ valore: Partial<ImpostazioniCostoOrario> }>(`SELECT valore FROM impostazioni WHERE chiave = 'costo_orario'`);
  return { ...IMPOSTAZIONI_COSTO_ORARIO, ...(r?.valore ?? {}) };
}
export async function salvaImpostazioniCostoOrario(v: ImpostazioniCostoOrario): Promise<void> {
  await q(`INSERT INTO impostazioni (chiave, valore) VALUES ('costo_orario', $1) ON CONFLICT (chiave) DO UPDATE SET valore = $1, aggiornato_il = now()`, [JSON.stringify(v)]);
}

/** Primo e ultimo mese con i cedolini (le ore): il periodo della pagina. */
export async function mesiConOre(): Promise<{ primo: string; ultimo: string } | null> {
  const r = await q<{ primo: string | null; ultimo: string | null }>(`SELECT min(to_char(make_date(anno, mese, 1), 'YYYY-MM')) AS primo,
      max(to_char(make_date(anno, mese, 1), 'YYYY-MM')) AS ultimo FROM cedolini WHERE mensilita = 'ordinaria'`);
  return r[0]?.primo && r[0]?.ultimo ? { primo: r[0].primo, ultimo: r[0].ultimo } : null;
}

export async function datiCostoOrario(periodo: { da: string; a: string }): Promise<{
  mesi: MeseCostoOrario[]; escluse: Record<string, number>; attrezzature: Record<string, number>;
  impostazioni: ImpostazioniCostoOrario; tariffe: Awaited<ReturnType<typeof caricaTariffe>>;
}> {
  const mesi = mesiDelPeriodo(periodo);
  const da = `${periodo.da}-01`, a = `${periodo.a}-01`;
  const [personale, ore, commercialista, portale, bilanci, tariffe] = await Promise.all([
    q<RigaCostoPersonale>(`SELECT anno, mese, qualifica, lordo::float AS lordo, contributi::float AS contributi, tfr::float AS tfr, altri::float AS altri
      FROM costi_personale WHERE make_date(anno, mese, 1) BETWEEN $1::date AND $2::date`, [da, a]),
    q<RigaOre>(`SELECT anno, mese, qualifica, mensilita, ore_lavorate::float AS ore, giorni_lavorati AS giorni, lordo::float AS lordo
      FROM cedolini WHERE make_date(anno, mese, 1) BETWEEN $1::date AND $2::date`, [da, a]),
    vociCommercialista(), mesiDalPortale(periodo), bilanciUfficiali(), caricaTariffe(),
  ]);
  const impostazioni = await impostazioniCostoOrario();
  const attrezzature: Record<string, number> = {};
  // spese di gestione mese per mese: il conto economico del solo mese, senza le voci del materiale e delle lavorazioni rivendute
  const escluse: Record<string, number> = {};
  const gestione: GestioneMese[] = mesi.map(({ anno, mese }) => {
    const k = `${anno}-${String(mese).padStart(2, '0')}`;
    const delMese: MesePortale[] = portale.filter(m => m.anno === anno && m.mese === mese).map(m => ({
      ...m, voci: m.voci.filter(v => {
        if (v.voce === VOCE_ATTREZZATURE) { attrezzature[k] = (attrezzature[k] ?? 0) + v.importo; return false; }
        if (!VOCI_ESCLUSE.has(v.voce)) return true; escluse[k] = (escluse[k] ?? 0) + v.importo; return false;
      }),
    }));
    const ce = contoEconomico({ periodo: { da: k, a: k }, commercialista, portale: delMese, bilanci });
    const famiglie: Partial<Record<CodiceFamiglia, number>> = {};
    for (const f of ce.famiglie) if (FAMIGLIE_GESTIONE.includes(f.codice)) famiglie[f.codice] = f.totale;
    return { anno, mese, famiglie, fonte: ce.mesi[0]?.fonte === 'commercialista' ? 'bilancino' : 'portale' };
  });
  const senzaCedolino = { oreMese: impostazioni.oreTitolareMese + impostazioni.oreFamiliareMese, costoMese: impostazioni.compensoFamiliareAnno / 12 };
  return { mesi: costoOrarioMesi({ mesi, personale, ore, gestione, senzaCedolino }), escluse, attrezzature, impostazioni, tariffe };
}

/** Tariffe da scrivere nei preventivi: media degli ultimi 12 mesi al mezzo euro; il ricarico resta. */
export async function scriviTariffe(): Promise<{ costoAziendaH: number; costoOperatoreProduzioneH: number; costoOperatoreUfficioH: number; ultimo: string } | null> {
  const periodo = await mesiConOre();
  if (!periodo) return null;
  const { mesi } = await datiCostoOrario({ da: periodo.primo, a: periodo.ultimo });
  const p = tariffeProposte(mediaDodiciMesi(mesi, periodo.ultimo));
  const attuali = await caricaTariffe();
  const nuove = {
    ...attuali,
    costoAziendaH: p.costoAziendaH ?? attuali.costoAziendaH,
    costoOperatoreProduzioneH: p.costoOperatoreProduzioneH ?? attuali.costoOperatoreProduzioneH,
    costoOperatoreUfficioH: p.costoOperatoreUfficioH ?? attuali.costoOperatoreUfficioH,
  };
  await q(`INSERT INTO impostazioni (chiave, valore) VALUES ('tariffe', $1) ON CONFLICT (chiave) DO UPDATE SET valore = $1, aggiornato_il = now()`, [JSON.stringify(nuove)]);
  return { costoAziendaH: nuove.costoAziendaH, costoOperatoreProduzioneH: nuove.costoOperatoreProduzioneH, costoOperatoreUfficioH: nuove.costoOperatoreUfficioH, ultimo: periodo.ultimo };
}

/**
 * Aggiornamento automatico (Adriano 12/11/2026, "in automatico ogni mese"): dopo la copia serale, se è acceso e nel portale è arrivato
 * un mese di cedolini nuovo, le tariffe dei preventivi nuovi prendono la media di oggi. Una lettura leggera al giorno, il conto solo quando cambia il mese.
 */
export async function aggiornaTariffeSeServe(): Promise<boolean> {
  const imp = await impostazioniCostoOrario();
  if (!imp.automatico) return false;
  const periodo = await mesiConOre();
  if (!periodo || periodo.ultimo === imp.ultimoMeseApplicato) return false;
  const fatto = await scriviTariffe();
  if (!fatto) return false;
  await salvaImpostazioniCostoOrario({ ...imp, ultimoMeseApplicato: fatto.ultimo });
  return true;
}
