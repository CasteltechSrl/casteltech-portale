-- ── DDT in ingresso (Adriano 6/11/2026) ──
-- I DDT che arrivano dai fornitori (merce ordinata) e dai clienti (materiale in conto lavoro, schede da rilavorare) si scansionano
-- e si mettono in Da acquisire / cartella Drive. L'IA li legge, il portale incrocia le righe con gli ordini a fornitore e con gli
-- ordini dei clienti e segnala le anomalie; alla conferma dell'ufficio il DDT resta qui e gli arrivi si scrivono sull'ordine a fornitore.
ALTER TABLE acquisizioni DROP CONSTRAINT IF EXISTS acquisizioni_tipo_check;
ALTER TABLE acquisizioni ADD CONSTRAINT acquisizioni_tipo_check
  CHECK (tipo IN ('ordine', 'email', 'export_ordini', 'export_ddt', 'export_fatture', 'scheda_produzione', 'ddt', 'ddt_ricevuto', 'fattura_estera', 'altro'));

CREATE TABLE IF NOT EXISTS ddt_ricevuti (
  id              serial PRIMARY KEY,
  mittente        text NOT NULL CHECK (mittente IN ('fornitore', 'cliente')),
  fornitore_id    int REFERENCES fornitori_anagrafica(id) ON DELETE SET NULL,
  cliente_id      int REFERENCES clienti(id) ON DELETE SET NULL,
  mittente_nome   text NOT NULL,                 -- come scritto sul DDT (o dall'anagrafica)
  numero          text,                          -- numero del DDT del mittente, come scritto (anche con lettere)
  data            date,
  rif_ordine      text,                          -- ordine citato sul DDT (nostro ordine a fornitore, o ordine del cliente)
  ordine_id       int REFERENCES ordini(id) ON DELETE SET NULL,   -- DDT dai clienti: l'ordine del cliente a cui serve il materiale
  righe           jsonb NOT NULL DEFAULT '[]',   -- codice, descrizione, quantita + collegamenti (ordineId/posizione; componenteClienteId/prodottoId/rigaOrdineId) e anomalia
  anomalie        jsonb NOT NULL DEFAULT '[]',   -- [{livello, testo}] trovate all'incrocio, conservate anche dopo la conferma
  note            text,
  acquisizione_id int REFERENCES acquisizioni(id) ON DELETE SET NULL,
  confermato_da   int REFERENCES utenti(id),
  creato_il       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ddt_ricevuti_fornitore ON ddt_ricevuti (fornitore_id);
CREATE INDEX IF NOT EXISTS ddt_ricevuti_cliente ON ddt_ricevuti (cliente_id);
CREATE INDEX IF NOT EXISTS ddt_ricevuti_ordine ON ddt_ricevuti (ordine_id);
