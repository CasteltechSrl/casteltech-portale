-- Prezzi in anagrafica (Adriano 31/10/2026: "nei prodotti e nei componenti manca il prezzo, recuperali da FIC").
--  * prodotti: prezzo di vendita a scheda (dall'anagrafica prodotti di FIC o dall'ultima fattura emessa, la più recente delle due).
--  * componenti: ultimo prezzo di acquisto (dagli ordini a fornitore di FIC), con fornitore, data e quantità ordinata.
-- prezzo_fonte: 'fic_anagrafica' | 'fic_fattura' | 'fic_ordine' | 'manuale'. Un prezzo scritto a mano non viene
-- sovrascritto quando si ricarica il file da FIC.
ALTER TABLE prodotti ADD COLUMN IF NOT EXISTS prezzo_vendita numeric(14,5);
ALTER TABLE prodotti ADD COLUMN IF NOT EXISTS prezzo_fonte text;
ALTER TABLE prodotti ADD COLUMN IF NOT EXISTS prezzo_data date;
ALTER TABLE prodotti ADD COLUMN IF NOT EXISTS prezzo_nota text;

ALTER TABLE componenti ADD COLUMN IF NOT EXISTS prezzo_acquisto numeric(14,6);
ALTER TABLE componenti ADD COLUMN IF NOT EXISTS prezzo_fornitore text;
ALTER TABLE componenti ADD COLUMN IF NOT EXISTS prezzo_quantita numeric(14,2);
ALTER TABLE componenti ADD COLUMN IF NOT EXISTS prezzo_fonte text;
ALTER TABLE componenti ADD COLUMN IF NOT EXISTS prezzo_data date;
ALTER TABLE componenti ADD COLUMN IF NOT EXISTS prezzo_nota text;
