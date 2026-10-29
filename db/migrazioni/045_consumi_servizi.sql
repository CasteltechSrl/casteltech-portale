-- Consumi dei servizi esterni usati dal portale (Adriano 29/10/2026: "non so quanti token uso, quante risorse di Render, quali limiti sto raggiungendo").
-- Una riga per giorno, servizio e voce (es. ia / lettura ordini, mouser / prezzi): i contatori si sommano in memoria e si salvano
-- tutti insieme qualche secondo dopo l'ultima chiamata (niente scritture per ogni richiesta, niente timer periodici).
CREATE TABLE IF NOT EXISTS consumi_servizi (
  giorno date NOT NULL,
  servizio text NOT NULL,
  voce text NOT NULL DEFAULT '',
  chiamate integer NOT NULL DEFAULT 0,
  errori integer NOT NULL DEFAULT 0,
  token_ingresso bigint NOT NULL DEFAULT 0,
  token_uscita bigint NOT NULL DEFAULT 0,
  token_cache bigint NOT NULL DEFAULT 0,
  costo_usd numeric(12, 4) NOT NULL DEFAULT 0,
  PRIMARY KEY (giorno, servizio, voce)
);

-- Fatti da ricordare: avvii del portale (per riconoscere i riavvii di Render non dovuti a una pubblicazione), errori dei servizi
-- (credito dell'IA finito, chiavi non valide, limiti raggiunti). Si tengono 90 giorni.
CREATE TABLE IF NOT EXISTS eventi_servizi (
  id bigserial PRIMARY KEY,
  il timestamptz NOT NULL DEFAULT now(),
  servizio text NOT NULL,
  tipo text NOT NULL,
  messaggio text NOT NULL DEFAULT '',
  dati jsonb
);
CREATE INDEX IF NOT EXISTS eventi_servizi_il ON eventi_servizi (servizio, il DESC);
