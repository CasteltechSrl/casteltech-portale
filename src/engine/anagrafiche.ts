/**
 * Regola dei prodotti (Adriano 29/10/2026): il rapporto codice-cliente ci deve sempre essere.
 * Ogni codice prodotto appartiene a un cliente: non si salva un prodotto senza cliente, nel preventivo il menu Codice
 * mostra solo i codici del cliente scelto e in Anagrafiche → Prodotti i codici senza cliente sono messi in evidenza
 * (vanno assegnati a un cliente o eliminati). Nessun accesso al database.
 */

export const MSG_SENZA_CLIENTE = 'Ogni codice deve avere il suo cliente: scegli il cliente prima di salvare.';

/** Errore da mostrare se manca il cliente del prodotto (id non valido o vuoto). */
export function erroreClienteProdotto(clienteId: unknown): string | undefined {
  return Number(clienteId) > 0 ? undefined : MSG_SENZA_CLIENTE;
}

/** Codici selezionabili nel preventivo: SOLO quelli del cliente scelto (mai quelli senza cliente o di altri clienti). */
export function codiciDelCliente<T extends { cliente_id: number | null }>(prodotti: T[], clienteId: number): T[] {
  return clienteId > 0 ? prodotti.filter(p => p.cliente_id === clienteId) : [];
}

/** Testo dell'avviso in Anagrafiche → Prodotti quando ci sono codici senza cliente. */
export function avvisoSenzaCliente(n: number): string | undefined {
  if (!(n > 0)) return undefined;
  return `${n === 1 ? 'C\'è 1 codice' : `Ci sono ${n} codici`} senza cliente: ${n === 1 ? 'va assegnato' : 'vanno assegnati'} a un cliente oppure, se inseriti per errore, eliminati. `
    + 'Finché non hanno un cliente non si possono scegliere nei preventivi.';
}
