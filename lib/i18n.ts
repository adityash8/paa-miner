/**
 * Multi-language PAA headings for fallback detection
 * We prefer structural detection (aria-expanded accordions) but these help
 * in edge cases where the DOM structure is ambiguous
 */
export const PAA_HEADINGS = [
  'people also ask',                 // en
  'les gens demandent aussi',        // fr
  'die leute fragen auch',           // de
  'también se pregunta',             // es
  'la gente también pregunta',       // es-alt
  'as pessoas também perguntam',     // pt
  'as pessoas também pesquisam',     // pt-br
  'लोग यह भी पूछते हैं',             // hi
  '人们也会问',                       // zh-simplified
  'people also search for',          // en-variant
  'related questions',               // en-variant
  'as pessoas também querem saber'   // pt-alt
].map(s => s.toLowerCase());
