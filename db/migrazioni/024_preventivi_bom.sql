-- Preventivo collegato a una BOM caricata in Componenti (Adriano, 25/10/2026): il costo componenti a scheda si prende
-- dal preventivo materiali della BOM, ricalcolato sulle schede del preventivo. Il valore resta scritto nei parametri
-- del preventivo (fotografia): eliminare la BOM o aggiornarne i prezzi non cambia i preventivi salvati.
ALTER TABLE preventivi ADD COLUMN IF NOT EXISTS bom_id int REFERENCES bom_analisi(id) ON DELETE SET NULL;
