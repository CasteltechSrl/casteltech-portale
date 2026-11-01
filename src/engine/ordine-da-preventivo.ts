/**
 * Ordine dal preventivo (proposta della revisione, Adriano 1/11/2026): quando il cliente conferma, "Crea ordine" dal
 * preventivo prepara le righe dell'ordine cliente: una riga di schede (codice, descrizione, quantità e prezzo a scheda
 * del preventivo) e, se è il primo lotto, una riga di servizio per ogni costo una tantum (programmazioni, lamine…).
 * Le righe si possono correggere prima di salvare; qui solo le regole, senza database.
 */
export interface RigaOrdineProposta { tipo: 'scheda' | 'servizio'; codice: string | null; descrizione: string; quantita: number; prezzo: number }

export interface BasePreventivo {
  codice: string | null; descrizione: string | null; nSchede: number; prezzoScheda: number;
  unaTantum: { nome: string; prezzo: number }[];
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/** Righe proposte: schede al prezzo del lotto successivo + una tantum (solo primo lotto) come righe di servizio da 1 pezzo. */
export function righeOrdineDaPreventivo(p: BasePreventivo, primoLotto: boolean): RigaOrdineProposta[] {
  const righe: RigaOrdineProposta[] = [{
    tipo: 'scheda', codice: p.codice ? p.codice.toUpperCase() : null, descrizione: (p.descrizione ?? p.codice ?? 'SCHEDA').toUpperCase(),
    quantita: p.nSchede, prezzo: r2(p.prezzoScheda),
  }];
  if (primoLotto) for (const u of p.unaTantum) if (u.prezzo > 0) righe.push({ tipo: 'servizio', codice: null, descrizione: u.nome.toUpperCase(), quantita: 1, prezzo: r2(u.prezzo) });
  return righe;
}

/** Righe scritte nel modulo (riga_tipo[], riga_codice[], riga_desc[], riga_qta[], riga_prezzo[]): le righe vuote si saltano. */
export function righeDaModuloOrdine(b: Record<string, unknown>): RigaOrdineProposta[] {
  const lista = (k: string) => [b[k] ?? []].flat().map(x => String(x ?? '').trim());
  const tipi = lista('riga_tipo'), codici = lista('riga_codice'), desc = lista('riga_desc'), qta = lista('riga_qta'), prezzi = lista('riga_prezzo');
  const n = Math.max(tipi.length, codici.length, desc.length, qta.length, prezzi.length);
  const num = (s: string) => Number(s.replace(/\./g, '').replace(',', '.')) || 0;
  const righe: RigaOrdineProposta[] = [];
  for (let i = 0; i < n; i++) {
    const descrizione = (desc[i] ?? '').toUpperCase(), codice = (codici[i] ?? '').toUpperCase() || null;
    if (!descrizione && !codice) continue;
    righe.push({ tipo: tipi[i] === 'servizio' ? 'servizio' : 'scheda', codice, descrizione: descrizione || codice || '', quantita: num(qta[i] ?? ''), prezzo: num(prezzi[i] ?? '') });
  }
  return righe;
}

/** Controlli prima di creare l'ordine: cliente dall'anagrafica, almeno una riga di schede con quantità, prezzi non negativi. */
export function controlliOrdineDaPreventivo(d: { clienteId: number | null; righe: RigaOrdineProposta[]; consegna: string | null; dataOrdineCliente: string | null; oggi: string }): string[] {
  const errori: string[] = [];
  if (!d.clienteId) errori.push("Il preventivo non ha il cliente dall'anagrafica: aprilo, scegli il cliente e salvalo.");
  if (!d.righe.length) errori.push('Serve almeno una riga.');
  if (!d.righe.some(r => r.tipo === 'scheda' && r.quantita > 0)) errori.push('Serve una riga di schede con la quantità.');
  if (d.righe.some(r => r.quantita <= 0)) errori.push('Ogni riga deve avere una quantità maggiore di zero.');
  if (d.righe.some(r => r.prezzo < 0)) errori.push('I prezzi non possono essere negativi.');
  if (d.consegna && d.consegna < d.oggi) errori.push('La consegna richiesta è nel passato.');
  if (d.dataOrdineCliente && d.dataOrdineCliente > d.oggi) errori.push("La data dell'ordine del cliente è nel futuro.");
  return errori;
}

export const totaleOrdineProposto = (righe: RigaOrdineProposta[]) => r2(righe.reduce((s, r) => s + r.quantita * r.prezzo, 0));
