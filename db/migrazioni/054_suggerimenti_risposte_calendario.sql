-- ── Suggerimenti: risposte, stato "Da chiarire" e primi suggerimenti trattati (Adriano 1/11/2026) ──
-- Ogni settimana Claude legge i suggerimenti del team, realizza quelli validi e, quando non sono chiari,
-- scrive una domanda per chi li ha proposti (colonna risposta) mettendo lo stato "Da chiarire".
ALTER TABLE suggerimenti ADD COLUMN IF NOT EXISTS risposta    text;          -- domanda o risposta per chi ha proposto l'idea
ALTER TABLE suggerimenti ADD COLUMN IF NOT EXISTS risposta_da text;          -- chi l'ha scritta (es. Claude, Adriano)
ALTER TABLE suggerimenti ADD COLUMN IF NOT EXISTS risposta_il timestamptz;

ALTER TABLE suggerimenti DROP CONSTRAINT IF EXISTS suggerimenti_stato_check;
ALTER TABLE suggerimenti ADD CONSTRAINT suggerimenti_stato_check
  CHECK (stato IN ('da_valutare', 'da_chiarire', 'in_programma', 'in_sviluppo', 'fatto', 'scartato'));

-- Federico, 27/10/2026: promemoria in calendario per le commesse in ritardo → fatto con il calendario dei ritardi
UPDATE suggerimenti SET stato = 'fatto', aggiornato_il = now(),
  risposta_da = 'Claude', risposta_il = now(),
  risposta = 'Fatto (1/11/2026). In Impostazioni → Promemoria c''è l''indirizzo del "Calendario dei ritardi": si aggiunge una volta sola in Google Calendar di info@ (Altri calendari → + → Da URL) e da lì compaiono da soli: consegne scadute, lavorazioni che dovevano già partire secondo il Gantt, promemoria 2 giorni lavorativi prima dell''inizio, giorni con più ore di lavoro che ore disponibili, commesse aperte oltre la consegna o oltre le ore del preventivo. Google aggiorna i calendari da URL ogni qualche ora.'
WHERE titolo = 'Promemoria in calendario per le commesse in ritardo' AND stato <> 'fatto';

-- Federico, 27/10/2026: avviso Telegram alla fase successiva → servono decisioni prima di partire
UPDATE suggerimenti SET stato = 'da_chiarire', aggiornato_il = now(),
  risposta_da = 'Claude', risposta_il = now(),
  risposta = 'Per partire servono tre risposte: 1) chi è il responsabile di ogni fase (o di ogni reparto: SMD, THT, collaudo, spedizione…)? 2) Telegram va bene per tutti, anche al posto di SMS/WhatsApp per i promemoria del reparto? Serve creare un bot Telegram di Casteltech (5 minuti, lo fa Adriano con @BotFather) e ognuno deve scrivergli una volta. 3) Quando si avvisa: quando la fase prima viene chiusa dal telefono, o anche il giorno prima secondo il Gantt?'
WHERE titolo = 'Avviso Telegram al responsabile della fase successiva' AND stato IN ('da_valutare', 'in_programma');
