-- Tempi dal telefono/tablet in reparto (Adriano, 25/10/2026):
--  * l'operatore scansiona il QR della commessa, sceglie la fase e apre il tempo (ora attuale o scritta a mano)
--    oppure scrive il tempo totale; poi chiude la fase dal telefono;
--  * una fase aperta dal telefono ha aperta_il valorizzato e chiusa_il vuoto finché non si chiude;
--  * i promemoria inviati (fase aperta da troppo, fine giornata, giorno dopo) restano in "notifiche":
--    uno solo per operatore, tipo, fase e giorno.
ALTER TABLE rilevazioni ADD COLUMN IF NOT EXISTS aperta_il timestamptz;
ALTER TABLE rilevazioni ADD COLUMN IF NOT EXISTS chiusa_il timestamptz;
CREATE INDEX IF NOT EXISTS rilevazioni_aperte ON rilevazioni (operatore_nome) WHERE aperta_il IS NOT NULL AND chiusa_il IS NULL;

CREATE TABLE IF NOT EXISTS notifiche (
  id             serial PRIMARY KEY,
  sigla          text NOT NULL,                 -- operatore (Impostazioni → Operatori)
  tipo           text NOT NULL CHECK (tipo IN ('durata', 'fine_giornata', 'giorno_dopo')),
  rilevazione_id int REFERENCES rilevazioni(id) ON DELETE SET NULL,
  giorno         date NOT NULL,
  testo          text NOT NULL,
  link           text,
  canale         text NOT NULL DEFAULT 'portale', -- per ora solo nel portale; poi SMS / WhatsApp / Telegram
  esito          text,
  letta_il       timestamptz,
  creato_il      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS notifiche_una_al_giorno ON notifiche (sigla, tipo, coalesce(rilevazione_id, 0), giorno);
