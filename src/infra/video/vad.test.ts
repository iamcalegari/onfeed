import { describe, expect, it } from "vitest";

import { NO_SPEECH_RATIO_THRESHOLD, parseSilenceDurations } from "./vad.js";

// Fixtures capturadas do formato real de saída do filtro silencedetect do
// ffmpeg (stderr, não stdout — ver comentário em vad.ts). Suite rápida: não
// depende do binário ffmpeg, só da lógica pura de parsing/razão.
const SILENT_HEAVY_STDERR = `
ffmpeg version n8.1.2 Copyright (c) 2000-2026 the FFmpeg developers
Input #0, wav, from 'silent.wav':
  Duration: 00:00:10.00, bitrate: 256 kb/s
[silencedetect @ 0x5590a1234000] silence_start: 0
[silencedetect @ 0x5590a1234000] silence_end: 9.2 | silence_duration: 9.2
size=N/A time=00:00:10.00 bitrate=N/A speed= 45x
video:0kB audio:0kB subtitle:0kB other streams:0kB global headers:0kB muxing overhead: unknown
`;

const SPEECH_HEAVY_STDERR = `
ffmpeg version n8.1.2 Copyright (c) 2000-2026 the FFmpeg developers
Input #0, wav, from 'speech.wav':
  Duration: 00:00:10.00, bitrate: 256 kb/s
[silencedetect @ 0x5590a1234000] silence_start: 4.5
[silencedetect @ 0x5590a1234000] silence_end: 5.3 | silence_duration: 0.8
size=N/A time=00:00:10.00 bitrate=N/A speed= 45x
video:0kB audio:0kB subtitle:0kB other streams:0kB global headers:0kB muxing overhead: unknown
`;

const NO_SILENCE_STDERR = `
ffmpeg version n8.1.2 Copyright (c) 2000-2026 the FFmpeg developers
Input #0, wav, from 'allspeech.wav':
  Duration: 00:00:10.00, bitrate: 256 kb/s
size=N/A time=00:00:10.00 bitrate=N/A speed= 45x
`;

describe("parseSilenceDurations", () => {
  it("extracts all silence_duration values from silencedetect stderr", () => {
    expect(parseSilenceDurations(SILENT_HEAVY_STDERR)).toEqual([9.2]);
  });

  it("extracts a small silence_duration from a mostly-speech fixture", () => {
    expect(parseSilenceDurations(SPEECH_HEAVY_STDERR)).toEqual([0.8]);
  });

  it("returns an empty array when no silence_duration lines are present", () => {
    expect(parseSilenceDurations(NO_SILENCE_STDERR)).toEqual([]);
  });

  it("sums multiple silence_duration occurrences", () => {
    const multi = `
[silencedetect] silence_duration: 1.5
[silencedetect] silence_duration: 2.25
[silencedetect] silence_duration: 0.4
`;
    expect(parseSilenceDurations(multi)).toEqual([1.5, 2.25, 0.4]);
  });
});

describe("silence ratio threshold (derived from parseSilenceDurations)", () => {
  const TOTAL_DURATION_SEC = 10;

  function ratioFor(stderr: string): number {
    const durations = parseSilenceDurations(stderr);
    const total = durations.reduce((a, b) => a + b, 0);
    return total / TOTAL_DURATION_SEC;
  }

  it("flags a mostly-silent/music-only fixture above the no-speech threshold", () => {
    const ratio = ratioFor(SILENT_HEAVY_STDERR);
    expect(ratio).toBeGreaterThan(NO_SPEECH_RATIO_THRESHOLD);
  });

  it("keeps a speech-heavy fixture below the no-speech threshold", () => {
    const ratio = ratioFor(SPEECH_HEAVY_STDERR);
    expect(ratio).toBeLessThan(NO_SPEECH_RATIO_THRESHOLD);
  });
});
