-- ── DDT in PDF acquisiti dalla cartella Drive / Da acquisire ──
-- L'IA legge il DDT di Casteltech, l'ufficio conferma a quale riga d'ordine va ogni riga: le quantità spedite si aggiornano.
-- Le righe "acquisito" restano anche ricaricando il file degli ordini; spariscono solo quando il file contiene lo stesso DDT.
ALTER TABLE ddt_righe ADD COLUMN IF NOT EXISTS origine text NOT NULL DEFAULT 'import' CHECK (origine IN ('import', 'acquisito'));
ALTER TABLE ddt_righe ADD COLUMN IF NOT EXISTS acquisizione_id int REFERENCES acquisizioni(id) ON DELETE SET NULL;
ALTER TABLE acquisizioni DROP CONSTRAINT IF EXISTS acquisizioni_tipo_check;
ALTER TABLE acquisizioni ADD CONSTRAINT acquisizioni_tipo_check
  CHECK (tipo IN ('ordine', 'email', 'export_ordini', 'export_ddt', 'export_fatture', 'scheda_produzione', 'ddt', 'altro'));
