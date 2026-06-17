/**
 * Porta de embeddings (hexagonal): o domínio depende desta interface, não da
 * Voyage diretamente. Trocar por Bedrock/OpenAI = nova implementação, zero
 * mudança no service de busca.
 *
 * A distinção document/query existe porque modelos modernos (Voyage, Cohere v3)
 * usam prompts/prefixos diferentes para indexação vs. busca — usar o tipo certo
 * melhora o retrieval de forma mensurável.
 */
export interface EmbeddingsPort {
  /** Para indexação de receitas (ingestão). Aceita lote. */
  embedDocuments(texts: string[]): Promise<number[][]>;
  /** Para a query do usuário em tempo de busca. */
  embedQuery(text: string): Promise<number[]>;
}
