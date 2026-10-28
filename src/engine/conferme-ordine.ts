/**
 * Conferma d'ordine (Adriano, 28/10/2026): dall'ordine del cliente caricato nel portale si prepara la conferma con
 * tutte le righe e le date di consegna (modificabili), si emette il PDF e si manda in risposta all'email dell'ordine.
 * Solo calcoli e testi: niente database e niente rete.
 */
import { numeroModulo } from './documenti.js';
import { dataDa, numeroDa } from './acquisizioni.js';
import { arrotonda2 } from './amministrazione.js';

/** Riga dell'ordine come la legge il portale (ordini_righe + consegne a programma). */
export interface RigaOrdineConferma {
  id: number; codice: string | null; descrizione: string | null; codiceCliente: string | null;
  quantita: number; prezzo: number; consegnaRichiesta?: string | null; consegnaPrevista?: string | null;
  statoManuale?: string | null; prodottoId?: number | null;
  consegne?: { data: string; quantita: number }[];
}

export interface RigaConferma {
  posizione: number; codice: string | null; descrizione: string; quantita: number; prezzo: number;
  consegna: string | null; prodotto_id: number | null; riga_ordine_id: number | null;
}

/**
 * Righe proposte dall'ordine: una per riga, o una per ogni consegna se la riga ha le consegne a programma.
 * La data è quella richiesta dal cliente (se manca, la prevista scritta in ordine). Le righe annullate non vanno.
 * Il codice del cliente, se diverso dal nostro, si scrive nella descrizione ("VS. COD. …") perché lo riconosca.
 */
export function righeConfermaDaOrdine(righe: RigaOrdineConferma[]): RigaConferma[] {
  const out: RigaConferma[] = [];
  for (const r of righe) {
    if (r.statoManuale === 'annullato') continue;
    const vsCodice = r.codiceCliente && r.codiceCliente !== r.codice ? ` - VS. COD. ${r.codiceCliente}` : '';
    const base = {
      codice: r.codice || r.codiceCliente || null, descrizione: `${r.descrizione ?? ''}${r.codice ? vsCodice : ''}`.trim(),
      prezzo: Number(r.prezzo) || 0, prodotto_id: r.prodottoId ?? null, riga_ordine_id: r.id,
    };
    const consegne = (r.consegne ?? []).filter(k => k.quantita > 0);
    if (consegne.length) {
      for (const k of [...consegne].sort((a, b) => a.data.localeCompare(b.data)))
        out.push({ ...base, posizione: out.length + 1, quantita: Number(k.quantita), consegna: k.data });
    } else {
      out.push({ ...base, posizione: out.length + 1, quantita: Number(r.quantita) || 0, consegna: r.consegnaRichiesta ?? r.consegnaPrevista ?? null });
    }
  }
  return out;
}

export interface RigaModuloConferma {
  codice?: string; descrizione?: string; quantita?: string | number; prezzo?: string | number; consegna?: string;
  prodotto_id?: string | number; riga_ordine_id?: string | number; togli?: string;
}

/** Righe scritte nel modulo della conferma → righe del documento (vuote e spuntate "togli" escluse), con gli errori. */
export function righeConfermaDaModulo(input: RigaModuloConferma[] | Record<string, RigaModuloConferma>): { righe: RigaConferma[]; errori: string[] } {
  const errori: string[] = [];
  const elenco = (Array.isArray(input) ? input : Object.values(input ?? {})) as RigaModuloConferma[];
  const righe = elenco
    .filter(r => r && !r.togli && [r.codice, r.descrizione, r.quantita, r.prezzo].some(v => String(v ?? '').trim()))
    .map((r, i) => {
      const n = i + 1;
      // quantità: "1.200" sono milleduecento pezzi; prezzo: il punto o la virgola sono i decimali (0.125 €)
      const quantita = numeroDa(r.quantita) ?? NaN, prezzo = numeroModulo(r.prezzo);
      const testoData = String(r.consegna ?? '').trim();
      const consegna = testoData ? dataDa(testoData) : null;
      if (Number.isNaN(quantita) || quantita <= 0) errori.push(`Riga ${n}: la quantità deve essere un numero maggiore di zero.`);
      if (Number.isNaN(prezzo) || prezzo < 0) errori.push(`Riga ${n}: il prezzo non è un numero valido.`);
      if (testoData && !consegna) errori.push(`Riga ${n}: la data di consegna non è valida.`);
      const descrizione = String(r.descrizione ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
      if (!descrizione) errori.push(`Riga ${n}: manca la descrizione.`);
      return {
        posizione: n, codice: String(r.codice ?? '').trim().toUpperCase() || null, descrizione, quantita, prezzo, consegna,
        prodotto_id: Number(r.prodotto_id) || null, riga_ordine_id: Number(r.riga_ordine_id) || null,
      };
    });
  if (!righe.length) errori.push('Serve almeno una riga.');
  return { righe, errori };
}

export const importoRigaConferma = (r: { quantita: number; prezzo: number }) => arrotonda2(r.quantita * r.prezzo);
export const totaleConferma = (righe: { quantita: number; prezzo: number }[]) => arrotonda2(righe.reduce((s, r) => s + importoRigaConferma(r), 0));

/** Controlli prima di emettere: oltre alle righe servono le date di consegna (è il motivo della conferma). */
export function controlliEmissione(righe: RigaConferma[]): string[] {
  const errori: string[] = [];
  if (!righe.length) errori.push('Serve almeno una riga.');
  righe.forEach(r => { if (!r.consegna) errori.push(`Riga ${r.posizione} (${r.codice ?? r.descrizione}): manca la data di consegna.`); });
  return errori;
}

// ───────────────────────────── email di risposta ─────────────────────────────

/** Indirizzo da "Mario Rossi <mario@ditta.it>" (o l'indirizzo da solo), in minuscolo; vuoto se non è un indirizzo. */
export function indirizzoEmail(s: string | null | undefined): string {
  const t = String(s ?? '').trim();
  const m = /<([^<>\s]+@[^<>\s]+)>/.exec(t) ?? /([^\s<>"',;]+@[^\s<>"',;]+\.[a-z]{2,})/i.exec(t);
  return m ? m[1].toLowerCase() : '';
}

/** Elenco di indirizzi scritti dall'ufficio (separati da virgola o punto e virgola): validi e non ripetuti. */
export function elencoIndirizzi(s: string | null | undefined): { indirizzi: string[]; errati: string[] } {
  const parti = String(s ?? '').split(/[;,]/).map(x => x.trim()).filter(Boolean);
  const indirizzi: string[] = [], errati: string[] = [];
  for (const p of parti) {
    const a = indirizzoEmail(p);
    if (a && /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(a)) { if (!indirizzi.includes(a)) indirizzi.push(a); } else errati.push(p);
  }
  return { indirizzi, errati };
}

/** Oggetto della risposta: "Re: <oggetto dell'ordine>" (senza ripetere "Re:"); senza email d'origine un oggetto nuovo. */
export function oggettoRisposta(oggettoOrdine: string | null | undefined, numeroConferma: string, rifCliente?: string | null): string {
  const o = String(oggettoOrdine ?? '').trim();
  if (o) return /^(re|r|ris)\s*:/i.test(o) ? o : `Re: ${o}`;
  return `Conferma d'ordine n. ${numeroConferma}${rifCliente ? ` - vostro ordine ${rifCliente}` : ''}`;
}

const dataIt = (d: string | null | undefined) => (d ? d.split('-').reverse().join('/') : '');

/** Testo proposto dell'email (l'ufficio lo può cambiare prima di inviare). */
export function testoEmailConferma(o: { numero: string; data: string; rifCliente?: string | null; dataRif?: string | null; azienda: string }): string {
  const vostro = o.rifCliente ? ` al vostro ordine n. ${o.rifCliente}${o.dataRif ? ` del ${dataIt(o.dataRif)}` : ''}` : ' al vostro ordine';
  return `Buongiorno,\n\nin allegato la nostra conferma d'ordine n. ${o.numero} del ${dataIt(o.data)} relativa${vostro}, `
    + `con quantità, prezzi e date di consegna.\nVi chiediamo di controllarla e di segnalarci eventuali differenze.\n\nCordiali saluti\n\n${o.azienda}`;
}

/** Intestazioni dell'email d'ordine che servono per rispondere nella stessa conversazione. */
export interface EmailOrigine { messaggioId: string | null; riferimenti: string | null; oggetto: string; mittente: string; rispondiA: string }

/** Codifica di un'intestazione con caratteri non ASCII (=?UTF-8?B?…?=). */
const intestazione = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`);
const righe76 = (b64: string) => b64.replace(/.{1,76}/g, x => `${x}\r\n`);

/**
 * Messaggio email completo (RFC 5322, MIME) con il testo e il PDF allegato. Se c'è l'email d'origine, le intestazioni
 * In-Reply-To e References lo agganciano alla stessa conversazione (in Gmail e nella posta del cliente).
 */
export function messaggioEmail(o: {
  da: string; a: string[]; cc?: string[]; oggetto: string; testo: string;
  allegato?: { nome: string; mime: string; dati: Buffer }; inRispostaA?: string | null; riferimenti?: string | null; confine?: string;
}): string {
  const confine = o.confine ?? `casteltech-${Date.now().toString(36)}`;
  const testa = [
    `From: ${o.da}`, `To: ${o.a.join(', ')}`, ...(o.cc?.length ? [`Cc: ${o.cc.join(', ')}`] : []),
    `Subject: ${intestazione(o.oggetto)}`, 'MIME-Version: 1.0',
    ...(o.inRispostaA ? [`In-Reply-To: ${o.inRispostaA}`, `References: ${[o.riferimenti, o.inRispostaA].filter(Boolean).join(' ')}`] : []),
  ];
  const testo = righe76(Buffer.from(o.testo.replace(/\r?\n/g, '\r\n'), 'utf8').toString('base64'));
  if (!o.allegato) return [...testa, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', testo].join('\r\n');
  return [...testa, `Content-Type: multipart/mixed; boundary="${confine}"`, '',
    `--${confine}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', testo,
    `--${confine}`, `Content-Type: ${o.allegato.mime}; name="${o.allegato.nome}"`, 'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${o.allegato.nome}"`, '', righe76(o.allegato.dati.toString('base64')),
    `--${confine}--`, ''].join('\r\n');
}

/** Nome del file PDF: Conferma_ordine_12_2026_CLIENTE.pdf (solo lettere, numeri e trattini bassi). */
export function nomeFilePdf(numero: number | null, anno: number, cliente: string): string {
  const pulito = cliente.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
  return `Conferma_ordine_${numero ?? 'bozza'}_${anno}${pulito ? `_${pulito}` : ''}.pdf`;
}
