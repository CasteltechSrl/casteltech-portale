-- Montaggio: "TOP" e "BOT" come due spunte che possono stare insieme (prima "TOP" e "TOP+BOT"). Adriano, 24/10/2026.
UPDATE parametri SET etichetta = 'BOT', suggerimento = 'SMD anche sul lato BOT: raddoppiano programmazioni a lato e lamine, si attivano le fasi BOT'
  WHERE codice = 'doppiaFaccia' AND etichetta = 'TOP+BOT';
