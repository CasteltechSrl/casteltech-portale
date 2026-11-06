-- Flusso di produzione nel cruscotto (Adriano 6/11/2026): cinque finestre (da acquistare, da preparare, in produzione, da spedire,
-- spedite nel mese) con priorità e spunte per ogni riga d'ordine; fine lavorazione sulla commessa; "Spedito" sul DDT.
CREATE TABLE IF NOT EXISTS flusso_righe (
  riga_id        int PRIMARY KEY REFERENCES ordini_righe(id) ON DELETE CASCADE,
  priorita       int,                                      -- scritta a mano (1 = prima); NULL = automatica dalla consegna richiesta
  acquisti       jsonb NOT NULL DEFAULT '{}'::jsonb,       -- {componenti|pcb|lamina|altro:…: {da, il}} cose comprate
  materiale      jsonb NOT NULL DEFAULT '{}'::jsonb,       -- {fase: {da, il}} materiale verificato per fase
  produzione     jsonb NOT NULL DEFAULT '{}'::jsonb,       -- {fase: {da, il}} fasi segnate fatte a mano
  in_produzione  jsonb,                                    -- {da, il} passaggio in produzione dato a mano
  aggiornato_il  timestamptz NOT NULL DEFAULT now()
);
-- fine lavorazione dichiarata (telefono, ufficio, scheda scansionata): [{quantita, da, il, origine, nota}]
ALTER TABLE commesse ADD COLUMN IF NOT EXISTS fine_lavorazione jsonb NOT NULL DEFAULT '[]'::jsonb;
-- DDT: emesso = merce imballata in attesa del corriere; "Spedito" quando il corriere passa
ALTER TABLE documenti ADD COLUMN IF NOT EXISTS partito_il timestamptz;
ALTER TABLE documenti ADD COLUMN IF NOT EXISTS partito_da text;
-- i DDT di prima di oggi si considerano partiti il giorno del documento
UPDATE documenti SET partito_il = data::timestamptz WHERE tipo = 'ddt' AND stato <> 'bozza' AND partito_il IS NULL;
