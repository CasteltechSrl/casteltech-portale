-- ── Ordini a fornitore (Adriano, 31/10/2026: in Fatture in Cloud ne fate circa 20 al mese, dopo il 10/11 si fanno qui) ──
-- Il documento è già previsto (tipo 'ordine_fornitore' in documenti, numerazione 'ordine_fornitore'): qui si aggiungono
-- l'arrivo della merce riga per riga, il collegamento con la BOM quotata, la commessa e la fattura del fornitore.

ALTER TABLE documenti_righe
  ADD COLUMN IF NOT EXISTS arrivati    numeric NOT NULL DEFAULT 0,   -- pezzi arrivati (ordini a fornitore)
  ADD COLUMN IF NOT EXISTS arrivati_il date;                          -- ultimo arrivo segnato

ALTER TABLE documenti
  ADD COLUMN IF NOT EXISTS bom_id       int REFERENCES bom_analisi(id) ON DELETE SET NULL,          -- ordine nato da una BOM quotata
  ADD COLUMN IF NOT EXISTS commessa_id  int REFERENCES commesse(id) ON DELETE SET NULL,             -- per quale commessa si compra
  ADD COLUMN IF NOT EXISTS ricevuto_id  int REFERENCES documenti_ricevuti(id) ON DELETE SET NULL;   -- fattura del fornitore collegata

CREATE INDEX IF NOT EXISTS documenti_fornitore_idx ON documenti (fornitore_id) WHERE fornitore_id IS NOT NULL;
