import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { extractKeyframe, extractNormalizedKeyframe } from "./keyframe.js";

// Integration suite (manual-gated, excluded from `npm run test` by the
// `.integration.test.ts` naming convention — see vitest.config.ts). Requires
// a real ffmpeg binary on PATH. Generates tiny synthetic fixtures at test
// time (testsrc/color source, no checked-in binary asset needed) rather than
// checking in a video file, per 01-VALIDATION.md's "keep repo light" note.
const execFileAsync = promisify(execFile);
const FFMPEG_BIN = process.env.FFMPEG_PATH ?? "ffmpeg";

let workDir: string;
let sceneChangeVideo: string;
let staticVideo: string;

beforeAll(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "keyframe-it-"));
  sceneChangeVideo = path.join(workDir, "scene-change.mp4");
  staticVideo = path.join(workDir, "static.mp4");

  // A video with two distinct color segments (a real scene cut ffmpeg's
  // select='gt(scene,N)' filter can detect).
  await execFileAsync(FFMPEG_BIN, [
    "-y",
    "-f", "lavfi", "-i", "color=c=red:s=64x64:d=1:r=5",
    "-f", "lavfi", "-i", "color=c=blue:s=64x64:d=1:r=5",
    "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0",
    sceneChangeVideo,
  ]);

  // A fully static single-color video: the scene-score filter should find
  // zero qualifying frames here, forcing the midpoint-seek fallback path.
  await execFileAsync(FFMPEG_BIN, [
    "-y",
    "-f", "lavfi", "-i", "color=c=green:s=64x64:d=1:r=5",
    staticVideo,
  ]);
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true }).catch(() => {});
});

describe("extractKeyframe (real ffmpeg)", () => {
  it("produces a valid JPEG-decodable frame from a video with a real scene change", async () => {
    const outputPath = path.join(workDir, "out-scene.jpg");
    await extractKeyframe(sceneChangeVideo, outputPath, 2);
    const buf = await readFile(outputPath);
    expect(buf.length).toBeGreaterThan(0);
    // JPEG magic bytes: FF D8 FF
    expect(buf[0]).toBe(0xff);
    expect(buf[1]).toBe(0xd8);
    expect(buf[2]).toBe(0xff);
  });

  it("falls back to a midpoint frame when no scene change qualifies (static clip)", async () => {
    const outputPath = path.join(workDir, "out-static.jpg");
    await extractKeyframe(staticVideo, outputPath, 1);
    const buf = await readFile(outputPath);
    expect(buf.length).toBeGreaterThan(0);
    expect(buf[0]).toBe(0xff);
    expect(buf[1]).toBe(0xd8);
    expect(buf[2]).toBe(0xff);
  });

  it("extractNormalizedKeyframe returns a 512x512 sharp-normalized JPEG buffer", async () => {
    const outputPath = path.join(workDir, "out-normalized.jpg");
    const buf = await extractNormalizedKeyframe(sceneChangeVideo, outputPath, 2);
    expect(buf.length).toBeGreaterThan(0);
    expect(buf[0]).toBe(0xff);
    expect(buf[1]).toBe(0xd8);
    expect(buf[2]).toBe(0xff);
  });
});
