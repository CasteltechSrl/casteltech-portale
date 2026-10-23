-- Le fasi di un lato SMD (attrezzaggi, avvio, serigrafia, programmazioni, AOI) si applicano solo se su quel lato
-- ci sono componenti: prima i valori standard (es. 20 min di attrezzaggio) comparivano anche sui prodotti senza SMD.
-- Aggiorna solo le formule rimaste quelle iniziali (se una formula è stata modificata dal pannello, non la tocca).
UPDATE fasi SET formula_secondi = 'se(qtSmd + qtSmdLatoB > 0, oreProgArmadi * 3600 * se(botProgArmadi, 2, 1), 0)' WHERE codice = 'progArmadi' AND formula_secondi = 'oreProgArmadi * 3600 * se(botProgArmadi, 2, 1)';
UPDATE fasi SET formula_secondi = 'se(qtSmd + qtSmdLatoB > 0, oreProgPeP * 3600 * se(botProgPeP, 2, 1), 0)' WHERE codice = 'progPeP' AND formula_secondi = 'oreProgPeP * 3600 * se(botProgPeP, 2, 1)';
UPDATE fasi SET formula_secondi = 'se(qtSmd > 0, qtFeeder * tempoContMateriale, 0)' WHERE codice = 'materialeTop' AND formula_secondi = 'qtFeeder * tempoContMateriale';
UPDATE fasi SET formula_secondi = 'se(qtSmd > 0, oreProgSerigrafia * 3600, 0)' WHERE codice = 'progSerigrafiaTop' AND formula_secondi = 'oreProgSerigrafia * 3600';
UPDATE fasi SET formula_secondi = 'se(qtSmd > 0, tempoAttrezSerigrafia * 60, 0)' WHERE codice = 'equipSerigrafiaTop' AND formula_secondi = 'tempoAttrezSerigrafia * 60';
UPDATE fasi SET formula_secondi = 'se(qtSmd > 0, tempoAttrezPeP * 60 * qtFeeder, 0)' WHERE codice = 'equipPePTop' AND formula_secondi = 'tempoAttrezPeP * 60 * qtFeeder';
UPDATE fasi SET formula_secondi = 'se(qtSmd > 0, tempoAvvioProduzione * 60, 0)' WHERE codice = 'avvioTop' AND formula_secondi = 'tempoAvvioProduzione * 60';
UPDATE fasi SET formula_secondi = 'se(qtSmd > 0, tempoSerigrafia * nPCB, 0)' WHERE codice = 'serigrafiaTop' AND formula_secondi = 'tempoSerigrafia * nPCB';
UPDATE fasi SET formula_secondi = 'se(qtSmd > 0, tempoSmontaggio * 60 * qtFeeder, 0)' WHERE codice = 'smontaggioTop' AND formula_secondi = 'tempoSmontaggio * 60 * qtFeeder';
UPDATE fasi SET formula_secondi = 'se(qtSmdLatoB > 0, qtFeederLatoB * tempoContMaterialeLatoB, 0)' WHERE codice = 'materialeBot' AND formula_secondi = 'qtFeederLatoB * tempoContMaterialeLatoB';
UPDATE fasi SET formula_secondi = 'se(qtSmdLatoB > 0, oreProgSerigrafia * 3600 * botProgSerigrafia, 0)' WHERE codice = 'progSerigrafiaBot' AND formula_secondi = 'oreProgSerigrafia * 3600 * botProgSerigrafia';
UPDATE fasi SET formula_secondi = 'se(qtSmdLatoB > 0, tempoAttrezSerigrafiaLatoB * 60, 0)' WHERE codice = 'equipSerigrafiaBot' AND formula_secondi = 'tempoAttrezSerigrafiaLatoB * 60';
UPDATE fasi SET formula_secondi = 'se(qtSmdLatoB > 0, tempoAttrezPePLatoB * 60 * qtFeederLatoB, 0)' WHERE codice = 'equipPePBot' AND formula_secondi = 'tempoAttrezPePLatoB * 60 * qtFeederLatoB';
UPDATE fasi SET formula_secondi = 'se(qtSmdLatoB > 0, tempoAvvioProduzioneLatoB * 60, 0)' WHERE codice = 'avvioBot' AND formula_secondi = 'tempoAvvioProduzioneLatoB * 60';
UPDATE fasi SET formula_secondi = 'se(qtSmdLatoB > 0, tempoSerigrafiaLatoB * nPCB, 0)' WHERE codice = 'serigrafiaBot' AND formula_secondi = 'tempoSerigrafiaLatoB * nPCB';
UPDATE fasi SET formula_secondi = 'se(qtSmdLatoB > 0, tempoSmontaggioLatoB * 60 * qtFeederLatoB, 0)' WHERE codice = 'smontaggioBot' AND formula_secondi = 'tempoSmontaggioLatoB * 60 * qtFeederLatoB';
UPDATE fasi SET formula_secondi = 'se(qtSmd + qtSmdLatoB > 0, oreProgAOI * 3600 * se(botProgAOI, 2, 1), 0)' WHERE codice = 'progAOI' AND formula_secondi = 'oreProgAOI * 3600 * se(botProgAOI, 2, 1)';
UPDATE fasi SET formula_secondi = '(se(qtSmd > 0, tempoRevisioneAoi, 0) + se(qtSmdLatoB > 0, tempoRevisioneAoiLatoB, 0)) * nSchede' WHERE codice = 'ispezioneAOI' AND formula_secondi = '(tempoRevisioneAoi + tempoRevisioneAoiLatoB) * nSchede';
