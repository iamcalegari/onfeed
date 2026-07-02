/**
 * Contrato tipado para o download de vídeo (PIPE-01/PIPE-03), agnóstico de
 * plataforma (D-07) e agnóstico de motor (yt-dlp é a implementação, não a
 * interface). Segue a convenção do módulo — "um módulo = uma fronteira
 * externa, funções tipadas" — em vez de forçar uma classe/interface Port
 * formal (ver 01-PATTERNS.md: infra/images não define port explícito).
 */

/** Metadados de origem extraídos do `--dump-json`, mapeados para nomes de campo agnósticos de plataforma. */
export interface VideoMetadata {
  /** URL canônica do vídeo (webpage_url). */
  sourceUrl: string;
  /** @ do autor (uploader/uploader_id). */
  authorHandle?: string;
  /** URL do perfil do autor (uploader_url/channel_url). */
  authorUrl?: string;
  /** Caption/descrição do post (description). */
  caption?: string;
  /** Duração em segundos. */
  durationSec?: number;
  /** URL da thumbnail fornecida pela plataforma (NÃO é a imagem final da receita — PIPE-04 usa keyframe extraído). */
  thumbnailUrl?: string;
}

/** Resultado de um download bem-sucedido: caminho local do arquivo + metadados. */
export interface DownloadResult {
  videoPath: string;
  meta: VideoMetadata;
}
