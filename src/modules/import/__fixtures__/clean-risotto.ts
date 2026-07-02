/**
 * Fixture: transcript + caption ricos e coerentes entre si (o caso "feliz").
 * Usado no spot-check manual de veracidade do grounding (Fase 2, EXT-01/02) —
 * a maioria dos campos deve sair `grounded`, poucos `inferred` (ex: título,
 * se o autor não disser o nome do prato em voz alta).
 *
 * Não é importado por código de produção — só consumido por testes/spot-checks
 * de grounding downstream (import.extraction.ts, import.confidence.ts).
 */
export interface ImportFixture {
  transcript?: string;
  caption?: string;
  noSpeechDetected: boolean;
  label: string;
  expected: string;
}

export const cleanRisotto: ImportFixture = {
  label: "clean-risotto",
  noSpeechDetected: false,
  transcript:
    "Oi gente, hoje eu vou fazer um risoto de carnaroli que é a minha receita " +
    "preferida de inverno. Primeiro eu refogo uma cebola bem picadinha no azeite, " +
    "até ficar transparente. Depois eu adiciono duas xícaras de arroz carnaroli e " +
    "misturo bem pra tostar um pouquinho, uns dois minutos. Aí eu coloco meio " +
    "copo de vinho branco e deixo evaporar. A partir daqui é ir adicionando o " +
    "caldo de legumes bem quente, uma concha de cada vez, mexendo sempre, até o " +
    "arroz absorver — isso demora uns dezoito, vinte minutos. Eu uso mais ou " +
    "menos um litro de caldo no total. No final eu desligo o fogo e adiciono " +
    "uma colher de manteiga gelada e bastante parmesão ralado, misturo bem pra " +
    "ficar cremoso. Serve pra quatro pessoas, é uma receita de uns quarenta " +
    "minutos.",
  caption:
    "Risoto de carnaroli cremoso 🍚✨\n\n" +
    "Ingredientes:\n" +
    "- 2 xícaras de arroz carnaroli\n" +
    "- 1 litro de caldo de legumes\n" +
    "- 1/2 copo de vinho branco\n" +
    "- 1 cebola picada\n" +
    "- 1 colher de sopa de manteiga gelada\n" +
    "- parmesão ralado a gosto\n\n" +
    "#receita #risoto #comfortfood",
  expected:
    "A maioria dos campos deve sair 'grounded': ingredientes, quantidades " +
    "(arroz, caldo, vinho, manteiga), técnica e tempo (18-20min de cocção, " +
    "~40min total), servings (4). O título não é dito literalmente no áudio " +
    "nem na legenda ('Risoto de carnaroli cremoso' é um subtítulo de post, " +
    "não um título de receita formal) — esperado 'inferred' ou 'grounded' " +
    "por proximidade textual, a depender de quão estrito for o critério do " +
    "extrator. 'Parmesão a gosto' deve ficar marcado 'ambiguous' (D-04) — " +
    "quantidade nunca deve ser fabricada para esse item.",
};
