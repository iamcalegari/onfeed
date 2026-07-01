import { execFile } from "node:child_process";
import { promisify } from "node:util";

// Único lugar do projeto que invoca o binário ffmpeg. Todo outro módulo de
// src/infra/video/* deve rotear pelo runFfmpeg abaixo em vez de chamar
// execFile/exec diretamente — mantém a disciplina execFile+args-array
// (mitigação de command injection, T-02-01) concentrada num só arquivo.
//
// NUNCA usar child_process.exec (forma string) nem a lib fluent-ffmpeg
// (arquivada pelo mantenedor em maio/2025, não funciona mais de forma
// confiável com versões recentes do ffmpeg — ver 01-RESEARCH.md Pitfall 0).
const execFileAsync = promisify(execFile);

const FFMPEG_BIN = process.env.FFMPEG_PATH ?? "ffmpeg";

export interface FfmpegResult {
  stdout: string;
  stderr: string;
}

/**
 * Roda o binário ffmpeg com um array de argumentos discretos (nunca uma
 * string concatenada) e devolve stdout/stderr. Não faz parsing nenhum —
 * cada operação específica (extractAudio, detectSilenceRatio, extractKeyframe)
 * decide o que fazer com a saída.
 */
export async function runFfmpeg(args: string[]): Promise<FfmpegResult> {
  const { stdout, stderr } = await execFileAsync(FFMPEG_BIN, args);
  return { stdout, stderr };
}

/**
 * Extrai o áudio de um vídeo em mono 16kHz 64kbps. Essas flags mantêm o
 * arquivo previsivelmente abaixo do limite de 25MB do tier free da Groq
 * para durações realistas de clipe curto (RESEARCH §3 / Pitfall 2) — modelos
 * classe Whisper não se beneficiam de fidelidade maior.
 */
export async function extractAudio(videoPath: string, audioPath: string): Promise<void> {
  await runFfmpeg([
    "-y",
    "-i", videoPath,
    "-vn",
    "-ar", "16000",
    "-ac", "1",
    "-b:a", "64k",
    audioPath,
  ]);
}
