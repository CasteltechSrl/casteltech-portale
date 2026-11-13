-- Note di montaggio sul prodotto (Adriano 13/11/2026, "riportare le note delle vecchie schede di produzione"): valgono per tutte le revisioni
-- e per le commesse future. La commessa nuova le prende se la sua scheda tecnica non ne ha; salvando una commessa le note scritte tornano qui.
-- Le segnalazioni delle vecchie schede vanno nella tabella segnalazioni (storico del prodotto) con categoria 'schede vecchie'.
ALTER TABLE prodotti ADD COLUMN IF NOT EXISTS note_montaggio text NOT NULL DEFAULT '';
