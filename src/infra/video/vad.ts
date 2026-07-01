import { runFfmpeg } from "./ffmpeg.exec.js";

// Pré-filtro VAD (PIPE-02, D-06): usa o filtro silencedetect do ffmpeg em vez
// de confiar no no_speech_prob do Whisper — o Whisper aluciona texto plausível
// sobre trechos de silêncio/música com confiança artificialmente alta (ver
// 01-RESEARCH.md Pitfall 3). Um clipe majoritariamente silencioso/música é
// sinalizado ANTES de gastar uma chamada paga na Groq.

// Constantes tunáveis (ponto de partida razoável per D-05/D-06, não uma
// especificação externa travada — ajustar empiricamente contra clipes reais).
export const NOISE_THRESHOLD_DB = "-30dB";
export const MIN_SILENCE_SEC = "1.0";
export const NO_SPEECH_RATIO_THRESHOLD = 0.8;

/**
 * Extrai todos os valores de silence_duration de uma saída stderr do filtro
 * silencedetect do ffmpeg. Função pura — sem dependência do binário ffmpeg —
 * para permitir teste unitário rápido da lógica numérica.
 */
export function parseSilenceDurations(stderr: string): number[] {
  return [...stderr.matchAll(/silence_duration:\s*([\d.]+)/g)]
    .map((m) => m[1])
    .filter((v): v is string => v !== undefined)
    .map((v) => parseFloat(v));
}

/**
 * Calcula a razão silêncio/duração total de um arquivo de áudio via
 * ffmpeg silencedetect. Robusto a exit code não-zero do ffmpeg: o filtro
 * silencedetect escreve no stderr mesmo no caminho de descarte `-f null -`,
 * então extraímos o stderr do erro em vez de propagar a exceção.
 */
export async function detectSilenceRatio(audioPath: string, totalDurationSec: number): Promise<number> {
  let stderr: string;
  try {
    const result = await runFfmpeg([
      "-i", audioPath,
      "-af", `silencedetect=noise=${NOISE_THRESHOLD_DB}:d=${MIN_SILENCE_SEC}`,
      "-f", "null", "-",
    ]);
    stderr = result.stderr;
  } catch (e) {
    stderr = (e as { stderr?: string }).stderr ?? "";
  }

  const silenceDurations = parseSilenceDurations(stderr);
  const totalSilence = silenceDurations.reduce((a, b) => a + b, 0);
  return totalDurationSec > 0 ? totalSilence / totalDurationSec : 0;
}
