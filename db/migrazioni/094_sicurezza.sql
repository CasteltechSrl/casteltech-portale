-- ── Sicurezza (Adriano 12/11/2026) ──
-- Schede di sicurezza (SDS) dei prodotti chimici usati in produzione (paste, fili e barre di stagno, flussanti, solventi, coating, colle):
-- il PDF (fino a 4 MB, quelli più grandi restano sul Drive con il percorso), i pericoli della sezione 2 e le parole per riconoscere il prodotto
-- nelle righe degli ordini a fornitore e dei DDT ricevuti. Regole in src/engine/sicurezza.ts.
CREATE TABLE IF NOT EXISTS sicurezza_schede (
  id              serial PRIMARY KEY,
  prodotto        text NOT NULL,                    -- nome commerciale, come sulla scheda
  produttore      text,
  fornitore       text,                             -- da chi lo compriamo
  categoria       text NOT NULL DEFAULT 'altro',    -- CATEGORIE_SOSTANZE
  tipo            text NOT NULL DEFAULT 'sds' CHECK (tipo IN ('sds', 'tds', 'altro')),   -- sds = scheda di sicurezza, tds = scheda tecnica
  revisione       text,
  data_revisione  date,
  lingua          text,
  pericoli        text[] NOT NULL DEFAULT '{}',     -- frasi H della sezione 2 (H225, H319, EUH208…)
  parole          text,                             -- come si riconosce nelle righe: codici MC-…, nomi e codici del prodotto, uno per riga
  nome_file       text,
  file            bytea,
  dimensione      int,
  fonte           text NOT NULL DEFAULT 'caricata' CHECK (fonte IN ('drive', 'internet', 'caricata')),
  url             text,                             -- da dove è stata scaricata (ricerca su internet)
  percorso_drive  text,                             -- dove si trova sul Drive (anche quando il PDF è troppo grande per il portale)
  note            text,
  attiva          boolean NOT NULL DEFAULT true,    -- prodotto non più usato = non attiva (resta in archivio)
  creato_da       text,
  creato_il       timestamptz NOT NULL DEFAULT now(),
  aggiornato_il   timestamptz NOT NULL DEFAULT now()
);

-- Ricerche su internet già fatte per una riga senza scheda: non si ripetono a ogni ordine (costano), si rifanno a mano o dopo 30 giorni.
CREATE TABLE IF NOT EXISTS sicurezza_ricerche (
  chiave      text PRIMARY KEY,                     -- descrizione normalizzata della riga
  descrizione text NOT NULL,
  esito       text NOT NULL,                        -- 'trovata', 'link', 'non_trovata', 'errore'
  scheda_id   int REFERENCES sicurezza_schede(id) ON DELETE SET NULL,
  nota        text,
  cercata_il  timestamptz NOT NULL DEFAULT now()
);

-- Scadenzario del D.Lgs. 81/2008: registri come la Qualità (tabella qualita_voci, sezioni sic_…). Righe di partenza senza date:
-- le date le scrive l'ufficio (o arrivano dai documenti del Drive). Le righe "se presente" si eliminano se non servono.
INSERT INTO qualita_voci (sezione, dati, origine)
SELECT 'sic_adempimenti', jsonb_build_object('adempimento', v.a, 'riferimento', v.r, 'responsabile', v.chi, 'frequenza_mesi', v.f, 'note', v.n), 'file'
FROM (VALUES
  ('DVR – Documento di valutazione dei rischi', 'D.Lgs. 81/08 art. 17, 28, 29', 'Datore di lavoro con RSPP e medico competente, sentito l''RLS', 36, 'Data certa. Da rifare subito quando cambiano macchine, prodotti chimici o organizzazione, e dopo infortuni importanti. 36 mesi = riesame consigliato.'),
  ('Valutazione del rischio chimico (paste, flussanti, solventi, fumi di saldatura)', 'D.Lgs. 81/08 Titolo IX, art. 223', 'Datore di lavoro con RSPP', 36, 'Si basa sulle schede di sicurezza (menu Sicurezza → Schede di sicurezza). Ultima versione nel Drive: "Documento di Valutazione Rischio Chimico_Casteltech.pdf".'),
  ('Valutazione del rumore', 'D.Lgs. 81/08 art. 181, 190', 'RSPP / tecnico competente', 48, 'Almeno ogni 4 anni.'),
  ('Valutazione delle vibrazioni', 'D.Lgs. 81/08 art. 202', 'RSPP', 48, 'Almeno ogni 4 anni (se pertinente: di solito giustificazione nel DVR).'),
  ('Valutazione del rischio incendio e piano di emergenza ed evacuazione', 'DM 2/9/2021 e DM 3/9/2021', 'Datore di lavoro con RSPP', 36, 'Con le planimetrie e i nomi degli addetti.'),
  ('Valutazione dello stress lavoro-correlato', 'D.Lgs. 81/08 art. 28', 'Datore di lavoro con RSPP', 36, ''),
  ('Valutazione campi elettromagnetici e radiazioni ottiche', 'D.Lgs. 81/08 art. 209, 216', 'RSPP', 48, 'Almeno ogni 4 anni (se pertinente).'),
  ('Sopralluogo del medico competente negli ambienti di lavoro', 'D.Lgs. 81/08 art. 25', 'Medico competente', 12, 'Una volta l''anno (o con cadenza diversa decisa nel DVR).'),
  ('Relazione sanitaria annuale e invio dati all''INAIL (Allegato 3B)', 'D.Lgs. 81/08 art. 40', 'Medico competente', 12, 'Entro il 31 marzo dell''anno dopo.'),
  ('Riunione periodica di prevenzione', 'D.Lgs. 81/08 art. 35', 'Datore di lavoro, RSPP, medico, RLS', 12, 'Obbligatoria una volta l''anno oltre 15 lavoratori; sotto i 15 se la chiede l''RLS.'),
  ('MUD – dichiarazione annuale dei rifiuti', 'D.Lgs. 152/06 art. 189', 'Ufficio / consulente rifiuti', 12, 'Entro il 30 aprile per i rifiuti pericolosi dell''anno prima (scorie di stagno, solventi, stracci sporchi). Registro di carico e scarico e RENTRI.')
) AS v(a, r, chi, f, n)
WHERE NOT EXISTS (SELECT 1 FROM qualita_voci WHERE sezione = 'sic_adempimenti');

INSERT INTO qualita_voci (sezione, dati, origine)
SELECT 'sic_emergenza', jsonb_build_object('presidio', v.p, 'identificazione', v.i, 'frequenza_mesi', v.f, 'esito', 'positivo', 'note', v.n), 'file'
FROM (VALUES
  ('estintori', 'TUTTI', 6, 'Controllo periodico ogni 6 mesi (UNI 9994-1) dalla ditta; sorveglianza mensile interna (cartellino, pressione, accesso libero).'),
  ('luci', 'TUTTE', 6, 'Verifica funzionale ogni 6 mesi (UNI 11222).'),
  ('porte', 'USCITE E MANIGLIONI', 6, 'Uscite libere, maniglioni antipanico funzionanti.'),
  ('primo_soccorso', 'CASSETTA', 6, 'Contenuto minimo del DM 388/2003 e date di scadenza dei prodotti.'),
  ('evacuazione', 'PROVA ANNUALE', 12, 'Esercitazione antincendio e di evacuazione una volta l''anno, con verbale.'),
  ('segnaletica', 'PLANIMETRIE', 12, 'Planimetrie di emergenza aggiornate e segnaletica visibile.')
) AS v(p, i, f, n)
WHERE NOT EXISTS (SELECT 1 FROM qualita_voci WHERE sezione = 'sic_emergenza');

INSERT INTO qualita_voci (sezione, dati, origine)
SELECT 'sic_impianti', jsonb_build_object('impianto', v.i, 'verifica', v.v, 'riferimento', v.r, 'frequenza_mesi', v.f, 'esito', 'positivo', 'note', v.n), 'file'
FROM (VALUES
  ('IMPIANTO DI TERRA', 'Verifica periodica da organismo abilitato', 'DPR 462/01', 60, 'Ogni 5 anni (2 anni nei luoghi a maggior rischio). Verbali nel Drive: 8_AZIENDA/Verifica messa a terra e Sicurezza in azienda.'),
  ('IMPIANTO ELETTRICO', 'Controllo di quadri, prese e prolunghe', 'D.Lgs. 81/08 art. 80, 86', 12, 'Controllo interno o dell''elettricista.'),
  ('CALDAIA / IMPIANTO TERMICO', 'Manutenzione e controllo di efficienza energetica (libretto CRITER)', 'DPR 74/2013, DGR Emilia-Romagna', 12, 'Libretto nel Drive: 8_AZIENDA/Libretto CRITER Impianto Termico.'),
  ('ASPIRAZIONE FUMI DI SALDATURA', 'Cambio filtri e controllo dell''aspirazione', 'D.Lgs. 81/08 art. 71', 6, 'Filtri a carboni attivi MC-VAR-002.'),
  ('COMPRESSORE ARIA', 'Manutenzione; verifica del serbatoio se soggetto', 'DM 329/2004', 12, 'Controllare se il serbatoio è soggetto a verifica (pressione × volume).'),
  ('SCAFFALATURE', 'Ispezione annuale', 'UNI EN 15635', 12, ''),
  ('EMISSIONI IN ATMOSFERA', 'Autorizzazione (AUA) e autocontrolli prescritti', 'D.Lgs. 152/06', 12, 'Documenti nel Drive: 8_AZIENDA/Emissioni in atmosfera e Autorizzazione Unica Ambientale.')
) AS v(i, v, r, f, n)
WHERE NOT EXISTS (SELECT 1 FROM qualita_voci WHERE sezione = 'sic_impianti');

INSERT INTO qualita_voci (sezione, dati, origine)
SELECT 'sic_figure', jsonb_build_object('ruolo', v.r, 'persona', v.p), 'file'
FROM (VALUES ('datore', 'DA SCRIVERE'), ('rspp', 'DA SCRIVERE'), ('medico', 'DA SCRIVERE'), ('rls', 'DA SCRIVERE'),
             ('preposto', 'DA SCRIVERE'), ('antincendio', 'DA SCRIVERE'), ('primo_soccorso', 'DA SCRIVERE')) AS v(r, p)
WHERE NOT EXISTS (SELECT 1 FROM qualita_voci WHERE sezione = 'sic_figure');
