import { beforeEach, describe, expect, it, vi } from "vitest";

// env.ts valida MONGODB_URI/etc via required() no module-load — mock evita
// arrastar essa validação para a suite rápida (mesma decisão de
// ytdlp.downloader.test.ts / import-job.repository.test.ts).
vi.mock("@/config/env.js", () => ({
  env: { sqs: { importQueueUrl: "https://sqs.example.com/import-queue" } },
}));

const sendMock = vi.fn().mockResolvedValue({});
vi.mock("@/infra/queue/sqs.client.js", () => ({
  sqsClient: { send: (...args: unknown[]) => sendMock(...args) },
}));

const { detectPlatform, normalizeUrl, enqueueImportJob } = await import(
  "./import.service.js"
);

describe("detectPlatform (CAP-02 / SSRF boundary)", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube"],
    ["https://youtube.com/watch?v=dQw4w9WgXcQ", "youtube"],
    ["https://youtu.be/dQw4w9WgXcQ", "youtube"],
    ["https://www.youtube.com/shorts/abc123", "youtube"],
    ["https://www.tiktok.com/@user/video/123456789", "tiktok"],
    ["https://vm.tiktok.com/ZMabc123/", "tiktok"],
    ["https://www.instagram.com/reel/Cabc123/", "instagram"],
    ["https://instagram.com/p/Cabc123/", "instagram"],
  ])("classifies %s as %s", (url, expected) => {
    expect(detectPlatform(url)).toBe(expected);
  });

  it("returns null for a malformed/non-URL string", () => {
    expect(detectPlatform("not a url")).toBeNull();
  });

  it("returns null for a non-http(s) protocol", () => {
    expect(detectPlatform("file:///etc/passwd")).toBeNull();
    expect(detectPlatform("javascript:alert(1)")).toBeNull();
  });

  it("returns null for a non-allowlisted domain (SSRF boundary — internal IP)", () => {
    expect(detectPlatform("http://169.254.169.254/latest/meta-data/")).toBeNull();
  });

  it("returns null for a non-allowlisted domain (arbitrary external host)", () => {
    expect(detectPlatform("https://example.com/video/123")).toBeNull();
  });

  it("returns null for an internal hostname disguised as a plausible link", () => {
    expect(detectPlatform("http://internal-service.local/video")).toBeNull();
  });
});

describe("normalizeUrl", () => {
  it("strips tracking params while preserving the canonical video path", () => {
    const withTracking =
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&utm_source=ig&utm_medium=story";
    const withoutTracking = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    expect(normalizeUrl(withTracking)).toBe(normalizeUrl(withoutTracking));
  });

  it("is idempotent across links differing only by tracking params (igshid, si)", () => {
    const a = "https://www.instagram.com/reel/Cabc123/?igshid=xyz";
    const b = "https://www.instagram.com/reel/Cabc123/";
    expect(normalizeUrl(a)).toBe(normalizeUrl(b));
  });

  it("strips the youtu.be 'si' share param without altering the video id", () => {
    const withSi = "https://youtu.be/dQw4w9WgXcQ?si=abcDEF123";
    const withoutSi = "https://youtu.be/dQw4w9WgXcQ";
    expect(normalizeUrl(withSi)).toBe(normalizeUrl(withoutSi));
  });
});

describe("enqueueImportJob", () => {
  beforeEach(() => {
    sendMock.mockClear();
  });

  it("sends { jobId } to env.sqs.importQueueUrl via the existing sqsClient", async () => {
    await enqueueImportJob("507f1f77bcf86cd799439011");

    expect(sendMock).toHaveBeenCalledTimes(1);
    const [command] = sendMock.mock.calls[0]!;
    expect(command.input.QueueUrl).toBe("https://sqs.example.com/import-queue");
    expect(JSON.parse(command.input.MessageBody)).toEqual({
      jobId: "507f1f77bcf86cd799439011",
    });
  });
});
