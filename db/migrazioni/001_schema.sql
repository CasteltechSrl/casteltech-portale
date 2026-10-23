-- ════════════════════════════════════════════════════════════════════════════
--  Casteltech portale — schema database (PostgreSQL)
--  Ogni tabella ha un commento che spiega a cosa serve, in italiano.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Utenti e ruoli ──────────────────────────────────────────────────────────
CREATE TABLE utenti (
  id            serial PRIMARY KEY,
  nome          text NOT NULL,
  email         text UNIQUE,                 -- obbligatoria per l'ufficio; la produzione può entrare con PIN
  password_hash text,
  pin_hash      text,                        -- accesso rapido da tablet/telefono in reparto
  ruolo         text NOT NULL CHECK (ruolo IN ('ufficio', 'produzione')),
  attivo        boolean NOT NULL DEFAULT true,
  creato_il     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE utenti IS 'Ufficio = controllo completo. Produzione = solo inserimento tempi e note sulle proprie schede.';

-- ── Impostazioni generali (tariffe di default) ──────────────────────────────
CREATE TABLE impostazioni (
  chiave  text PRIMARY KEY,
  valore  jsonb NOT NULL,
  aggiornato_il timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE impostazioni IS 'Es. tariffe: {"costoAziendaH":25,"costoOperatoreProduzioneH":15,"costoOperatoreUfficioH":35,"ricarico":1.25}';

-- ── Catalogo: parametri, fasi, voci di costo, materiali (modificabili dal pannello) ──
CREATE TABLE parametri (
  codice       text PRIMARY KEY,             -- nome usato nelle formule (es. qtFeeder)
  etichetta    text NOT NULL,
  unita        text NOT NULL DEFAULT '',
  gruppo       text NOT NULL,
  valore_default numeric,
  suggerimento text,
  tipo         text NOT NULL DEFAULT 'numero' CHECK (tipo IN ('numero', 'si_no')),
  ordine       int NOT NULL DEFAULT 0,
  attivo       boolean NOT NULL DEFAULT true
);

CREATE TABLE fasi (
  codice          text PRIMARY KEY,
  numero          text NOT NULL,             -- numero sulla scheda di produzione: A, 1T, 13…
  nome            text NOT NULL,
  gruppo          text NOT NULL,             -- PRE-PRODUZIONE, SMD, THT, COMPLETAMENTO, IMBALLAGGIO
  formula_secondi text NOT NULL,             -- tempo CICLO del lotto, in secondi
  persone_default numeric NOT NULL DEFAULT 1,
  tariffa         text NOT NULL DEFAULT 'produzione' CHECK (tariffa IN ('produzione', 'ufficio')),
  una_tantum      boolean NOT NULL DEFAULT false,
  scala           text NOT NULL DEFAULT 'scheda' CHECK (scala IN ('fisso', 'scheda', 'pannello')),
  ordine          int NOT NULL DEFAULT 0,
  attiva          boolean NOT NULL DEFAULT true,
  stampa_su_scheda boolean NOT NULL DEFAULT true
);
COMMENT ON COLUMN fasi.scala IS 'Come si riporta un tempo reale a una quantità diversa: fisso (attrezzaggi), scheda, pannello.';

CREATE TABLE voci_costo (
  codice       text PRIMARY KEY,
  nome         text NOT NULL,
  gruppo       text NOT NULL,
  formula_euro text NOT NULL,
  una_tantum   boolean NOT NULL DEFAULT false,
  ordine       int NOT NULL DEFAULT 0,
  attiva       boolean NOT NULL DEFAULT true
);

CREATE TABLE materiali (
  codice      text PRIMARY KEY,              -- nelle formule: prezzo_<codice>, qta_<codice>
  descrizione text NOT NULL,
  costo       numeric NOT NULL,
  um          text NOT NULL,
  quantita    numeric,
  aggiornato_il timestamptz NOT NULL DEFAULT now()
);

-- ── Anagrafiche (sincronizzate con mOKa) ────────────────────────────────────
CREATE TABLE clienti (
  id             serial PRIMARY KEY,
  ragione_sociale text NOT NULL,
  partita_iva    text,
  moka_id        text UNIQUE,                -- identificativo in mOKa
  note           text,
  creato_il      timestamptz NOT NULL DEFAULT now(),
  aggiornato_il  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON clienti (lower(ragione_sociale));

CREATE TABLE prodotti (
  id            serial PRIMARY KEY,
  cliente_id    int NOT NULL REFERENCES clienti(id),
  codice        text NOT NULL,               -- codice cliente / codice articolo
  descrizione   text,
  moka_id       text UNIQUE,
  creato_il     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cliente_id, codice)
);
COMMENT ON TABLE prodotti IS 'Il prodotto del cliente. Le revisioni stanno in prodotti_revisioni: lo storico è unico per prodotto.';

CREATE TABLE prodotti_revisioni (
  id            serial PRIMARY KEY,
  prodotto_id   int NOT NULL REFERENCES prodotti(id),
  revisione     text NOT NULL DEFAULT '',
  storico_separato boolean NOT NULL DEFAULT false, -- "casi particolari": revisione da trattare come prodotto nuovo
  -- scheda tecnica (intestazione della MASTERspec): programmi, lamine, paste, note di montaggio…
  scheda_tecnica jsonb NOT NULL DEFAULT '{}'::jsonb,
  creato_il     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prodotto_id, revisione)
);
COMMENT ON COLUMN prodotti_revisioni.scheda_tecnica IS
  'Es. {"progArmadio":{"top":"","bot":""},"progSerigrafia":…,"lamina":…,"pasta":…,"progPePFox":…,"progPePIpulse":…,"progForno":…,"progAOI":…,"pastaSaldante":"","stagnoSaldatrice":"","flussante":"","filo":"","noteMontaggio":"","qtaPannello":""}';

-- ── Preventivi ──────────────────────────────────────────────────────────────
CREATE TABLE preventivi (
  id              serial PRIMARY KEY,
  numero          text UNIQUE,               -- es. P-2026-0001
  cliente_id      int REFERENCES clienti(id),
  revisione_id    int REFERENCES prodotti_revisioni(id),
  n_schede        int NOT NULL,
  n_schede_pannello int NOT NULL DEFAULT 1,
  tariffe         jsonb NOT NULL,            -- fotografia delle tariffe usate
  parametri       jsonb NOT NULL,            -- dati inseriti
  persone_fase    jsonb NOT NULL DEFAULT '{}'::jsonb,
  catalogo        jsonb NOT NULL,            -- fotografia di fasi/voci/materiali usati: il preventivo resta ricalcolabile identico
  risultato       jsonb NOT NULL,            -- tempi e prezzi per fase e totali
  totale_primo_lotto   numeric NOT NULL,
  totale_secondo_lotto numeric NOT NULL,
  prezzo_target_scheda numeric,
  stato           text NOT NULL DEFAULT 'bozza' CHECK (stato IN ('bozza', 'inviato', 'accettato', 'rifiutato', 'archiviato')),
  origine         text NOT NULL DEFAULT 'nuovo' CHECK (origine IN ('nuovo', 'vecchio_portale', 'prezzo_corretto')),
  legacy_id       text UNIQUE,               -- _id del vecchio portale, se importato
  moka_id         text,
  note            text,
  creato_da       int REFERENCES utenti(id),
  creato_il       timestamptz NOT NULL DEFAULT now(),
  aggiornato_il   timestamptz NOT NULL DEFAULT now()
);

-- ── Commesse (preventivo diventato ordine) ──────────────────────────────────
CREATE TABLE commesse (
  id              serial PRIMARY KEY,
  numero          text UNIQUE NOT NULL,      -- numero commessa (da mOKa o interno)
  preventivo_id   int REFERENCES preventivi(id),
  revisione_id    int NOT NULL REFERENCES prodotti_revisioni(id),
  cliente_id      int NOT NULL REFERENCES clienti(id),
  ordine_cliente  text,
  ordine_interno  text,
  data_ordine     date,
  data_consegna   date,
  quantita        int NOT NULL,
  n_pannelli      int,
  primo_lotto     boolean NOT NULL DEFAULT false, -- paga i costi una tantum?
  prezzo_venduto  numeric,                   -- se diverso dal preventivo
  stato           text NOT NULL DEFAULT 'aperta'
                  CHECK (stato IN ('aperta', 'in_produzione', 'rientrata', 'analizzata', 'chiusa')),
  codice_qr       text UNIQUE NOT NULL,      -- stampato sulla scheda: apre questa commessa
  moka_id         text,
  creato_il       timestamptz NOT NULL DEFAULT now()
);

-- fasi previste sulla scheda stampata, con tempi preventivati e "ultima produzione"
CREATE TABLE commesse_fasi (
  commessa_id     int NOT NULL REFERENCES commesse(id) ON DELETE CASCADE,
  fase_codice     text NOT NULL REFERENCES fasi(codice),
  ordine          int NOT NULL,
  persone_previste numeric NOT NULL,
  ciclo_previsto_sec numeric NOT NULL,
  uomo_previsto_sec  numeric NOT NULL,
  ciclo_ultima_prod_sec numeric,            -- ultima produzione dello stesso prodotto, riportata a questa quantità
  PRIMARY KEY (commessa_id, fase_codice)
);

-- righe scritte sulla scheda (a mano, poi lette da scansione o inserite da tablet)
CREATE TABLE rilevazioni (
  id            serial PRIMARY KEY,
  commessa_id   int NOT NULL REFERENCES commesse(id) ON DELETE CASCADE,
  fase_codice   text NOT NULL REFERENCES fasi(codice),
  operatore_id  int REFERENCES utenti(id),
  operatore_nome text,                      -- come scritto sulla scheda
  data          date NOT NULL,
  ora_inizio    time NOT NULL,
  ora_fine      time NOT NULL,
  persone       numeric NOT NULL DEFAULT 1,
  pezzi         int,
  tipo          text NOT NULL DEFAULT 'S' CHECK (tipo IN ('S', 'P')), -- S standard, P problema contingente
  causa         text,
  materiale     text,
  note          text,
  origine       text NOT NULL DEFAULT 'manuale' CHECK (origine IN ('manuale', 'scansione', 'tablet')),
  scansione_id  int,
  da_verificare boolean NOT NULL DEFAULT false, -- lettura automatica incerta
  confermata_da int REFERENCES utenti(id),       -- l'ufficio conferma S/P
  confermata_il timestamptz,
  creato_il     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON rilevazioni (commessa_id, fase_codice);

CREATE TABLE scansioni (
  id           serial PRIMARY KEY,
  commessa_id  int REFERENCES commesse(id),
  file_nome    text NOT NULL,
  contenuto    bytea,                        -- immagine compressa della scheda
  estrazione   jsonb,                        -- cosa ha letto Claude, con le incertezze
  stato        text NOT NULL DEFAULT 'da_elaborare' CHECK (stato IN ('da_elaborare', 'da_verificare', 'confermata', 'errore')),
  caricata_da  int REFERENCES utenti(id),
  caricata_il  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE rilevazioni ADD FOREIGN KEY (scansione_id) REFERENCES scansioni(id);

-- ── Storico prodotto: segnalazioni da produzione, cliente, ufficio ──────────
CREATE TABLE segnalazioni (
  id           serial PRIMARY KEY,
  prodotto_id  int NOT NULL REFERENCES prodotti(id),
  revisione_id int REFERENCES prodotti_revisioni(id),
  commessa_id  int REFERENCES commesse(id),
  fase_codice  text REFERENCES fasi(codice),
  origine      text NOT NULL CHECK (origine IN ('produzione', 'cliente', 'ufficio')),
  categoria    text,                         -- es. componente, programma, attrezzatura, qualità, reso
  testo        text NOT NULL,
  rilevante_prossime boolean NOT NULL DEFAULT true, -- da stampare sulle prossime schede
  autore_id    int REFERENCES utenti(id),
  creato_il    timestamptz NOT NULL DEFAULT now()
);

-- ── Analisi della commessa rientrata ────────────────────────────────────────
CREATE TABLE analisi_commesse (
  commessa_id     int PRIMARY KEY REFERENCES commesse(id),
  risultato       jsonb NOT NULL,            -- confronto fase per fase (vedi src/engine/consuntivo.ts)
  prezzo_venduto  numeric NOT NULL,
  costo_previsto  numeric NOT NULL,
  costo_reale     numeric NOT NULL,
  margine_previsto numeric NOT NULL,
  margine_reale   numeric NOT NULL,
  costo_problemi  numeric NOT NULL,
  fattori_correzione jsonb NOT NULL,
  prezzo_proposto_scheda numeric,
  nuovo_preventivo_id int REFERENCES preventivi(id),
  note_ufficio    text,
  analizzata_da   int REFERENCES utenti(id),
  analizzata_il   timestamptz NOT NULL DEFAULT now()
);

-- ── Vista comoda per interrogare lo storico ─────────────────────────────────
CREATE VIEW storico_commesse AS
SELECT c.numero AS commessa, cl.ragione_sociale AS cliente, p.codice AS prodotto, r.revisione,
       c.quantita, c.data_consegna, c.stato,
       a.prezzo_venduto, a.costo_reale, a.margine_reale, a.margine_previsto, a.costo_problemi,
       a.prezzo_proposto_scheda, a.analizzata_il
FROM commesse c
JOIN clienti cl ON cl.id = c.cliente_id
JOIN prodotti_revisioni r ON r.id = c.revisione_id
JOIN prodotti p ON p.id = r.prodotto_id
LEFT JOIN analisi_commesse a ON a.commessa_id = c.id;

-- ── Dati del vecchio portale e numerazione ──────────────────────────────────
ALTER TABLE preventivi ADD COLUMN dati_vecchio_portale jsonb;   -- totali come li aveva calcolati il vecchio portale
CREATE SEQUENCE numerazione_preventivi;
ALTER TABLE preventivi ADD COLUMN intestazione jsonb NOT NULL DEFAULT '{}'::jsonb;   -- cliente, codice, revisione, descrizione come scritti
ALTER TABLE preventivi ADD COLUMN prezzi_materiali jsonb NOT NULL DEFAULT '{}'::jsonb;
