/**
 * Acquisizione di ordini e aggiornamenti: riconoscimento del tipo di file, lettura delle email (.eml)
 * e pulizia di quanto restituisce l'IA. Solo calcoli: niente database e niente rete.
 */
import { Buffer } from 'node:buffer';

export type TipoAcquisizione = 'ordine' | 'email' | 'export_ordini' | 'export_ddt' | 'export_fatture' | 'scheda_produzione' | 'altro';
export const TIPI_ACQUISIZIONE: Record<TipoAcquisizione, string> = {
  ordine: 'ordine del cliente', email: 'email', export_ordini: 'export ordini FIC', export_ddt: 'export DDT FIC',
  export_fatture: 'export fatture FIC', scheda_produzione: 'scheda di produzione', altro: 'altro',
};

/** Tipo del file dal nome (gli export di Fatture in Cloud si chiamano export_ordini…, export_ddt…, export_fatture…). */
export function tipoFile(nome: string): TipoAcquisizione {
  const n = nome.toLowerCase();
  if (/export[_ ]?ordini/.test(n)) return 'export_ordini';
  if (/export[_ ]?ddt/.test(n)) return 'export_ddt';
  if (/export[_ ]?fatture/.test(n)) return 'export_fatture';
  if (/\.(eml|msg)$/.test(n)) return 'email';
  if (/\.(pdf|txt|png|jpe?g|webp)$/.test(n)) return 'ordine';
  return 'altro';
}

/** Tipo MIME da mandare all'IA per i file d'ordine. */
export function mimeDaNome(nome: string): string {
  const n = nome.toLowerCase();
  if (n.endsWith('.pdf')) return 'application/pdf';
  if (n.endsWith('.png')) return 'image/png';
  if (/\.jpe?g$/.test(n)) return 'image/jpeg';
  if (n.endsWith('.webp')) return 'image/webp';
  return 'text/plain';
}

// ───────────────────────────── email (.eml) ─────────────────────────────
export interface Allegato { nome: string; mime: string; dati: Buffer }
export interface Email { oggetto: string; mittente: string; data: string; testo: string; allegati: Allegato[] }

/** Lettura essenziale di un'email salvata (.eml): intestazioni, testo e allegati (PDF, immagini). */
export function leggiEmail(sorgente: Buffer | string): Email {
  const grezzo = typeof sorgente === 'string' ? sorgente : sorgente.toString('latin1');
  const { intestazioni, corpo } = separa(grezzo);
  const out: Email = { oggetto: decodificaParole(intestazioni['subject'] ?? ''), mittente: decodificaParole(intestazioni['from'] ?? ''),
    data: intestazioni['date'] ?? '', testo: '', allegati: [] };
  const testi: string[] = [], html: string[] = [];
  const visita = (int: Record<string, string>, c: string) => {
    const tipo = (int['content-type'] ?? 'text/plain').toLowerCase();
    const confine = /boundary="?([^";]+)"?/i.exec(int['content-type'] ?? '')?.[1];
    if (tipo.startsWith('multipart/') && confine) {
      for (const parte of c.split('--' + confine).slice(1)) {
        if (parte.startsWith('--')) break;
        const p = separa(parte.replace(/^\r?\n/, ''));
        visita(p.intestazioni, p.corpo);
      }
      return;
    }
    const dati = decodificaCorpo(c, int['content-transfer-encoding'] ?? '');
    const nome = decodificaParole(/(?:file)?name\*?="?([^";\r\n]+)"?/i.exec(`${int['content-disposition'] ?? ''};${int['content-type'] ?? ''}`)?.[1] ?? '');
    const allegato = /attachment/i.test(int['content-disposition'] ?? '') || (!!nome && !tipo.startsWith('text/'));
    if (allegato) out.allegati.push({ nome: nome || 'allegato', mime: tipo.split(';')[0].trim(), dati });
    else if (tipo.startsWith('text/plain')) testi.push(testoDa(dati, int['content-type'] ?? ''));
    else if (tipo.startsWith('text/html')) html.push(senzaTag(testoDa(dati, int['content-type'] ?? '')));
  };
  visita(intestazioni, corpo);
  out.testo = (testi.length ? testi : html).join('\n').trim();
  return out;
}

function separa(s: string): { intestazioni: Record<string, string>; corpo: string } {
  const m = /\r?\n\r?\n/.exec(s);
  const testa = m ? s.slice(0, m.index) : s, corpo = m ? s.slice(m.index + m[0].length) : '';
  const intestazioni: Record<string, string> = {};
  for (const riga of testa.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const i = riga.indexOf(':');
    if (i > 0) intestazioni[riga.slice(0, i).trim().toLowerCase()] = riga.slice(i + 1).trim();
  }
  return { intestazioni, corpo };
}

function decodificaCorpo(c: string, codifica: string): Buffer {
  const k = codifica.toLowerCase();
  if (k === 'base64') return Buffer.from(c.replace(/\s+/g, ''), 'base64');
  if (k === 'quoted-printable') {
    const s = c.replace(/=\r?\n/g, '');
    const byte: number[] = [];
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '=' && /^[0-9A-F]{2}$/i.test(s.slice(i + 1, i + 3))) { byte.push(parseInt(s.slice(i + 1, i + 3), 16)); i += 2; }
      else byte.push(s.charCodeAt(i) & 0xff);
    }
    return Buffer.from(byte);
  }
  return Buffer.from(c, 'latin1');
}

const testoDa = (b: Buffer, tipo: string) => (/charset="?utf-?8/i.test(tipo) ? b.toString('utf8') : b.toString('latin1'));
const senzaTag = (s: string) => s.replace(/<(style|script)[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>|<\/p>|<\/tr>|<\/div>/gi, '\n')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/[ \t]+/g, ' ');

/** Intestazioni codificate: =?utf-8?B?...?= e =?utf-8?Q?...?= */
export function decodificaParole(s: string): string {
  return s.replace(/=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi, (_, cs: string, k: string, t: string) => {
    const b = k.toUpperCase() === 'B' ? Buffer.from(t, 'base64') : decodificaCorpo(t.replace(/_/g, ' '), 'quoted-printable');
    return /utf-?8/i.test(cs) ? b.toString('utf8') : b.toString('latin1');
  }).replace(/\?=\s+=\?/g, '');
}

// ───────────────────────────── proposta d'ordine letta dall'IA ─────────────────────────────
export interface RigaProposta { codice: string; descrizione: string; quantita: number; prezzo: number | null; consegna: string | null }
export interface Proposta {
  eOrdine: boolean;            // false: il documento non è un ordine (offerta, DDT, conferma nostra…)
  cliente: string;
  rifCliente: string;          // numero dell'ordine del cliente
  dataOrdine: string | null;
  righe: RigaProposta[];
  note: string;
}

const maiuscolo = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
/** Numero scritto all'italiana o all'inglese: "1.234,50" → 1234.5, "1,234.50" → 1234.5, "12,5" → 12.5. */
export function numeroDa(x: unknown): number | null {
  if (typeof x === 'number') return Number.isFinite(x) ? x : null;
  let s = String(x ?? '').replace(/[€\s]/g, '');
  if (!s) return null;
  if (s.includes('.') && s.includes(',')) {
    // il separatore che viene per ultimo è quello dei decimali
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');   // "2.460" pezzi
  else s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
/** Data in formato AAAA-MM-GG da "2026-11-30", "30/11/2026", "30.11.26". */
export function dataDa(x: unknown): string | null {
  const s = String(x ?? '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (!m) return null;
  const anno = m[3].length === 2 ? `20${m[3]}` : m[3];
  const gg = Number(m[1]), mm = Number(m[2]);
  if (mm < 1 || mm > 12 || gg < 1 || gg > 31) return null;
  return `${anno}-${String(mm).padStart(2, '0')}-${String(gg).padStart(2, '0')}`;
}

/** Pulisce la risposta dell'IA: maiuscolo, numeri e date nel formato del portale, righe vuote tolte. */
export function normalizzaProposta(x: any): Proposta {
  const righe: RigaProposta[] = (Array.isArray(x?.righe) ? x.righe : []).map((r: any) => ({
    codice: maiuscolo(r?.codice), descrizione: maiuscolo(r?.descrizione),
    quantita: numeroDa(r?.quantita) ?? 0, prezzo: numeroDa(r?.prezzo), consegna: dataDa(r?.consegna),
  })).filter((r: RigaProposta) => r.codice || r.descrizione);
  return {
    eOrdine: x?.e_ordine !== false && x?.eOrdine !== false,
    cliente: maiuscolo(x?.cliente), rifCliente: maiuscolo(x?.rif_cliente ?? x?.rifCliente),
    dataOrdine: dataDa(x?.data_ordine ?? x?.dataOrdine), righe, note: String(x?.note ?? '').trim().slice(0, 500),
  };
}

/** Estrae l'oggetto JSON dalla risposta dell'IA anche se ha testo o ``` intorno. */
export function oggettoJson(testo: string): any {
  const a = testo.indexOf('{'), b = testo.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { const v = JSON.parse(testo.slice(a, b + 1)); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; }
}

/** Numero da dare a un ordine arrivato per email: dal 9001 in su nell'anno, per non toccare la numerazione di Fatture in Cloud. */
export const PRIMO_NUMERO_EMAIL = 9001;
export const numeroOrdineEmail = (massimo: number | null | undefined) => Math.max(PRIMO_NUMERO_EMAIL, (massimo ?? 0) + 1);

/** Riga di servizio (spese una tantum) o di schede, dalla descrizione: l'ufficio può cambiarla prima di confermare. */
export const tipoRigaDa = (descrizione: string): 'scheda' | 'servizio' =>
  /\b(ATTREZZ\w*|SETUP|SET-UP|LAMIN[AE]|STENCIL|PROGRAMMAZION\w*|SPESE|TRASPORTO|IMBALL\w*|CERTIFICAT\w*|NRE)\b/i.test(descrizione) ? 'servizio' : 'scheda';

// ───────────────────────────── cartella Google Drive ─────────────────────────────
/** La cartella si controlla solo nei giorni feriali dalle 8 alle 20 (ora italiana), come l'uso reale del portale. */
export const orarioDrive = (p: { feriale: boolean; minuti: number }) => p.feriale && p.minuti >= 8 * 60 && p.minuti <= 20 * 60;
/** Identificativo della cartella dal link di Drive (o l'identificativo stesso). */
export function idCartellaDa(s: string): string | null {
  const t = s.trim();
  const m = /\/folders\/([A-Za-z0-9_-]{10,})/.exec(t) ?? /[?&]id=([A-Za-z0-9_-]{10,})/.exec(t);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(t) ? t : null;
}
/** File che si possono leggere: i documenti Google nativi (Documenti, Fogli) e le cartelle no. */
export const fileDaAcquisire = (mime: string) => !mime.startsWith('application/vnd.google-apps.');
