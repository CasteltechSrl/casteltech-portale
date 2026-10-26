-- ── Fatturato dei clienti per anno (dagli export delle fatture di Fatture in Cloud) ──
-- Serve al CRM per indicare quanto vale un cliente (fascia del fatturato medio annuo).
-- Si carica da Impostazioni → CRM; un nuovo caricamento sostituisce gli anni presenti nel file.
CREATE TABLE fatturato_clienti (
  cliente_nome text NOT NULL,                     -- come scritto nelle fatture
  anno         int NOT NULL,
  importo      numeric NOT NULL,                  -- imponibile + non imponibile dell'anno
  cliente_id   int REFERENCES clienti(id) ON DELETE SET NULL,
  PRIMARY KEY (cliente_nome, anno)
);
CREATE INDEX ON fatturato_clienti (cliente_id);
