-- ── Amministrazione: dati dell'azienda, numerazioni, aliquote IVA, condizioni di pagamento, documenti ──
-- Dal 10/11/2026 Fatture in Cloud non c'è più (Adriano, 26/10/2026): il portale emette DDT, conferme d'ordine,
-- ordini a fornitore, fatture, note di credito e autofatture; l'invio allo SdI passa da Invoicetronic.
-- Valori iniziali presi da Fatture in Cloud il 27/10/2026 (fattura n. 116 e impostazioni dei pagamenti);
-- si modificano da Impostazioni → Amministrazione.

-- Dati dell'azienda (cedente/prestatore nelle fatture): una sola riga in impostazioni
INSERT INTO impostazioni (chiave, valore) VALUES ('azienda', '{
  "ragione_sociale": "CASTELTECH S.R.L.",
  "partita_iva": "01777320332",
  "codice_fiscale": "01777320332",
  "regime_fiscale": "RF01",
  "indirizzo": "STRADA FIORENZUOLA, 8",
  "cap": "29014",
  "comune": "CASTELL''ARQUATO",
  "provincia": "PC",
  "nazione": "IT",
  "rea_ufficio": "",
  "rea_numero": "",
  "capitale_sociale": "",
  "socio_unico": "",
  "telefono": "",
  "email": "info@casteltech.net",
  "pec": "",
  "banca": "BPER - FILIALE DI FIORENZUOLA D''ARDA",
  "iban": "IT37B0538765310000003092938"
}') ON CONFLICT (chiave) DO NOTHING;

-- Numerazioni: un contatore per tipo di documento, sezionale e anno.
-- Il numero si assegna solo quando il documento viene emesso (mai alle bozze), così non restano buchi.
CREATE TABLE numerazioni (
  tipo           text NOT NULL,                 -- fattura, nota_credito, autofattura, ddt, conferma_ordine, ordine_fornitore
  sezionale      text NOT NULL DEFAULT '',      -- es. 'AF' per le autofatture (come in Fatture in Cloud)
  anno           int  NOT NULL,
  ultimo_numero  int  NOT NULL DEFAULT 0,
  ultima_data    date,                          -- data dell'ultimo documento: i nuovi non possono avere una data precedente
  PRIMARY KEY (tipo, sezionale, anno)
);
COMMENT ON TABLE numerazioni IS 'Ultimo numero usato per tipo/sezionale/anno. Valori 2026 da Fatture in Cloud: si riallineano il giorno del passaggio.';
-- situazione in Fatture in Cloud al 27/10/2026
INSERT INTO numerazioni (tipo, sezionale, anno, ultimo_numero, ultima_data) VALUES
  ('fattura', '', 2026, 116, '2026-10-09'),
  ('nota_credito', '', 2026, 4, '2026-03-31'),
  ('autofattura', 'AF', 2026, 92, '2026-10-26'),
  ('ddt', '', 2026, 216, '2026-10-26'),
  ('conferma_ordine', '', 2026, 0, NULL),
  ('ordine_fornitore', '', 2026, 0, NULL);

-- Aliquote IVA e nature (codici della fattura elettronica)
CREATE TABLE aliquote_iva (
  codice                text PRIMARY KEY,
  descrizione           text NOT NULL,
  percentuale           numeric NOT NULL DEFAULT 0,
  natura                text,                   -- N1, N2.1, N3.1 … obbligatoria quando la percentuale è 0
  riferimento_normativo text,                   -- scritto in fattura (es. "Non imponibile art. 8 c. 1 lett. c D.P.R. 633/72")
  soggetta_bollo        boolean NOT NULL DEFAULT false, -- l'importo conta per il bollo da 2 € (sopra 77,47 €)
  ordine                int NOT NULL DEFAULT 0,
  attiva                boolean NOT NULL DEFAULT true,
  CHECK (percentuale > 0 OR natura IS NOT NULL)
);
COMMENT ON TABLE aliquote_iva IS 'Aliquote e nature IVA. Il bollo va verificato con il commercialista per ogni natura.';
INSERT INTO aliquote_iva (codice, descrizione, percentuale, natura, riferimento_normativo, soggetta_bollo, ordine) VALUES
  ('IVA22', 'IVA 22%', 22, NULL, NULL, false, 1),
  ('IVA10', 'IVA 10%', 10, NULL, NULL, false, 2),
  ('IVA4', 'IVA 4%', 4, NULL, NULL, false, 3),
  ('INTENTO', 'Non imponibile - lettera d''intento', 0, 'N3.5', 'Non imponibile art. 8 c. 1 lett. c D.P.R. 633/72', true, 10),
  ('EXPORT', 'Non imponibile - esportazione', 0, 'N3.1', 'Non imponibile art. 8 c. 1 lett. a D.P.R. 633/72', false, 11),
  ('UE_BENI', 'Non imponibile - cessione intracomunitaria', 0, 'N3.2', 'Non imponibile art. 41 D.L. 331/93', false, 12),
  ('UE_SERVIZI', 'Non soggetta - servizi a soggetti esteri', 0, 'N2.1', 'Non soggetta art. 7-ter D.P.R. 633/72', true, 13),
  ('ESCLUSO15', 'Escluso art. 15 (spese anticipate)', 0, 'N1', 'Escluso art. 15 D.P.R. 633/72', true, 14);

-- Condizioni di pagamento (scadenza = data documento + giorni, poi fine mese se richiesto)
CREATE TABLE condizioni_pagamento (
  codice      text PRIMARY KEY,
  descrizione text NOT NULL,
  modalita    text NOT NULL DEFAULT 'MP05',     -- MP01 contanti, MP02 assegno, MP05 bonifico, MP08 carta, MP12 RiBa
  giorni      int  NOT NULL DEFAULT 0,
  fine_mese   boolean NOT NULL DEFAULT false,
  ordine      int  NOT NULL DEFAULT 0,
  attiva      boolean NOT NULL DEFAULT true
);
INSERT INTO condizioni_pagamento (codice, descrizione, modalita, giorni, fine_mese, ordine) VALUES
  ('BB_VISTA', 'Bonifico bancario a vista', 'MP05', 0, false, 1),
  ('BB_30FM', 'Bonifico bancario 30 gg f.m.', 'MP05', 30, true, 2),
  ('BB_60FM', 'Bonifico bancario 60 gg f.m.', 'MP05', 60, true, 3),
  ('RB_30FM', 'RiBa 30 gg f.m.', 'MP12', 30, true, 4),
  ('RB_60FM', 'RiBa 60 gg f.m.', 'MP12', 60, true, 5),
  ('RB_90FM', 'RiBa 90 gg f.m.', 'MP12', 90, true, 6),
  ('CONTANTI', 'Contanti', 'MP01', 0, false, 7);

-- Dati fiscali dei clienti (per fatture e DDT); tutto in MAIUSCOLO tranne email e PEC
ALTER TABLE clienti
  ADD COLUMN codice_fiscale        text,
  ADD COLUMN indirizzo             text,
  ADD COLUMN cap                   text,
  ADD COLUMN comune                text,
  ADD COLUMN provincia             text,
  ADD COLUMN nazione               text NOT NULL DEFAULT 'IT',   -- codice ISO a 2 lettere, come nella fattura elettronica
  ADD COLUMN codice_sdi            text,                         -- 7 caratteri (6 per la Pubblica Amministrazione)
  ADD COLUMN pec                   text,
  ADD COLUMN email_amministrazione text,
  ADD COLUMN condizione_pagamento  text REFERENCES condizioni_pagamento(codice) ON UPDATE CASCADE,
  ADD COLUMN aliquota_iva          text REFERENCES aliquote_iva(codice) ON UPDATE CASCADE,  -- vuota = IVA 22%
  ADD COLUMN banca_appoggio        text,                         -- per le RiBa: banca o IBAN del cliente
  ADD COLUMN pubblica_amministrazione boolean NOT NULL DEFAULT false,
  ADD COLUMN split_payment         boolean NOT NULL DEFAULT false;

-- Lettere d'intento ricevute dai clienti (esportatori abituali): protocollo e plafond
CREATE TABLE dichiarazioni_intento (
  id              serial PRIMARY KEY,
  cliente_id      int NOT NULL REFERENCES clienti(id),
  protocollo      text NOT NULL UNIQUE,          -- protocollo di ricezione dell'Agenzia (es. 26021609544759358-000006)
  data_protocollo date NOT NULL,
  anno            int NOT NULL,
  plafond         numeric,                       -- importo massimo indicato nella lettera (vuoto = non indicato)
  file            text,
  note            text,
  creato_il       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON dichiarazioni_intento (cliente_id, anno);

-- Documenti: un solo modello per fatture, note di credito, autofatture, DDT, conferme d'ordine e ordini a fornitore
CREATE TABLE documenti (
  id                 serial PRIMARY KEY,
  tipo               text NOT NULL CHECK (tipo IN ('fattura', 'nota_credito', 'autofattura', 'ddt', 'conferma_ordine', 'ordine_fornitore')),
  tipo_sdi           text,                       -- TD01, TD04, TD17, TD18, TD19 (solo documenti fiscali)
  sezionale          text NOT NULL DEFAULT '',
  anno               int  NOT NULL,
  numero             int,                        -- vuoto finché il documento è una bozza
  data               date NOT NULL,
  stato              text NOT NULL DEFAULT 'bozza'
                       CHECK (stato IN ('bozza', 'emesso', 'inviato', 'consegnato', 'non_consegnato', 'scartato', 'annullato')),
  cliente_id         int REFERENCES clienti(id),
  fornitore_id       int REFERENCES fornitori_anagrafica(id),
  intestatario       jsonb,                      -- copia dei dati del cliente/fornitore al momento dell'emissione
  ordine_id          int REFERENCES ordini(id) ON DELETE SET NULL,
  documento_origine_id int REFERENCES documenti(id),   -- nota di credito → fattura; autofattura → fattura del fornitore estero
  riferimento_esterno text,                      -- n. ordine del cliente, n. fattura estera…
  dichiarazione_intento_id int REFERENCES dichiarazioni_intento(id),
  condizione_pagamento text REFERENCES condizioni_pagamento(codice) ON UPDATE CASCADE,
  causale            text,
  note               text,
  imponibile         numeric NOT NULL DEFAULT 0,
  imposta            numeric NOT NULL DEFAULT 0,
  bollo              numeric NOT NULL DEFAULT 0,
  totale             numeric NOT NULL DEFAULT 0,
  -- invio allo SdI (Invoicetronic)
  sdi_id             text,                       -- identificativo del documento in Invoicetronic
  sdi_identificativo text,                       -- identificativo SdI
  sdi_stato          text,
  sdi_messaggio      text,
  xml                text,                       -- file FatturaPA inviato (resta anche nei backup)
  inviato_il         timestamptz,
  creato_da          int REFERENCES utenti(id),
  creato_il          timestamptz NOT NULL DEFAULT now(),
  aggiornato_il      timestamptz NOT NULL DEFAULT now(),
  CHECK (numero IS NOT NULL OR stato = 'bozza')
);
CREATE UNIQUE INDEX documenti_numero_unico ON documenti (tipo, sezionale, anno, numero) WHERE numero IS NOT NULL;
CREATE INDEX ON documenti (cliente_id);
CREATE INDEX ON documenti (ordine_id);
COMMENT ON TABLE documenti IS 'Documenti emessi dal portale. Il numero si assegna all''emissione (tabella numerazioni).';

CREATE TABLE documenti_righe (
  id              serial PRIMARY KEY,
  documento_id    int NOT NULL REFERENCES documenti(id) ON DELETE CASCADE,
  posizione       int NOT NULL DEFAULT 0,
  solo_descrizione boolean NOT NULL DEFAULT false, -- riga di testo (es. "DDT n. 195 del 05/10/2026")
  prodotto_id     int REFERENCES prodotti(id),
  codice          text,
  descrizione     text NOT NULL DEFAULT '',
  quantita        numeric NOT NULL DEFAULT 1,
  um              text,
  prezzo          numeric NOT NULL DEFAULT 0,
  sconto          numeric NOT NULL DEFAULT 0,    -- in percentuale
  aliquota_iva    text REFERENCES aliquote_iva(codice) ON UPDATE CASCADE,
  riga_ordine_id  int REFERENCES ordini_righe(id) ON DELETE SET NULL,
  ddt_id          int REFERENCES documenti(id),  -- riga di fattura che viene da un DDT
  commessa_id     int REFERENCES commesse(id) ON DELETE SET NULL
);
CREATE INDEX ON documenti_righe (documento_id);

CREATE TABLE documenti_scadenze (
  id            serial PRIMARY KEY,
  documento_id  int NOT NULL REFERENCES documenti(id) ON DELETE CASCADE,
  data          date NOT NULL,
  importo       numeric NOT NULL,
  modalita      text NOT NULL DEFAULT 'MP05',
  pagata_il     date
);
CREATE INDEX ON documenti_scadenze (data) WHERE pagata_il IS NULL;
