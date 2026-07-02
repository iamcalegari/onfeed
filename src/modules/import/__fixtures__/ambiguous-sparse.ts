/**
 * Fixture: sem fala detectável (VAD) e legenda só com hashtags/emojis — o
 * caso "quase nenhum insumo". Exercita o Pitfall 5 (RESEARCH.md): o LLM não
 * pode alucinar uma receita completa do nada. Espera-se confiança baixíssima
 * e `reviewRequired = true` incondicional (noSpeechDetected força o gate,
 * independente do que o modelo reportar como grounding — ver
 * import.confidence.ts).
 *
 * Não é importado por código de produção — só consumido por testes/spot-checks
 * de grounding downstream (import.extraction.ts, import.confidence.ts).
 */
import type { ImportFixture } from "./clean-risotto.js";

export const ambiguousSparse: ImportFixture = {
  label: "ambiguous-sparse",
  noSpeechDetected: true,
  // transcript ausente intencionalmente (VAD não detectou fala confiável).
  caption: "🔥🔥🔥 #foryou #fy #receita #viral #comidacaseira",
  expected:
    "noSpeechDetected=true deve forçar reviewRequired=true incondicionalmente " +
    "(Pitfall 5), mesmo que o modelo, por excesso de confiança, marque algum " +
    "campo como 'grounded'. Sem transcript e sem lista de ingredientes na " +
    "legenda, o LLM não tem NENHUM insumo factual — título, ingredientes, " +
    "passos e quantidades devem sair 'inferred' (na melhor hipótese, se o " +
    "modelo tentar propor algo plausível) ou a extração deve falhar/produzir " +
    "um resultado claramente pobre. Este fixture é o teste de honestidade: " +
    "o sistema NÃO deve fabricar uma receita completa e convincente a partir " +
    "de puro hashtag/emoji.",
};
