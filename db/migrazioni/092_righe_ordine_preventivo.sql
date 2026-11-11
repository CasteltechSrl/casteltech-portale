-- ── Riga d'ordine del cliente collegata al suo preventivo (Adriano 11/11/2026) ──
-- Ogni riga di schede ricorda da quale preventivo nasce: il portale lo propone (stesso prodotto o stesso codice), l'ufficio lo
-- conferma o lo sceglie dal menu dei preventivi del cliente. Dalla riga collegata si crea la commessa.
ALTER TABLE ordini_righe ADD COLUMN IF NOT EXISTS preventivo_id int REFERENCES preventivi(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ordini_righe_preventivo_idx ON ordini_righe (preventivo_id) WHERE preventivo_id IS NOT NULL;

-- ordini già creati dal preventivo ("Crea ordine"): le righe di schede dello stesso prodotto prendono quel preventivo
UPDATE ordini_righe r SET preventivo_id = o.preventivo_id
FROM ordini o, preventivi p JOIN prodotti_revisioni pr ON pr.id = p.revisione_id
WHERE o.id = r.ordine_id AND p.id = o.preventivo_id AND r.preventivo_id IS NULL AND r.tipo = 'scheda' AND pr.prodotto_id = r.prodotto_id;
