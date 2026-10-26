/**
 * Lettura con l'IA (API Anthropic) degli ordini dei clienti: PDF, foto, testo scritto in un'email.
 * L'IA propone cliente, riferimento, date e righe; l'ufficio controlla e conferma. Niente viene creato senza conferma.
 * Riconosce anche le schede di produzione scansionate e ne legge i fogli tempi (righe per il rientro della commessa).
 * Chiave: ANTHROPIC_API_KEY (solo su Render). Modello: ANTHROPIC_MODEL (default claude-sonnet-5-5), come la lettura delle BOM.
 */
import { iaConfigurata } from './lettura-ia.js';
import { normalizzaProposta, oggettoJson, type Proposta } from '../engine/acquisizioni.js';
import type { FoglioLetto } from '../engine/fogli-tempi.js';

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
ECCEZIONE: se è una SCHEDA DI PRODUZIONE di Casteltech (titolo "SCHEDA DI PRODUZIONE", "Fogli tempi", numero commessa tipo C2026-0001 in alto)
rispondi solo {"scheda_produzione": true, "commesse": ["<numeri di commessa che compaiono>"]}.
In note metti in italiano, in breve, quello che l'ufficio deve sapere (condizioni particolari, consegne parziali, dubbi di lettura).
Rispondi SOLO con un oggetto JSON:
{"e_ordine": true, "cliente": "", "rif_cliente": "<numero dell'ordine del cliente>", "data_ordine": "AAAA-MM-GG",
 "righe": [{"codice": "", "descrizione": "", "quantita": 0, "prezzo": 0, "consegna": "AAAA-MM-GG"}], "note": ""}`;

/** Manda i pezzi del documento all'IA con le istruzioni e restituisce l'oggetto JSON della risposta. */
async function chiediIa(parti: Parte[], sistema: string): Promise<any> {
  if (!iaConfigurata()) throw new Error("manca la chiave dell'IA (ANTHROPIC_API_KEY su Render)");
  const contenuto: any[] = [];
  for (const p of parti) {
    if (p.tipo === 'pdf') contenuto.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: p.dati.toString('base64') }, title: p.nome });
    else if (p.tipo === 'immagine') contenuto.push({ type: 'image', source: { type: 'base64', media_type: p.mime, data: p.dati.toString('base64') } });
    else if (p.tipo === 'testo') contenuto.push({ type: 'text', text: `${p.nome}:\n${p.testo.slice(0, 60_000)}` });
  }
  if (!contenuto.length) throw new Error('il file è vuoto');
  contenuto.push({ type: 'text', text: 'Leggi il documento e rispondi con il JSON.' });
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 180_000);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: ctrl.signal,
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5', max_tokens: 16000, system: sistema,
        messages: [{ role: 'user', content: contenuto }] }),
    });
    const corpo: any = await r.json().catch(() => null);
    if (!r.ok) throw new Error(corpo?.error?.message ?? `errore ${r.status}`);
    const risposta = (corpo?.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('');
    const x = oggettoJson(risposta);
    if (!x) throw new Error("l'IA non ha restituito dati leggibili");
    return x;
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error("l'IA non ha risposto in tempo: riprova");
    throw e;
  } finally { clearTimeout(t); }
}

/** Esito della prima lettura: un ordine, oppure le schede di produzione di Casteltech (fogli tempi) con i numeri di commessa. */
export type Lettura = { tipo: 'ordine'; proposta: Proposta } | { tipo: 'scheda_produzione'; commesse: string[] };

/** Legge il documento: se è un ordine restituisce la proposta pulita, se è una scheda di produzione i numeri di commessa. */
export async function leggiOrdineConIa(parti: Parte[], clienti: string[]): Promise<Lettura> {
  const x = await chiediIa(parti, istruzioni(clienti));
  if (x?.scheda_produzione === true) {
    const commesse = (Array.isArray(x.commesse) ? x.commesse : [x.commessa]).map((c: unknown) => String(c ?? '').toUpperCase().replace(/\s+/g, '')).filter(Boolean);
    return { tipo: 'scheda_produzione', commesse: [...new Set<string>(commesse)] };
  }
  return { tipo: 'ordine', proposta: normalizzaProposta(x) };
}

const istruzioniTempi = (fasi: string) => `Sei l'ufficio produzione di Casteltech S.r.l. (assemblaggio di schede elettroniche).
Ricevi la scansione delle SCHEDE DI PRODUZIONE compilate a mano dagli operatori: i "Fogli tempi" (la pagina può essere ruotata).
In alto a destra c'è il N. COMMESSA (es. C2026-0001). Ogni riga ha le colonne:
FASE (numero della fase; il "+" è prestampato: "3+" = fase 3, "13+15" = fasi 13 e 15 insieme), OPERATORE (sigle; "MH+NG" = due operatori),
DATA (solo giorno/mese), APERTURA TEMPO e CHIUSURA TEMPO (ore:minuti), TOTALE ORE (a volte al posto di apertura/chiusura),
Nr. PERS. FASE, PZ (pezzi), S/P (S standard, P problema), RESP, NOTE.
${fasi ? `Fasi previste sulla scheda (numero nome): ${fasi}.` : ''}

Regole: trascrivi quello che è scritto, senza inventare. Le righe completamente vuote non vanno riportate.
Se un valore è corretto a penna (cancellato e riscritto) usa quello finale. Se una cifra è dubbia scrivi la lettura più probabile e metti "incerta": true.
Le prime pagine (dati della commessa, fasi previste) non hanno righe da trascrivere: considera solo i fogli tempi.
Rispondi SOLO con un oggetto JSON:
{"fogli": [{"commessa": "C2026-0001", "foglio": "1/2", "righe": [{"fase": "1+2", "operatore": "AG", "data": "22/10", "apertura": "8:00",
 "chiusura": "8:30", "totale": "", "persone": "1", "pezzi": "50", "sp": "S", "resp": "", "note": "", "incerta": false}]}]}`;

/** Legge i fogli tempi scansionati (righe come scritte a mano). */
export async function leggiFogliTempiConIa(parti: Parte[], fasi: string): Promise<FoglioLetto[]> {
  const x = await chiediIa(parti, istruzioniTempi(fasi));
  return Array.isArray(x?.fogli) ? x.fogli : [];
}
