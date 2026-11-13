-- ── Stoccaggio componenti: contenuto degli armadi (Adriano 13/11/2026) ──
-- In attesa delle API degli armadi: si caricano i file del programma degli armadi (ItemList = anagrafica dei codici con i pezzi,
-- reel_archive = bobine con codice univoco). Ogni caricamento sostituisce tutto; restano i prezzi scritti a mano e i prezzi
-- trovati online (per codice). Proprietari (sigle → Casteltech / cliente) e % di riconoscimento in impostazioni 'armadi'.
-- Regole in src/engine/armadi.ts, letture in src/server/armadi-servizio.ts.
CREATE TABLE IF NOT EXISTS armadi_articoli (
  codice text PRIMARY KEY,
  descrizione text,
  descrizione_fonte text,
  proprietario_file text,          -- colonna "fornitore" dell'anagrafica degli armadi (= di chi è)
  quantita integer NOT NULL DEFAULT 0,
  pn text,
  produttore text,
  componente_id integer REFERENCES componenti(id) ON DELETE SET NULL,
  componente_cliente_id integer REFERENCES componenti_clienti(id) ON DELETE SET NULL,
  prezzo_armadio numeric,          -- prezzo scritto nel programma degli armadi
  prezzo numeric,                  -- prezzo usato per il valore (€ a pezzo)
  prezzo_fonte text,               -- manuale | acquisto | online | armadio
  prezzo_data date,
  prezzo_nota text,
  prezzo_manuale numeric,          -- scritto a mano: resta ai caricamenti successivi
  prezzo_online numeric,           -- trovato dai distributori: resta ai caricamenti successivi
  prezzo_online_nota text,
  cercato_online_il timestamptz,
  caricato_il timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS armadi_bobine (
  bobina text PRIMARY KEY,         -- codice univoco della bobina (ReelCode)
  codice text NOT NULL,
  quantita integer NOT NULL DEFAULT 0,
  formato text,
  posizione text,
  produttore text,
  pn text,
  sigla text,                      -- colonna Supplier della bobina (quasi sempre il cliente)
  msl text,
  ultimo_uso text,
  sessione text
);
CREATE INDEX IF NOT EXISTS armadi_bobine_codice ON armadi_bobine (codice);
