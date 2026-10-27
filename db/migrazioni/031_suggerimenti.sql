-- ── Suggerimenti del team (Adriano, 27/10/2026) ──
-- Idee da sviluppare nel portale man mano che vengono in mente: non tutte subito.
-- Non sono collegati ad altro, quindi si possono sempre eliminare (righe inserite per errore).
CREATE TABLE suggerimenti (
  id            serial PRIMARY KEY,
  titolo        text NOT NULL,
  descrizione   text,
  area          text NOT NULL DEFAULT 'generale',      -- vedi AREE_SUGGERIMENTI in src/engine/suggerimenti.ts
  proposto_da   text,                                  -- chi ha avuto l'idea (anche chi non usa il portale)
  proposto_il   date NOT NULL DEFAULT CURRENT_DATE,
  priorita      text NOT NULL DEFAULT 'media' CHECK (priorita IN ('alta', 'media', 'bassa')),
  stato         text NOT NULL DEFAULT 'da_valutare' CHECK (stato IN ('da_valutare', 'in_programma', 'in_sviluppo', 'fatto', 'scartato')),
  note          text,                                  -- decisioni prese, cosa manca per partire
  creato_da     int REFERENCES utenti(id) ON DELETE SET NULL,
  creato_il     timestamptz NOT NULL DEFAULT now(),
  aggiornato_il timestamptz NOT NULL DEFAULT now()
);

-- I primi due, proposti da Federico (27/10/2026)
INSERT INTO suggerimenti (titolo, descrizione, area, proposto_da, proposto_il, note) VALUES
('Avviso Telegram al responsabile della fase successiva',
 'Quando una scheda avanza, il responsabile della fase successiva a quella in cui si trova viene avvisato in anticipo con un messaggio Telegram, così si prepara. L''avanzamento delle lavorazioni deve seguire il Gantt degli ordini.',
 'avvisi', 'Federico', '2026-10-27',
 'Prima vanno definiti i responsabili delle fasi (non ancora decisi). Il canale dei promemoria del reparto (SMS/WhatsApp/Telegram) è ancora da scegliere.'),
('Promemoria in calendario per le commesse in ritardo',
 'Nel calendario di info@casteltech.net devono comparire in anticipo dei promemoria quando una commessa sta andando in ritardo rispetto ai tempi del preventivo, alla capacità produttiva e alla scadenza di consegna.',
 'avvisi', 'Federico', '2026-10-27',
 'Serve il collegamento con Google Calendar di info@ (Google Workspace).');
