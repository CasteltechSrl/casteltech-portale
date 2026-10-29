/**
 * Pannello "Portale Casteltech" dentro Gmail (Adriano, 29/10/2026).
 * Nel pannello a destra: le ultime mail con allegati (e una ricerca); si sceglie la mail e compaiono i tasti Preventivo, Ordine e Fattura estera:
 *  - Preventivo: testo della mail + allegati utili → Preventivi → Documenti del cliente (l'analisi parte da sola);
 *  - Ordine / Fattura estera: la mail intera → Ordini → Da acquisire (la legge l'IA come i file della cartella Drive).
 * Il portale riceve tutto in src/server/rotte/gmail.ts. Installazione: tools/gmail-addon/LEGGIMI.md.
 *
 * Proprietà dello script (Impostazioni progetto → Proprietà script), mai scritte qui:
 *   PORTALE_URL    es. https://casteltech-portale.onrender.com
 *   PORTALE_CHIAVE la stessa di GMAIL_ADDON_CHIAVE su Render
 */

var ETICHETTE = { preventivo: 'Preventivo', ordine: 'Ordine', fattura_estera: 'Fattura estera', aggiunta: 'File aggiunti' };

function impostazioni_() {
  var p = PropertiesService.getScriptProperties();
  var url = (p.getProperty('PORTALE_URL') || '').replace(/\/+$/, '');
  var chiave = p.getProperty('PORTALE_CHIAVE') || '';
  if (!url || !chiave) throw new Error('Pannello non configurato: mancano PORTALE_URL o PORTALE_CHIAVE nelle proprietà dello script.');
  return { url: url, chiave: chiave };
}

function chiama_(percorso, opzioni) {
  var imp = impostazioni_();
  var o = opzioni || {};
  o.headers = { 'x-chiave-portale': imp.chiave };
  o.muteHttpExceptions = true;
  var r = UrlFetchApp.fetch(imp.url + percorso, o);
  return leggiRisposta_(r);
}

function leggiRisposta_(r) {
  var corpo = {};
  try { corpo = JSON.parse(r.getContentText()); } catch (e) { corpo = {}; }
  if (r.getResponseCode() >= 300) throw new Error(corpo.errore || ('Il portale ha risposto con errore ' + r.getResponseCode()));
  return corpo;
}

/** La mail scelta dall'elenco (parametro id) o quella aperta in Gmail (quando Gmail lo dice al pannello). */
function messaggio_(e) {
  if (e.parameters && e.parameters.id) return GmailApp.getMessageById(e.parameters.id);
  GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
  return GmailApp.getMessageById(e.gmail.messageId);
}

var RICERCA_STANDARD = 'in:inbox has:attachment newer_than:14d';

/** Allegati veri (non le immagini dentro il testo), con i nomi resi unici: due "BOM.xlsx" diventano "BOM.xlsx" e "BOM (2).xlsx". */
function allegati_(m) {
  var visti = {};
  return m.getAttachments({ includeInlineImages: false }).map(function (a) {
    var nome = a.getName() || 'allegato';
    var n = 1, prova = nome;
    while (visti[prova.toLowerCase()]) { n++; prova = nome.replace(/(\.[^.]+)?$/, ' (' + n + ')$1'); }
    visti[prova.toLowerCase()] = true;
    return { nome: prova, allegato: a };
  });
}

// ───────────────────────────── schede del pannello ─────────────────────────────

/**
 * Pagina iniziale: le ultime mail con allegati (o quelle cercate), ognuna con il tasto per sceglierla.
 * Serve anche quando Gmail non passa al pannello la mail aperta (29/10/2026: su info@ succedeva sempre).
 */
function paginaIniziale(e) {
  var cercato = (e && e.formInput && e.formInput.cerca) || '';
  var ricerca = cercato ? cercato + ' in:anywhere -in:trash -in:spam' : RICERCA_STANDARD;
  var elenco = CardService.newCardSection().setHeader(cercato ? 'Trovate per «' + cercato + '»' : 'Ultime mail con allegati');
  var discussioni = GmailApp.search(ricerca, 0, 15);
  discussioni.forEach(function (d) {
    var m = sceltaDellaDiscussione_(d);
    var n = m.getAttachments({ includeInlineImages: false }).length;
    elenco.addWidget(CardService.newDecoratedText()
      .setTopLabel(nomeMittente_(m.getFrom()) + ' · ' + Utilities.formatDate(m.getDate(), 'Europe/Rome', 'dd/MM HH:mm') + (n ? ' · ' + n + ' allegati' : ''))
      .setText(m.getSubject() || '(senza oggetto)').setWrapText(true)
      .setOnClickAction(CardService.newAction().setFunctionName('scegliMail').setParameters({ id: m.getId() })));
  });
  if (!discussioni.length) elenco.addWidget(CardService.newTextParagraph().setText('Nessuna mail trovata.'));
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Portale Casteltech'))
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newTextInput().setFieldName('cerca').setTitle('Cerca una mail (cliente, oggetto, codice…)').setValue(cercato))
      .addWidget(CardService.newButtonSet()
        .addButton(CardService.newTextButton().setText('Cerca').setOnClickAction(CardService.newAction().setFunctionName('cercaMail')))
        .addButton(CardService.newTextButton().setText('Prova il collegamento').setOnClickAction(CardService.newAction().setFunctionName('provaCollegamento')))))
    .addSection(elenco)
    .build();
}

/** Della discussione si propone l'ultima mail arrivata con allegati (le risposte di Casteltech di solito non li hanno). */
function sceltaDellaDiscussione_(d) {
  var mail = d.getMessages();
  for (var i = mail.length - 1; i >= 0; i--) if (mail[i].getAttachments({ includeInlineImages: false }).length) return mail[i];
  return mail[mail.length - 1];
}

function nomeMittente_(da) {
  var m = /^\s*"?([^"<]+?)"?\s*</.exec(da);
  return m ? m[1] : da;
}

function cercaMail(e) {
  return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().updateCard(paginaIniziale(e))).build();
}

function scegliMail(e) {
  return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().pushCard(schedaMail_(messaggio_(e)))).build();
}

function provaCollegamento() {
  var testo;
  try {
    var r = chiama_('/api/gmail/prova?utente=' + encodeURIComponent(Session.getActiveUser().getEmail()), { method: 'get' });
    testo = r.utente ? 'Collegato al portale come ' + r.utente + '.' : 'Collegato al portale (la tua email non è tra gli utenti ufficio: i caricamenti restano senza nome).';
  } catch (err) { testo = 'Non collegato: ' + err.message; }
  return CardService.newActionResponseBuilder().setNotification(CardService.newNotification().setText(testo)).build();
}

function apriMail(e) {
  return schedaMail_(messaggio_(e));
}

/** La mail con i tre tasti: Preventivo, Ordine, Fattura estera. */
function schedaMail_(m) {
  var lista = allegati_(m);
  var sezione = CardService.newCardSection()
    .addWidget(CardService.newDecoratedText().setTopLabel('Da').setText(m.getFrom()).setWrapText(true))
    .addWidget(CardService.newDecoratedText().setTopLabel('Oggetto').setText(m.getSubject() || '(senza oggetto)').setWrapText(true))
    .addWidget(CardService.newDecoratedText().setTopLabel('Allegati').setWrapText(true)
      .setText(lista.length ? lista.map(function (x) { return x.nome; }).join(', ') : 'nessuno'));
  var tasti = CardService.newButtonSet();
  ['preventivo', 'ordine', 'fattura_estera'].forEach(function (tipo) {
    tasti.addButton(CardService.newTextButton().setText(ETICHETTE[tipo])
      .setTextButtonStyle(tipo === 'preventivo' ? CardService.TextButtonStyle.FILLED : CardService.TextButtonStyle.OUTLINED)
      .setOnClickAction(CardService.newAction().setFunctionName('manda').setParameters({ tipo: tipo, id: m.getId() })
        .setLoadIndicator(CardService.LoadIndicator.SPINNER)));
  });
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Manda al portale'))
    .addSection(sezione)
    .addSection(CardService.newCardSection().addWidget(tasti)
      .addWidget(CardService.newTextButton().setText('Aggiungi a documenti già caricati')
        .setOnClickAction(CardService.newAction().setFunctionName('scegliPacchetto').setParameters({ id: m.getId() })))
      .addWidget(CardService.newTextParagraph().setText(
        '<font color="#666666">Preventivo: testo e allegati vanno nei Documenti del cliente. Ordine e Fattura estera: la mail va in Da acquisire e la legge l\'IA.</font>')))
    .build();
}

function manda(e) {
  var tipo = e.parameters.tipo;
  try {
    var m = messaggio_(e);
    var esito = tipo === 'aggiunta' ? mandaPreventivo_(m, e.parameters.pacchetto) : tipo === 'preventivo' ? mandaPreventivo_(m) : mandaEmail_(m, tipo);
    var card = CardService.newCardBuilder()
      .setHeader(CardService.newCardHeader().setTitle(ETICHETTE[tipo] + ': mandato al portale'))
      .addSection(CardService.newCardSection()
        .addWidget(CardService.newTextParagraph().setText(esito.testo))
        .addWidget(CardService.newTextButton().setText('Apri nel portale')
          .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
          .setOpenLink(CardService.newOpenLink().setUrl(esito.link))))
      .build();
    return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().pushCard(card)).build();
  } catch (err) {
    return CardService.newActionResponseBuilder().setNotification(CardService.newNotification().setText('Non mandato: ' + err.message)).build();
  }
}

/** File arrivati in una mail successiva (es. BOM in testo): si sceglie il pacchetto già caricato a cui aggiungerli. */
function scegliPacchetto(e) {
  try {
    var m = messaggio_(e);
    var elenco = chiama_('/api/gmail/pacchetti?mittente=' + encodeURIComponent(m.getFrom()), { method: 'get' });
    var sezione = CardService.newCardSection().setHeader('Aggiungi gli allegati di «' + (m.getSubject() || 'questa mail') + '» a:');
    elenco.forEach(function (p) {
      sezione.addWidget(CardService.newDecoratedText().setTopLabel((p.cliente || 'cliente da scegliere') + ' · ' + p.data).setText(p.nome).setWrapText(true)
        .setOnClickAction(CardService.newAction().setFunctionName('manda').setParameters({ tipo: 'aggiunta', id: m.getId(), pacchetto: String(p.id) })
          .setLoadIndicator(CardService.LoadIndicator.SPINNER)));
    });
    if (!elenco.length) sezione.addWidget(CardService.newTextParagraph().setText('Nessun pacchetto caricato negli ultimi 90 giorni.'));
    var card = CardService.newCardBuilder().setHeader(CardService.newCardHeader().setTitle('Documenti già caricati')).addSection(sezione).build();
    return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().pushCard(card)).build();
  } catch (err) {
    return CardService.newActionResponseBuilder().setNotification(CardService.newNotification().setText('Non riuscito: ' + err.message)).build();
  }
}

// ───────────────────────────── invii ─────────────────────────────

/**
 * Preventivo: 1) email e nomi degli allegati, 2) solo i file che il portale chiede, tutti insieme, 3) parte l'analisi.
 * Con `pacchetto` gli allegati si aggiungono a un pacchetto già caricato (e alle sue versioni) invece di crearne uno nuovo.
 */
function mandaPreventivo_(m, pacchetto) {
  var lista = allegati_(m);
  var inizio = chiama_(pacchetto ? '/api/gmail/preventivo/' + pacchetto + '/aggiungi' : '/api/gmail/preventivo', {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({
      utente: Session.getActiveUser().getEmail(),
      mittente: m.getFrom(), oggetto: m.getSubject(),
      data: Utilities.formatDate(m.getDate(), 'Europe/Rome', 'dd/MM/yyyy HH:mm'),
      testo: m.getPlainBody(), messaggioId: m.getHeader('Message-ID'),
      file: lista.map(function (x) { return { nome: x.nome, byte: x.allegato.getSize() }; })
    })
  });
  var daMandare = {};
  (inizio.daMandare || []).forEach(function (n) { daMandare[n] = true; });
  var imp = impostazioni_();
  var richieste = lista.filter(function (x) { return daMandare[x.nome]; }).map(function (x) {
    return {
      url: imp.url + '/api/gmail/preventivo/' + inizio.id + '/file?nome=' + encodeURIComponent(x.nome),
      method: 'post', contentType: 'application/octet-stream', payload: x.allegato.getBytes(),
      headers: { 'x-chiave-portale': imp.chiave }, muteHttpExceptions: true
    };
  });
  if (richieste.length) UrlFetchApp.fetchAll(richieste).forEach(leggiRisposta_);
  var fine = chiama_('/api/gmail/preventivo/' + inizio.id + '/analizza', { method: 'post' });
  var testo = 'Documenti del cliente «' + inizio.nome + '»: ' + richieste.length + (pacchetto ? ' file aggiunti' : ' file mandati')
    + (inizio.soloElenco ? ', ' + inizio.soloElenco + ' solo nell\'elenco (PDF, 3D, immagini…)' : '')
    + '. L\'analisi è partita: nel portale controlla i dati e crea il preventivo da validare.';
  return { testo: testo, link: fine.link };
}

/** Ordine o fattura estera: la mail intera (.eml, con gli allegati) in Da acquisire. */
function mandaEmail_(m, tipo) {
  var r = chiama_('/api/gmail/acquisisci?tipo=' + tipo + '&oggetto=' + encodeURIComponent(m.getSubject() || ''), {
    method: 'post', contentType: 'message/rfc822', payload: Utilities.newBlob(m.getRawContent()).getBytes()
  });
  var testo = r.doppione ? 'Questa mail era già stata mandata al portale: ti porto a quella.'
    : (tipo === 'ordine' ? 'La mail è in Ordini → Da acquisire: l\'IA la sta leggendo, poi controlli e confermi l\'ordine.'
      : 'La fattura è in Amministrazione → Autofatture: l\'IA la sta leggendo, poi controlli e prepari l\'autofattura.');
  return { testo: testo, link: r.link };
}
