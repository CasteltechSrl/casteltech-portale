-- Rientro delle schede (Adriano, 24/10/2026):
--  * sul foglio tempi l'operatore scrive apertura e chiusura OPPURE solo il tempo totale;
--  * una riga può restare "aperta" (manca la chiusura): si salva lo stesso e il controllo la segnala;
--  * il materiale impiegato scritto sul foglio diventa, in rientro, il totale del lotto per voce (commesse.consumi);
--  * le spedizioni (qtà, colli, bancali, peso, dimensione) si registrano sulla commessa.
ALTER TABLE rilevazioni ALTER COLUMN ora_inizio DROP NOT NULL;
ALTER TABLE rilevazioni ALTER COLUMN ora_fine DROP NOT NULL;
ALTER TABLE rilevazioni ALTER COLUMN data DROP NOT NULL;
ALTER TABLE rilevazioni ADD COLUMN IF NOT EXISTS durata_min numeric;         -- tempo totale scritto (se non ci sono le ore)
ALTER TABLE rilevazioni ADD COLUMN IF NOT EXISTS totale_scritto_min numeric; -- totale scritto anche con le ore (per il controllo)
ALTER TABLE rilevazioni ADD COLUMN IF NOT EXISTS resp text;                  -- colonna RESP del foglio tempi
ALTER TABLE rilevazioni ADD COLUMN IF NOT EXISTS riga int NOT NULL DEFAULT 0; -- ordine come sul foglio

ALTER TABLE commesse ADD COLUMN IF NOT EXISTS consumi jsonb NOT NULL DEFAULT '{}'::jsonb;     -- {voce: totale del lotto}
ALTER TABLE commesse ADD COLUMN IF NOT EXISTS spedizioni jsonb NOT NULL DEFAULT '[]'::jsonb;  -- [{qta, colli, bancali, peso, dimensione}]
ALTER TABLE commesse ADD COLUMN IF NOT EXISTS rientrata_il timestamptz;
ALTER TABLE commesse ADD COLUMN IF NOT EXISTS rientrata_da int REFERENCES utenti(id);
