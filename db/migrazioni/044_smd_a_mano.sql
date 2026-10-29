-- Adriano, 29/10/2026: Informazioni generali → Montaggio → SMD, spunta «A mano» (campionature di pochi pezzi, es. 5 schede).
--  * gli SMD si montano a mano in giostra insieme ai THT: 15 s a componente SMD (i THT restano al loro tempo);
--  * nel gruppo SMD resta solo l'attrezzaggio serigrafia, 45 min; niente programmazioni P&P/serigrafia/armadi, attrezzaggio e
--    smontaggio P&P, avvio, serigrafia a pannello, pick and place;
--  * il forno resta, con tempi, energia e consumi (pasta). AOI / Visivo restano come spuntati.
-- Come per la 003: si cambia solo ciò che è ancora uguale al valore lasciato dalle migrazioni precedenti.
-- I preventivi salvati non cambiano: hanno la loro copia del catalogo.

INSERT INTO parametri (codice, etichetta, unita, gruppo, valore_default, suggerimento, tipo, ordine)
SELECT 'smdAMano', 'SMD montati a mano', '', 'INFORMAZIONI GENERALI', 0,
       'Campionature di pochi pezzi: SMD montati a mano in giostra (15 s a componente), restano solo attrezzaggio serigrafia (45 min) e forno',
       'si_no', ordine + 0.5
FROM parametri WHERE codice = 'presenteSmd'
ON CONFLICT (codice) DO NOTHING;

INSERT INTO parametri (codice, etichetta, unita, gruppo, valore_default, suggerimento, tipo, ordine)
SELECT 'tempoAttrezSerigrafiaMano', 'Attrezzaggio serigrafia con SMD a mano', 'min', gruppo, 45, 'Solo con la spunta SMD «A mano»', 'numero', ordine + 0.5
FROM parametri WHERE codice = 'tempoAttrezSerigrafia'
ON CONFLICT (codice) DO NOTHING;

INSERT INTO parametri (codice, etichetta, unita, gruppo, valore_default, suggerimento, tipo, ordine)
SELECT 'tempoMontaggioSmdMano', 'Giostra per componente SMD a mano', 's', gruppo, 15, 'Solo con la spunta SMD «A mano»: gli SMD si montano in giostra', 'numero', ordine + 0.5
FROM parametri WHERE codice = 'tempoMontaggioTht'
ON CONFLICT (codice) DO NOTHING;

UPDATE fasi SET formula_secondi = 'se(smdAMano, 0, se(primaProduzione * (provenienzaMateriale != 1) * (qtSmd + doppiaFaccia * qtSmdLatoB) > 0, oreProgArmadi * 3600 * se(doppiaFaccia, 2, 1), 0))'
  WHERE codice = 'progArmadi' AND formula_secondi = 'se(primaProduzione * (provenienzaMateriale != 1) * (qtSmd + doppiaFaccia * qtSmdLatoB) > 0, oreProgArmadi * 3600 * se(doppiaFaccia, 2, 1), 0)';
UPDATE fasi SET formula_secondi = 'se(smdAMano, 0, se(primaProduzione * (qtSmd + doppiaFaccia * qtSmdLatoB) > 0, oreFilePeP * 3600 * se(doppiaFaccia, 2, 1), 0))'
  WHERE codice = 'filePeP' AND formula_secondi = 'se(primaProduzione * (qtSmd + doppiaFaccia * qtSmdLatoB) > 0, oreFilePeP * 3600 * se(doppiaFaccia, 2, 1), 0)';
UPDATE fasi SET formula_secondi = 'se(smdAMano, 0, se(primaProduzione * (qtSmd + doppiaFaccia * qtSmdLatoB) > 0, oreProgPeP * 3600 * se(doppiaFaccia, 2, 1), 0))'
  WHERE codice = 'progPeP' AND formula_secondi = 'se(primaProduzione * (qtSmd + doppiaFaccia * qtSmdLatoB) > 0, oreProgPeP * 3600 * se(doppiaFaccia, 2, 1), 0)';
UPDATE fasi SET formula_secondi = 'se(smdAMano, 0, se(primaProduzione * qtSmd > 0, oreProgSerigrafia * 3600, 0))'
  WHERE codice = 'progSerigrafiaTop' AND formula_secondi = 'se(primaProduzione * qtSmd > 0, oreProgSerigrafia * 3600, 0)';
UPDATE fasi SET formula_secondi = 'se(smdAMano, 0, se(qtSmd > 0, tempoAttrezPeP * 60 * qtFeeder, 0))'
  WHERE codice = 'equipPePTop' AND formula_secondi = 'se(qtSmd > 0, tempoAttrezPeP * 60 * qtFeeder, 0)';
UPDATE fasi SET formula_secondi = 'se(smdAMano, 0, se(qtSmd > 0, tempoAvvioProduzione * 60, 0))'
  WHERE codice = 'avvioTop' AND formula_secondi = 'se(qtSmd > 0, tempoAvvioProduzione * 60, 0)';
UPDATE fasi SET formula_secondi = 'se(smdAMano, 0, se(qtSmd > 0, tempoSerigrafia * nPCB, 0))'
  WHERE codice = 'serigrafiaTop' AND formula_secondi = 'se(qtSmd > 0, tempoSerigrafia * nPCB, 0)';
UPDATE fasi SET formula_secondi = 'se(smdAMano, 0, qtSmd / (pepChipH / 3600) * nSchede)'
  WHERE codice = 'pepTop' AND formula_secondi = 'qtSmd / (pepChipH / 3600) * nSchede';
UPDATE fasi SET formula_secondi = 'se(smdAMano, 0, se(qtSmd > 0, tempoSmontaggio * 60 * qtFeeder, 0))'
  WHERE codice = 'smontaggioTop' AND formula_secondi = 'se(qtSmd > 0, tempoSmontaggio * 60 * qtFeeder, 0)';
UPDATE fasi SET formula_secondi = 'se(smdAMano, 0, se(primaProduzione * doppiaFaccia * qtSmdLatoB > 0, oreProgSerigrafia * 3600, 0))'
  WHERE codice = 'progSerigrafiaBot' AND formula_secondi = 'se(primaProduzione * doppiaFaccia * qtSmdLatoB > 0, oreProgSerigrafia * 3600, 0)';
UPDATE fasi SET formula_secondi = 'se(smdAMano, 0, se(doppiaFaccia * qtSmdLatoB > 0, tempoAttrezPePLatoB * 60 * qtFeederLatoB, 0))'
  WHERE codice = 'equipPePBot' AND formula_secondi = 'se(doppiaFaccia * qtSmdLatoB > 0, tempoAttrezPePLatoB * 60 * qtFeederLatoB, 0)';
UPDATE fasi SET formula_secondi = 'se(smdAMano, 0, se(doppiaFaccia * qtSmdLatoB > 0, tempoAvvioProduzioneLatoB * 60, 0))'
  WHERE codice = 'avvioBot' AND formula_secondi = 'se(doppiaFaccia * qtSmdLatoB > 0, tempoAvvioProduzioneLatoB * 60, 0)';
UPDATE fasi SET formula_secondi = 'se(smdAMano, 0, se(doppiaFaccia * qtSmdLatoB > 0, tempoSerigrafiaLatoB * nPCB, 0))'
  WHERE codice = 'serigrafiaBot' AND formula_secondi = 'se(doppiaFaccia * qtSmdLatoB > 0, tempoSerigrafiaLatoB * nPCB, 0)';
UPDATE fasi SET formula_secondi = 'se(smdAMano, 0, se(doppiaFaccia * qtSmdLatoB > 0, qtSmdLatoB / (pepChipHLatoB / 3600) * nSchede, 0))'
  WHERE codice = 'pepBot' AND formula_secondi = 'se(doppiaFaccia * qtSmdLatoB > 0, qtSmdLatoB / (pepChipHLatoB / 3600) * nSchede, 0)';
UPDATE fasi SET formula_secondi = 'se(smdAMano, 0, se(doppiaFaccia * qtSmdLatoB > 0, tempoSmontaggioLatoB * 60 * qtFeederLatoB, 0))'
  WHERE codice = 'smontaggioBot' AND formula_secondi = 'se(doppiaFaccia * qtSmdLatoB > 0, tempoSmontaggioLatoB * 60 * qtFeederLatoB, 0)';
UPDATE fasi SET formula_secondi = 'se(qtSmd > 0, se(smdAMano, tempoAttrezSerigrafiaMano, tempoAttrezSerigrafia) * 60, 0)'
  WHERE codice = 'equipSerigrafiaTop' AND formula_secondi = 'se(qtSmd > 0, tempoAttrezSerigrafia * 60, 0)';
UPDATE fasi SET formula_secondi = 'se(doppiaFaccia * qtSmdLatoB > 0, se(smdAMano, tempoAttrezSerigrafiaMano, tempoAttrezSerigrafiaLatoB) * 60, 0)'
  WHERE codice = 'equipSerigrafiaBot' AND formula_secondi = 'se(doppiaFaccia * qtSmdLatoB > 0, tempoAttrezSerigrafiaLatoB * 60, 0)';
UPDATE fasi SET formula_secondi = '(tempoMontaggioTht * qntCompMontaggio + se(smdAMano, tempoMontaggioSmdMano * (qtSmd + doppiaFaccia * qtSmdLatoB), 0)) * nSchede'
  WHERE codice = 'giostra' AND formula_secondi = 'tempoMontaggioTht * qntCompMontaggio * nSchede';
