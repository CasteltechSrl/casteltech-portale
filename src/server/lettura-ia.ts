/**
 * Lettura con l'IA (API Anthropic) delle righe di BOM che le regole non riescono a capire:
 * righe senza P/N (es. "RES 2K2 0603") o con P/N non riconosciuto e nessun dato dai distributori.
 * L'IA restituisce famiglia e attributi nei campi Casteltech; i codici li calcolano sempre le regole del portale.
 * Chiave: ANTHROPIC_API_KEY (solo su Render). Modello: ANTHROPIC_MODEL (default claude-sonnet-5-5). Chiamata e consumi: ia.ts.
 */
import { ATTR, FAMIGLIE, type Attributi } from '../engine/codifica/regole.js';
import { chiediTestoIa, iaConfigurata, strumentoRicercaWeb } from './ia.js';

export { iaConfigurata };

export interface RigaDaLeggere { riga: number; dati: Record<string, string> }
export interface Lettura { famiglia: string | null; attributi: Attributi; nota?: string }

const ISTRUZIONI = `Sei l'ufficio tecnico di Casteltech, assemblaggio di schede elettroniche. Ricevi righe di una distinta base (BOM)
con le colonne originali. Per ogni riga individua il componente e restituisci la famiglia e i suoi dati tecnici.

Famiglie (sigla: nome): ${Object.entries(FAMIGLIE).map(([k, f]) => `${k}: ${f.nome}`).join('; ')}.

Attributi possibili: ${ATTR.join(', ')}, tecnologia (S = SMD, T = THT).
Formati: case come "0603", "SOT-23", "SOIC-8", "QFN-32"; valore come "2.2K" (ohm), "100n" (farad), "10u" (henry), "16MHz", "5.1V" (zener);
tolleranza solo numero in percento ("1", "5") o "20PPM" per i quarzi; tensione "50V"; potenza "100mW"; corrente "2A" o "20mA";
dielettrico "X7R"; colore LED in italiano (ROSSO, VERDE, BLU, GIALLO, ARANCIONE, BIANCO, AMBRA, IR, RGB); passo connettori in mm ("2.54");
poli = numero di contatti; tipo connettore: BASETTA, PRESA, MORSETTO, USBC, MICROUSB, RJ45, FFC, SDCARD, HDMI, COASSIALE.

Regole: non inventare. Se un dato non c'è o non è deducibile con certezza, non metterlo. Se la riga non è un componente
(es. PCB, note, componente da non montare "DNP/NC"), famiglia null e una nota breve.
Rispondi SOLO con un array JSON: [{"riga": <numero>, "famiglia": "<sigla o null>", "attributi": {...}, "nota": "<facoltativa, in italiano>"}]`;

/** Chiede all'IA famiglia e attributi delle righe (a gruppi di 40). */
export async function leggiConIa(righe: RigaDaLeggere[]): Promise<Map<number, Lettura>> {
  const out = new Map<number, Lettura>();
  if (!iaConfigurata() || !righe.length) return out;
  for (let i = 0; i < righe.length; i += 40) {
    const lotto = righe.slice(i, i + 40);
    const testo = lotto.map(r => `${r.riga}: ${Object.entries(r.dati).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(' | ')}`).join('\n');
    const risposta = await chiediTestoIa('righe di BOM', { max_tokens: 8000, system: ISTRUZIONI,
      messages: [{ role: 'user', content: `Righe della BOM:\n${testo}` }] }, 90_000);
    for (const x of leggiJson(risposta)) {
      const fam = typeof x?.famiglia === 'string' && x.famiglia.toUpperCase() in FAMIGLIE ? x.famiglia.toUpperCase() : null;
      const attributi: Attributi = {};
      for (const [k, v] of Object.entries(x?.attributi ?? {})) if ((ATTR as readonly string[]).includes(k) || k === 'tecnologia') if (v != null && String(v).trim()) (attributi as any)[k] = String(v).trim();
      out.set(Number(x?.riga), { famiglia: fam, attributi, nota: x?.nota ? String(x.nota).slice(0, 200) : undefined });
    }
  }
  return out;
}

/** Estrae l'array JSON anche se la risposta ha testo o ``` intorno. */
export function leggiJson(testo: string): any[] {
  const a = testo.indexOf('['), b = testo.lastIndexOf(']');
  if (a < 0 || b <= a) return [];
  try { const v = JSON.parse(testo.slice(a, b + 1)); return Array.isArray(v) ? v : []; } catch { return []; }
}

// ───────────────────────────── compatibili proposti dall'IA (1/11/2026) ─────────────────────────────
export interface RigaCompatibile { riga: number; pn: string; produttore: string; descrizione: string; famiglia: string; case: string }
export interface ProposteIa { mpn: string; produttore: string; motivo: string }

const ISTRUZIONI_COMPATIBILI = `Sei l'ufficio acquisti di Casteltech, assemblaggio di schede elettroniche. Per ogni componente ricevuto il P/N
non si trova presso nessun distributore. Proponi fino a 3 codici di altri produttori (o della stessa serie) che lo sostituiscono SENZA
modificare la scheda: stesso package e stessa impronta, stessa piedinatura (pin-to-pin, drop-in), stessa funzione, valori e limiti
uguali o migliori. Solo codici reali e attuali che conosci con certezza; se non ne conosci, lista vuota. Non proporre lo stesso P/N.
Rispondi SOLO con un array JSON: [{"riga": <numero>, "compatibili": [{"mpn": "...", "produttore": "...", "motivo": "<breve, in italiano>"}]}]`;

/** Equivalenti pin-to-pin proposti dall'IA: contano solo se poi un distributore li vende (li controlla il portale). */
export async function proponiCompatibiliIa(righe: RigaCompatibile[]): Promise<Map<number, ProposteIa[]>> {
  const out = new Map<number, ProposteIa[]>();
  if (!iaConfigurata() || !righe.length) return out;
  for (let i = 0; i < righe.length; i += 30) {
    const lotto = righe.slice(i, i + 30);
    const testo = lotto.map(r => `${r.riga}: P/N=${r.pn}${r.produttore ? ` | produttore=${r.produttore}` : ''}${r.descrizione ? ` | ${r.descrizione}` : ''}${r.case ? ` | case=${r.case}` : ''}`).join('\n');
    const risposta = await chiediTestoIa('compatibili dei componenti', { max_tokens: 6000, system: ISTRUZIONI_COMPATIBILI,
      messages: [{ role: 'user', content: `Componenti non trovati:\n${testo}` }] }, 90_000);
    for (const x of leggiJson(risposta)) {
      const lista = (Array.isArray(x?.compatibili) ? x.compatibili : []).slice(0, 3)
        .map((c: any) => ({ mpn: String(c?.mpn ?? '').trim().toUpperCase(), produttore: String(c?.produttore ?? '').trim(), motivo: String(c?.motivo ?? '').slice(0, 200) }))
        .filter((c: ProposteIa) => /^[A-Z0-9][A-Z0-9\-+/.#,]{2,}$/.test(c.mpn));
      if (lista.length) out.set(Number(x?.riga), lista);
    }
  }
  return out;
}

// ───────────────────────────── ricerca su internet dei componenti non trovati (Adriano 5/11/2026) ─────────────────────────────
export interface RigaDaCercareSulWeb { riga: number; pn: string; produttore: string; descrizione: string; valore: string; footprint: string; famiglia: string }
export interface EsitoRicercaWeb {
  /** codice completo e corretto del produttore (es. "S505H-1.6-R" → "BK1-S505H-1.6-R"), null se non trovato */
  pnCompleto: string | null; produttore: string;
  /** true = è lo stesso identico componente della BOM scritto per intero (non un'alternativa) */
  stessoComponente: boolean;
  /** dove si compra secondo il web (distributori, sito del produttore), in parole */
  dove: string;
  /** criticità trovata (obsoleto, fine vita, tempi lunghi, solo a bobina, nessun distributore…), vuota se nessuna */
  criticita: string;
  /** cosa è stato trovato, in breve, per le note della riga */
  nota: string;
}

const ISTRUZIONI_RICERCA_WEB = `Sei l'ufficio acquisti di Casteltech, assemblaggio di schede elettroniche. Un componente della BOM del cliente
non si trova presso i nostri distributori (DigiKey, Mouser, Farnell, TME, Arrow): il codice può essere incompleto, scritto male, con il prefisso
o il suffisso del produttore mancante, oppure il componente può essere obsoleto o non distribuito. Cerca su internet (siti dei distributori,
del produttore, octopart, findchips) e rispondi SOLO con un oggetto JSON:
{"pnCompleto": "<codice completo e ordinabile del produttore, o null>", "produttore": "<nome>", "stessoComponente": <true se pnCompleto è
lo stesso identico componente della BOM scritto per intero, false se è un'alternativa o non sei sicuro>, "dove": "<dove si compra, es. DigiKey
283-3538-ND, Mouser>", "criticita": "<problema trovato: obsoleto, fine vita, tempi di consegna lunghi, solo a bobina intera, non distribuito…
oppure stringa vuota>", "nota": "<in italiano, 1-2 frasi: cosa hai trovato e con quale certezza>"}.
Solo codici reali trovati nelle pagine lette: se non trovi niente di sicuro, pnCompleto null e spiegalo nella nota.`;

/** Legge l'oggetto JSON anche se la risposta ha testo o \`\`\` intorno. */
function leggiOggetto(testo: string): any {
  const a = testo.indexOf('{'), b = testo.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(testo.slice(a, b + 1)); } catch { return null; }
}

/**
 * Cerca su internet un componente non trovato (una richiesta per riga, al massimo `maxRicerche` ricerche web l'una):
 * codice completo, dove si compra, criticità. Il codice trovato conta solo se poi un distributore lo vende (lo controlla il portale).
 */
export async function cercaComponenteSulWeb(r: RigaDaCercareSulWeb, maxRicerche = 4): Promise<EsitoRicercaWeb | null> {
  if (!iaConfigurata()) return null;
  const testo = [`P/N della BOM: ${r.pn}`, r.produttore && `produttore: ${r.produttore}`, r.descrizione && `descrizione: ${r.descrizione}`,
    r.valore && `valore: ${r.valore}`, r.footprint && `case/impronta: ${r.footprint}`, r.famiglia && `famiglia del portale: ${r.famiglia}`].filter(Boolean).join('\n');
  const risposta = await chiediTestoIa('ricerca componenti su internet', { max_tokens: 2000, system: ISTRUZIONI_RICERCA_WEB,
    messages: [{ role: 'user', content: testo }], strumenti: [strumentoRicercaWeb(maxRicerche)] }, 120_000);
  const x = leggiOggetto(risposta);
  if (!x) return null;
  const pn = String(x.pnCompleto ?? '').trim().toUpperCase();
  return {
    pnCompleto: /^[A-Z0-9][A-Z0-9\-+/.#,]{2,}$/.test(pn) ? pn : null, produttore: String(x.produttore ?? '').trim().slice(0, 80),
    stessoComponente: x.stessoComponente === true, dove: String(x.dove ?? '').trim().slice(0, 200),
    criticita: String(x.criticita ?? '').trim().slice(0, 300), nota: String(x.nota ?? '').trim().slice(0, 400),
  };
}
