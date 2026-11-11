-- ── Prezzo in anagrafica dal preventivo mandato al cliente (Adriano 11/11/2026) ──
-- Con la spunta "Variazione quantità", al salvataggio si sceglie se il prezzo vale per tutte le quantità ('unico'), solo per uno
-- scaglione di pezzi ('scaglione', da/a) o se l'anagrafica non si tocca ('nessuno'). La scelta si ripete all'invio al cliente.
ALTER TABLE preventivi ADD COLUMN IF NOT EXISTS anagrafica_prezzo jsonb;
