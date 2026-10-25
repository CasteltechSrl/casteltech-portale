/**
 * Lettura con l'IA (API Anthropic) degli ordini dei clienti: PDF, foto, testo scritto in un'email.
 * L'IA propone cliente, riferimento, date e righe; l'ufficio controlla e conferma. Niente viene creato senza conferma.
 * Chiave: ANTHROPIC_API_KEY (solo su Render). Modello: ANTHROPIC_MODEL (default claude-sonnet-5-5), come la lettura delle BOM.
 */
import { iaConfigurata } from './lettura-ia.js';
import { normalizzaProposta, oggettoJson, type Proposta } from '../engine/acquisizioni.js';

export { iaConfigurata };

/** Un pezzo del documento da leggere: un PDF, un'immagine o del testo (corpo dell'email). */
export type Parte = { tipo: 'pdf' | 'immagine'; mime: string; dati: Buffer; nome: string } | { tipo: 'testo'; testo: string; nome: string };

const istruzioni = (clienti: string[]) => `Sei l'ufficio commerciale di Casteltech S.r.l., assemblaggio di schede elettroniche conto terzi.
Ricevi un documento arrivato da un cliente (PDF, foto o testo di un'email). Devi capire se è un ORDINE di acquisto rivolto a Casteltech
e, se lo è, estrarne i dati. Casteltech è il fornitore: il cliente è l'azienda che ordina, mai Casteltech.

Clienti già in anagrafica (usa esattamente uno di questi nomi se il cliente è uno di loro, altrimenti scrivi il nome come nel documento):
${clienti.join('; ') || '(nessuno)'}

Per ogni riga ordinata: codice dell'articolo (quello del cliente o di Casteltech, come scritto), descrizione, quantità, prezzo unitario in euro
(senza IVA), data di consegna richiesta. Le spese una tantum (attrezzaggio, lamina, programmazione, PCB) sono righe anche loro.
Se ci sono più consegne per lo stesso articolo scrivi una riga per ogni consegna.

Regole: non inventare. Se un dato non c'è, lascialo vuoto (stringa vuota o null). Date nel formato AAAA-MM-GG.
Se il documento non è un ordine (offerta, DDT, fattura, sollecito, conferma d'ordine di Casteltech, pubblicità), e_ordine = false e spiega in note.
In note metti in italiano, in breve, quello che l'ufficio deve sapere (condizioni particolari, consegne parziali, dubbi di lettura).
Rispondi SOLO con un oggetto JSON:
{"e_ordine": true, "cliente": "", "rif_cliente": "<numero dell'ordine del cliente>", "data_ordine": "AAAA-MM-GG",
 "righe": [{"codice": "", "descrizione": "", "quantita": 0, "prezzo": 0, "consegna": "AAAA-MM-GG"}], "note": ""}`;

/** Manda il documento all'IA e restituisce la proposta d'ordine pulita. */
export async function leggiOrdineConIa(parti: Parte[], clienti: string[]): Promise<Proposta> {
  if (!iaConfigurata()) throw new Error("manca la chiave dell'IA (ANTHROPIC_API_KEY su Render)");
  const contenuto: any[] = [];
  for (const p of parti) {
    if (p.tipo === 'pdf') contenuto.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: p.dati.toString('base64') }, title: p.nome });
    else if (p.tipo === 'immagine') contenuto.push({ type: 'image', source: { type: 'base64', media_type: p.mime, data: p.dati.toString('base64') } });
    else if (p.tipo === 'testo') contenuto.push({ type: 'text', text: `${p.nome}:\n${p.testo.slice(0, 60_000)}` });
  }
  if (!contenuto.length) throw new Error('il file è vuoto');
  contenuto.push({ type: 'text', text: 'Leggi il documento e rispondi con il JSON.' });
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 150_000);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: ctrl.signal,
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5', max_tokens: 8000, system: istruzioni(clienti),
        messages: [{ role: 'user', content: contenuto }] }),
    });
    const corpo: any = await r.json().catch(() => null);
    if (!r.ok) throw new Error(corpo?.error?.message ?? `errore ${r.status}`);
    const risposta = (corpo?.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('');
    const x = oggettoJson(risposta);
    if (!x) throw new Error("l'IA non ha restituito dati leggibili");
    return normalizzaProposta(x);
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error("l'IA non ha risposto in tempo: riprova");
    throw e;
  } finally { clearTimeout(t); }
}
