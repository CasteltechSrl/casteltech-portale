-- ── Autofatture dalle fatture dei fornitori esteri (Adriano, 28/10/2026) ──
-- La fattura estera (PDF) arriva dalla cartella Drive / Da acquisire o si carica in Amministrazione → Autofatture:
-- l'IA la legge, l'ufficio controlla, il portale registra la fattura del fornitore (documenti_ricevuti) e prepara
-- l'autofattura (documenti, tipo 'autofattura', sezionale AF) da emettere.

ALTER TABLE acquisizioni DROP CONSTRAINT IF EXISTS acquisizioni_tipo_check;
ALTER TABLE acquisizioni ADD CONSTRAINT acquisizioni_tipo_check
  CHECK (tipo IN ('ordine', 'email', 'export_ordini', 'export_ddt', 'export_fatture', 'scheda_produzione', 'ddt', 'fattura_estera', 'altro'));

-- fattura del fornitore estero letta dal PDF: valuta e cambio BCE usati per l'autofattura
ALTER TABLE documenti_ricevuti DROP CONSTRAINT IF EXISTS documenti_ricevuti_origine_check;
ALTER TABLE documenti_ricevuti ADD CONSTRAINT documenti_ricevuti_origine_check CHECK (origine IN ('sdi', 'fic', 'manuale', 'acquisito'));
ALTER TABLE documenti_ricevuti
  ADD COLUMN valuta text NOT NULL DEFAULT 'EUR',
  ADD COLUMN cambio numeric,                                          -- unità di valuta per 1 euro (BCE), solo se la valuta non è EUR
  ADD COLUMN acquisizione_id int REFERENCES acquisizioni(id) ON DELETE SET NULL;

-- autofattura → fattura del fornitore che integra
ALTER TABLE documenti ADD COLUMN ricevuto_id int REFERENCES documenti_ricevuti(id) ON DELETE SET NULL;
CREATE INDEX ON documenti (ricevuto_id);
