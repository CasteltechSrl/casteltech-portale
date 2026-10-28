/**
 * Prodotto nuovo dal preventivo (Adriano 28/10/2026): se il codice non è ancora in anagrafica lo si scrive nel preventivo
 * e si salva in anagrafica senza uscire. Regole: tutto MAIUSCOLO, servono codice, descrizione e revisione
 * (se il cliente non la indica l'operatore scrive "0").
 * Dai documenti del cliente il portale propone codice, descrizione e revisione (intestazione della BOM, Gerber X2,
 * GenCAD, nomi di file e cartelle): sono solo proposte, l'ufficio le controlla prima di salvarle.
 * Nessun accesso al database.
 */
/** Maiuscolo e spazi singoli (come le anagrafiche). */
const maiuscolo = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim().toUpperCase();

export interface ProdottoNuovo { codice: string; descrizione: string; revisione: string }

/** Controlla i dati del prodotto nuovo: restituisce i valori in maiuscolo o l'errore da mostrare. */
export function controllaProdottoNuovo(x: Partial<Record<keyof ProdottoNuovo, unknown>>): { valori: ProdottoNuovo; errore?: string } {
  const valori = { codice: maiuscolo(x.codice), descrizione: maiuscolo(x.descrizione), revisione: maiuscolo(x.revisione) };
  const mancano = [!valori.codice && 'il codice', !valori.descrizione && 'la descrizione', !valori.revisione && 'la revisione (se non è indicata scrivi 0)'].filter(Boolean);
  if (mancano.length) return { valori, errore: `Manca ${mancano.join(', ')}.` };
  if (valori.codice.length > 60) return { valori, errore: 'Il codice è troppo lungo (massimo 60 caratteri).' };
  if (valori.revisione.length > 20) return { valori, errore: 'La revisione è troppo lunga (massimo 20 caratteri).' };
  return { valori };
}

// ───────────────────────────── proposta dai documenti del cliente ─────────────────────────────

export interface PropostaProdotto {
  codice: string | null;
  descrizione: string | null;
  revisione: string | null;
  /** da dove viene ogni valore (es. "intestazione della BOM", "Gerber"), da mostrare all'ufficio */
  fonti: Partial<Record<keyof ProdottoNuovo, string>>;
}

export interface IngressoProposta {
  nomePacchetto: string;
  nomiFile: string[];
  /** righe della BOM prima dell'intestazione delle colonne (titolo, progetto, revisione…) */
  bomIntestazione?: string[][];
  /** inizio dei file Gerber (attributo %TF.ProjectId) */
  gerber?: string[];
  /** inizio del file GenCAD ($HEADER: DRAWING, REVISION) */
  gencad?: string | null;
}

const ETICHETTE: Record<keyof ProdottoNuovo, RegExp> = {
  codice: /^(PROJECT( NAME| CODE)?|PROGETTO|CODICE( SCHEDA| PRODOTTO)?|BOARD( NAME| CODE)?|PCB( NAME| CODE)?|ASSEMBLY( NUMBER| CODE| P\/?N)?|ITEM CODE|PART NUMBER|DRAWING( NUMBER)?|DOC(UMENT)? NUMBER)$/,
  descrizione: /^(TITLE|TITOLO|DESCRIPTION|DESCRIZIONE|PRODUCT( NAME)?|NOME( SCHEDA| PRODOTTO)?)$/,
  revisione: /^(REV|REV\.|REVISION|REVISIONE|VERSION|VERSIONE|PCB REV(ISION)?|BOARD REV(ISION)?)$/,
};
const etichetta = (s: string) => s.replace(/[:=]\s*$/, '').replace(/\s+/g, ' ').trim().toUpperCase();
/** Revisione pulita: "Rev. A" → "A", "R02" → "02", "v1.1" → "1.1". */
export const pulisciRevisione = (s: string) => maiuscolo(s).replace(/^(REVISIONE|REVISION|REV\.?|VERSIONE|VERSION|VER\.?|V|R)\s*[-_.:]?\s*(?=[0-9A-Z])/, '').slice(0, 20);
/** Codice senza l'estensione del file del CAD ("EA1002.PrjPcb" → EA1002). */
const pulisciCodice = (s: string) => maiuscolo(s).replace(/\.(PRJPCB|PRJPCBSTRUCTURE|KICAD_PRO|KICAD_PCB|PRO|PCB|BRD|PCBDOC|SCHDOC|DSN)$/, '');
const valido = (s: string) => !!s && s.length <= 80 && !/^(N\/?A|-+|TBD|\?+)$/i.test(s);

/** Intestazione della BOM: "Project: EA1002" nella stessa cella, oppure l'etichetta in una cella e il valore nella successiva. */
function daIntestazioneBom(righe: string[][]): Partial<ProdottoNuovo> {
  const out: Partial<ProdottoNuovo> = {};
  const metti = (campo: keyof ProdottoNuovo, v: string) => {
    const x = campo === 'revisione' ? pulisciRevisione(v) : campo === 'codice' ? pulisciCodice(v) : maiuscolo(v);
    if (!out[campo] && valido(x)) out[campo] = x;
  };
  for (const r of righe) {
    const celle = r.map(c => String(c ?? '').trim());
    celle.forEach((c, i) => {
      if (!c) return;
      for (const campo of Object.keys(ETICHETTE) as (keyof ProdottoNuovo)[]) {
        const m = /^([^:=]{2,30})\s*[:=]\s*(.+)$/.exec(c);
        if (m && ETICHETTE[campo].test(etichetta(m[1]))) { metti(campo, m[2]); continue; }
        if (ETICHETTE[campo].test(etichetta(c))) {
          const dopo = celle.slice(i + 1).find(Boolean);
          if (dopo) metti(campo, dopo);
        }
      }
    });
  }
  return out;
}

/** Gerber X2: %TF.ProjectId,<nome>,<guid>,<revisione>*% (Altium, KiCad e altri CAD recenti). */
function daGerber(testi: string[]): Partial<ProdottoNuovo> {
  for (const t of testi) {
    const m = /%TF\.ProjectId,([^,*]*),[^,*]*,([^,*]*)\*%/.exec(t);
    if (m) {
      const codice = pulisciCodice(m[1]), revisione = pulisciRevisione(m[2]);
      return { ...(valido(codice) ? { codice } : {}), ...(valido(revisione) ? { revisione } : {}) };
    }
  }
  return {};
}

/** GenCAD: nel $HEADER le righe DRAWING "nome" e REVISION "x". */
function daGenCad(testo: string | null | undefined): Partial<ProdottoNuovo> {
  if (!testo) return {};
  const intest = /\$HEADER([\s\S]*?)\$ENDHEADER/i.exec(testo)?.[1] ?? '';
  const campo = (k: string) => { const m = new RegExp(`^\\s*${k}\\s+(?:"([^"]*)"|(\\S.*))\\s*$`, 'im').exec(intest); return (m?.[1] ?? m?.[2] ?? '').trim(); };
  // il DRAWING è spesso il percorso del file del CAD: si tiene solo il nome, senza estensione
  const disegno = maiuscolo(campo('DRAWING').split(/[\\/]/).pop()!.replace(/\.[A-Z0-9]{2,5}$/i, ''));
  const revisione = pulisciRevisione(campo('REVISION'));
  return { ...(valido(disegno) ? { codice: disegno } : {}), ...(valido(revisione) && !/^0+(\.0+)?$/.test(campo('REVISION')) ? { revisione } : {}) };
}

/**
 * Nome del pacchetto, della cartella o dei file: "EA1002-0_impianti" → EA1002 rev. 0, "SB-002 REV B" → SB-002 rev. B.
 * Si prende solo se il nome ha chiaramente la forma codice + revisione (lettere e numeri, poi "-n" o "REV x").
 */
export function daNome(nome: string): Partial<ProdottoNuovo> {
  const n = maiuscolo(nome.replace(/\.[A-Za-z0-9]{2,5}$/, '').replace(/_/g, ' '));
  const rev = /^([A-Z]{1,6}[- ]?\d{2,}[A-Z0-9]*(?:[-.]\d{2,})*)\s*[- ]?\s*(?:REV\.?|REVISIONE|REVISION|R)\s*[-.]?\s*([0-9]{1,2}|[A-Z]\d?)\b/.exec(n);
  if (rev) return { codice: rev[1].replace(/ /g, '-'), revisione: rev[2] };
  const trattino = /^([A-Z]{1,6}\d{3,}[A-Z]?)-(\d{1,2})(?=\s|$)/.exec(n);
  if (trattino) return { codice: trattino[1], revisione: trattino[2] };
  return {};
}

/** Mette insieme le proposte: prima l'intestazione della BOM, poi Gerber, GenCAD, nome del pacchetto e cartelle dei file. */
export function propostaProdotto(ing: IngressoProposta): PropostaProdotto | null {
  const out: PropostaProdotto = { codice: null, descrizione: null, revisione: null, fonti: {} };
  const cartelle = [...new Set(ing.nomiFile.flatMap(f => f.split(/[\\/]/).slice(0, -1)))];
  const fonti: [string, Partial<ProdottoNuovo>][] = [
    ['intestazione della BOM', daIntestazioneBom(ing.bomIntestazione ?? [])],
    ['file Gerber', daGerber(ing.gerber ?? [])],
    ['file GenCAD', daGenCad(ing.gencad)],
    ['nome del caricamento', daNome(ing.nomePacchetto)],
    ...cartelle.map(c => [`cartella «${c}»`, daNome(c)] as [string, Partial<ProdottoNuovo>]),
  ];
  for (const [fonte, v] of fonti)
    for (const campo of ['codice', 'descrizione', 'revisione'] as const)
      if (!out[campo] && v[campo]) { out[campo] = v[campo]!; out.fonti[campo] = fonte; }
  return out.codice || out.descrizione || out.revisione ? out : null;
}
