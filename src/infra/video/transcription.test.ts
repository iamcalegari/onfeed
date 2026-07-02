import { describe, expect, it, vi } from "vitest";

import type { TranscriptionError as TranscriptionErrorType } from "./transcription.port.js";

// transcription.port.ts importa groq.transcriber.js/openai.transcriber.js,
// que por sua vez importam env.ts (required(MONGODB_URI) no module-load).
// Este teste injeta os transcritores via `deps` e nunca toca os módulos
// reais — mockar env.ts evita arrastar a validação de boot para a suite
// rápida, mesma decisão já aplicada em ytdlp.downloader.test.ts.
vi.mock("@/config/env.js", () => ({
  env: {
    groq: { apiKey: "", model: "whisper-large-v3-turbo", enabled: false },
    openaiTranscription: { apiKey: "", enabled: false },
  },
}));

const {
  GROQ_FILE_SIZE_LIMIT_BYTES,
  TranscriptionError,
  transcribe,
} = await import("./transcription.port.js");

function fakeStat(size: number) {
  return vi.fn().mockResolvedValue({ size } as { size: number });
}

describe("transcribe (Groq primary, OpenAI fallback)", () => {
  it("returns { text, source: 'groq' } when Groq succeeds; OpenAI is never called", async () => {
    const groq = vi.fn().mockResolvedValue("receita de brigadeiro");
    const openai = vi.fn().mockResolvedValue("should not be called");

    const result = await transcribe("/tmp/audio.mp3", {
      groq,
      openai,
      statFn: fakeStat(1024),
    });

    expect(result).toEqual({ text: "receita de brigadeiro", source: "groq" });
    expect(groq).toHaveBeenCalledWith("/tmp/audio.mp3");
    expect(openai).not.toHaveBeenCalled();
  });

  it("falls back to OpenAI when Groq rejects, returning source 'openai'", async () => {
    const groq = vi.fn().mockRejectedValue(new Error("Groq outage"));
    const openai = vi.fn().mockResolvedValue("receita de brigadeiro (openai)");

    const result = await transcribe("/tmp/audio.mp3", {
      groq,
      openai,
      statFn: fakeStat(1024),
    });

    expect(result).toEqual({ text: "receita de brigadeiro (openai)", source: "openai" });
    expect(groq).toHaveBeenCalledTimes(1);
    expect(openai).toHaveBeenCalledWith("/tmp/audio.mp3");
  });

  it("throws a typed TranscriptionError when both Groq and OpenAI fail", async () => {
    const groqErr = new Error("Groq outage");
    const openaiErr = new Error("OpenAI outage");
    const groq = vi.fn().mockRejectedValue(groqErr);
    const openai = vi.fn().mockRejectedValue(openaiErr);

    let caught: unknown;
    try {
      await transcribe("/tmp/audio.mp3", { groq, openai, statFn: fakeStat(1024) });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(TranscriptionError);
    expect((caught as TranscriptionErrorType).groqError).toBe(groqErr);
    expect((caught as TranscriptionErrorType).openaiError).toBe(openaiErr);
  });

  it("routes straight to OpenAI (skipping Groq) when the audio file exceeds Groq's size limit", async () => {
    const groq = vi.fn().mockResolvedValue("should not be called");
    const openai = vi.fn().mockResolvedValue("transcript from openai");

    const result = await transcribe("/tmp/audio.mp3", {
      groq,
      openai,
      statFn: fakeStat(GROQ_FILE_SIZE_LIMIT_BYTES + 1),
    });

    expect(result).toEqual({ text: "transcript from openai", source: "openai" });
    expect(groq).not.toHaveBeenCalled();
    expect(openai).toHaveBeenCalledWith("/tmp/audio.mp3");
  });

  it("still throws TranscriptionError if oversized AND OpenAI also fails", async () => {
    const groq = vi.fn();
    const openaiErr = new Error("OpenAI outage");
    const openai = vi.fn().mockRejectedValue(openaiErr);

    let caught: unknown;
    try {
      await transcribe("/tmp/audio.mp3", {
        groq,
        openai,
        statFn: fakeStat(GROQ_FILE_SIZE_LIMIT_BYTES + 1),
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(TranscriptionError);
    expect(groq).not.toHaveBeenCalled();
    expect((caught as TranscriptionErrorType).openaiError).toBe(openaiErr);
  });

  it("falls back to OpenAI when the stat call itself fails (e.g. file missing) rather than masking the error", async () => {
    const groq = vi.fn().mockRejectedValue(new Error("ENOENT"));
    const openai = vi.fn().mockResolvedValue("transcript from openai");
    const statFn = vi.fn().mockRejectedValue(new Error("ENOENT"));

    const result = await transcribe("/tmp/missing.mp3", { groq, openai, statFn });

    expect(result.source).toBe("openai");
  });
});
