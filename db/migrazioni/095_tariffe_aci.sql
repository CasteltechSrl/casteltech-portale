-- ── Tariffe chilometriche ACI (Adriano 12/11/2026) ──
-- Le tabelle nazionali dei costi chilometrici dell'ACI (Gazzetta Ufficiale, supplemento ordinario di dicembre, valgono dal 1° gennaio):
-- una riga per modello e anno, caricate dal PDF della Gazzetta in Dipendenti → Persone e auto. Regole in src/engine/tariffe-aci.ts.
CREATE TABLE IF NOT EXISTS tariffe_aci (
  id            serial PRIMARY KEY,
  anno          int NOT NULL,
  id_aci        int,                              -- "ID Modello" dell'ACI (uguale da un anno all'altro)
  marca         text NOT NULL,
  modello       text NOT NULL,
  alimentazione text NOT NULL,
  produzione    boolean NOT NULL DEFAULT true,     -- false = fuori produzione
  costo_km      numeric(8,4) NOT NULL              -- € al km, percorrenza di 15.000 km all'anno
);
CREATE INDEX IF NOT EXISTS tariffe_aci_anno ON tariffe_aci (anno);

-- L'auto ricorda la riga ACI da cui ha preso la tariffa: con le tabelle dell'anno dopo il portale propone la tariffa nuova.
ALTER TABLE rimborsi_veicoli ADD COLUMN IF NOT EXISTS aci_id int;
ALTER TABLE rimborsi_veicoli ADD COLUMN IF NOT EXISTS aci_anno int;
ALTER TABLE rimborsi_veicoli ADD COLUMN IF NOT EXISTS aci_testo text;
