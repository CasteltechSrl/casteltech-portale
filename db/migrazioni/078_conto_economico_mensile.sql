-- Punto di pareggio (Adriano 6/11/2026): il bilancino mensile del commercialista, un valore per conto e mese
-- (importo del mese e saldo progressivo dall'inizio dell'anno), caricato dall'Excel in Impostazioni → Amministrazione.
-- I bilanci ufficiali (anno intero, dai PDF depositati) stanno in impostazioni con chiave 'bilanci_ufficiali'.
CREATE TABLE IF NOT EXISTS conto_economico_mensile (
  id           serial PRIMARY KEY,
  anno         int NOT NULL,
  mese         int NOT NULL CHECK (mese BETWEEN 1 AND 12),
  conto        text NOT NULL,                         -- conto del commercialista a 8 cifre (70200001 materie prime, 80300001 ricavi…)
  descrizione  text NOT NULL,
  importo      numeric(14,2) NOT NULL DEFAULT 0,      -- valore del mese
  progressivo  numeric(14,2) NOT NULL DEFAULT 0,      -- saldo dall'inizio dell'anno, come nel bilancino
  fonte        text NOT NULL DEFAULT 'commercialista',
  caricato_il  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (anno, mese, conto)
);
