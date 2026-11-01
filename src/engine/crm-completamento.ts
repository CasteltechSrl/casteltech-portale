/**
 * Dati mancanti del CRM cercati online (Adriano, 1/11/2026: "ricercare online i dati mancanti del database: e-mail,
 * numero di telefono, sito web, p.iva").
 * Claude prepara il file crm_completamento.json.gz (dal sito dell'azienda: pagina iniziale, contatti, privacy) e lo si carica
 * da Impostazioni → CRM. Regole:
 * - si riempiono SOLO i campi vuoti: quello che c'è già nel portale non si tocca;
 * - la P.IVA entra solo se la cifra di controllo è giusta e nessun'altra azienda del CRM ce l'ha già;
 * - ogni dato aggiunto ha la sua fonte scritta nelle note dell'azienda (sito da cui viene);
 * - i casi dubbi non riempiono i campi: vanno nelle note come "Da verificare" (e nell'Excel per Adriano).
 */
import { partitaIvaItalianaValida } from './anagrafica-fornitori.js';
import { chiavePiva, formatta } from './crm.js';

export const CAMPI_COMPLETABILI = ['partita_iva', 'email', 'telefono', 'sito'] as const;
export type CampoCompletabile = typeof CAMPI_COMPLETABILI[number];
export const NOMI_CAMPI: Record<CampoCompletabile, string> = { partita_iva: 'P.IVA', email: 'email', telefono: 'telefono', sito: 'sito' };

/** Una riga del file: i valori trovati, da dove vengono, e gli eventuali dubbi (testo per chi controlla). */
export interface PropostaCompletamento {
  codice: string; ragione_sociale?: string | null;
  partita_iva?: string | null; email?: string | null; telefono?: string | null; sito?: string | null;
  fonti?: Partial<Record<CampoCompletabile, string>>;
  dubbi?: string | null;
}

export interface AziendaAttuale { codice: string; partita_iva: string | null; email: string | null; telefono: string | null; sito: string | null }

export interface EsitoCompletamento {
  campi: Partial<Record<CampoCompletabile, string>>;  // valori da scrivere (solo campi vuoti)
  nota: string | null;                                 // riga da aggiungere alle note dell'azienda
  scartati: string[];                                  // perché un valore del file non è entrato
}

const RX_EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

/** Valore del file pulito e controllato, o il motivo per cui non va bene. */
function valoreValido(campo: CampoCompletabile, v: unknown): { valore: string } | { errore: string } | null {
  const t = formatta(campo, v);
  if (!t) return null;
  switch (campo) {
    case 'partita_iva': {
      const p = chiavePiva(t);
      return p && partitaIvaItalianaValida(p) ? { valore: p } : { errore: `P.IVA ${t} non valida` };
    }
    case 'email': return RX_EMAIL.test(t) ? { valore: t } : { errore: `email ${t} non valida` };
    case 'telefono': return t.replace(/\D/g, '').length >= 6 ? { valore: t } : { errore: `telefono ${t} non valido` };
    case 'sito': {
      const s = /^https?:\/\//.test(t) ? t : 'http://' + t;
      return /^https?:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/.test(s) ? { valore: s.replace(/\/$/, '') } : { errore: `sito ${t} non valido` };
    }
  }
}

/**
 * Cosa scrivere sull'azienda: solo i campi vuoti, con i controlli sopra.
 * `pivaDi(p)` = codice dell'azienda del CRM che ha già quella P.IVA (null se nessuna).
 */
export function completaAzienda(attuale: AziendaAttuale, p: PropostaCompletamento, pivaDi: (piva: string) => string | null, data: string): EsitoCompletamento {
  const campi: Partial<Record<CampoCompletabile, string>> = {};
  const scartati: string[] = [];
  const fonti: string[] = [];
  for (const k of CAMPI_COMPLETABILI) {
    const v = valoreValido(k, p[k]);
    if (!v) continue;
    if (attuale[k]) continue;   // c'è già: vince il portale
    if ('errore' in v) { scartati.push(v.errore); continue; }
    if (k === 'partita_iva') {
      const altra = pivaDi(v.valore);
      if (altra && altra !== attuale.codice) { scartati.push(`P.IVA ${v.valore} già dell'azienda ${altra}`); continue; }
    }
    campi[k] = v.valore;
    fonti.push(`${NOMI_CAMPI[k]} da ${p.fonti?.[k] ?? 'ricerca online'}`);
  }
  const dubbi = [formatta('note', p.dubbi), ...scartati].filter(Boolean);
  const righe = [
    fonti.length ? `Ricerca online del ${data}: ${fonti.join('; ')}.` : '',
    dubbi.length ? `Da verificare (ricerca online del ${data}): ${dubbi.join('; ')}.` : '',
  ].filter(Boolean);
  return { campi, nota: righe.length ? righe.join('\n') : null, scartati };
}
