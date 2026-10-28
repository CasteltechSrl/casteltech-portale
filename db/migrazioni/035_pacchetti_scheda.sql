-- Documenti della scheda del cliente (Preventivi → Da documenti; Adriano 27/10/2026):
-- un caricamento = un pacchetto (BOM, pick and place, Gerber, forature, CAD). I file originali restano sul Drive del cliente:
-- qui solo i file che servono a rileggere il pacchetto (compressi) e il risultato dell'incrocio.
CREATE TABLE pacchetti_scheda (
  id             serial PRIMARY KEY,
  nome           text NOT NULL,
  cliente_id     int REFERENCES clienti(id),
  creato_da      int REFERENCES utenti(id),
  creato_il      timestamptz NOT NULL DEFAULT now(),
  stato          text NOT NULL DEFAULT 'caricamento',   -- caricamento / analizzato
  file_elenco    jsonb,          -- tutti i file del pacchetto con tipo e note (anche quelli non conservati)
  analisi        jsonb,          -- conteggi, lavorazione, consumi, componenti, segnalazioni
  disegno        bytea,          -- strati Gerber in SVG (JSON compresso)
  fonti          jsonb,          -- quali file sono stati usati
  analizzato_il  timestamptz,
  bom_id         int REFERENCES bom_analisi(id) ON DELETE SET NULL   -- BOM mandata alla codifica (sezione Componenti)
);

CREATE TABLE pacchetti_scheda_file (
  pacchetto_id   int NOT NULL REFERENCES pacchetti_scheda(id) ON DELETE CASCADE,
  nome           text NOT NULL,  -- percorso dentro il pacchetto
  byte           int NOT NULL,   -- dimensione originale
  dati           bytea NOT NULL, -- compresso (gzip)
  PRIMARY KEY (pacchetto_id, nome)
);
