import { readFileSync } from 'node:fs';

// The bitmap font renders every Latin-1 diacritic at the same 6 px advance
// (verified with `tools/font-probe.mjs`), so there is never a reason to spell a
// word without its accent. These patterns list only forms that are
// unambiguously misspelled in that language.
const SUSPECT = {
  es: /\b(accion|energia|numero|rapido|electrico|metalico|termico|criogenico|cinetico|optico|cuantico|informacion|proteccion|reduccion|evasion|precision|despues|tambien|aqui|alli|habra|podras|estaras|volvera|codigo|critico|maximo|minimo|automatico|tecnico|electronico|magnetico|analisis|bateria|categoria|sonico|dificil|facil|debil)\b/i,
  fr: /\b(tres|rate|ratee|deja|apres|prete|prets?|ete|etre|reussi|echec|echoue|energie|elevee?|eleve|degat|degats|defaite|arrete|entrainement|entraineur|equipe|etat|evite|experience|genere|leger|legere|memoire|numero|operation|precision|premiere|prepare|recupere|reseau|resiste|securite|selectionne|separe|serie|specialise?|systeme|telecharge|termine|verifie|zero|donnees|ajoutees|felicitations|cameras|connait|chargee|transfere|deplace|reboote|repare|drainee|restaures)\b/i,
  it: /(\bE'|\be'\b|\bpiu'|\bgia'|\bcosi'|\bperche'|\bpero'|\bpuo'|ita'\b)/,
};

let total = 0;
for (const l of ['es', 'fr', 'it']) {
  const cat = JSON.parse(readFileSync(`src/game/data/lang/${l}.json`, 'utf8'));
  const hits = Object.entries(cat).filter(([, v]) => SUSPECT[l].test(v));
  total += hits.length;
  console.log(`${l}: ${hits.length} value(s) missing a diacritic`);
  for (const [k, v] of hits.slice(0, 12)) console.log(`   ${JSON.stringify(k)} -> ${JSON.stringify(v)}`);
  if (hits.length > 12) console.log(`   ... and ${hits.length - 12} more`);
}
console.log(total ? '\nACCENTS FAILED' : '\nACCENTS OK');
process.exit(total ? 1 : 0);
