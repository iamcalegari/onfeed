import { ObjectId } from "mongodb";
import { describe, expect, it, vi } from "vitest";

import { ImportJobModel } from "./import-job.model.js";
import {
  createImportJob,
  findExistingSuccessfulImport,
  getImportJob,
  updateImportJobStatus,
} from "./import-job.repository.js";

// Testa a camada de repositório contra um ImportJobModel mockado (sem Mongo real)
// — o caminho real end-to-end é coberto pelo gate manual descrito em 01-VALIDATION.md.
vi.mock("./import-job.model.js", () => ({
  ImportJobModel: {
    insert: vi.fn(),
    findById: vi.fn(),
    find: vi.fn(),
    update: vi.fn(),
  },
}));

describe("import-job.repository", () => {
  it("createImportJob insere um job com status queued e retryCount 0 (via documentDefaults)", async () => {
    const inserted = {
      _id: "507f1f77bcf86cd799439011",
      userId: "user_1",
      sourceUrl: "https://www.instagram.com/reel/abc123/",
      normalizedUrl: "https://www.instagram.com/reel/abc123/",
      platform: "instagram" as const,
      status: "queued" as const,
      retryCount: 0,
      insertedAt: new Date(),
      updatedAt: new Date(),
    };
    vi.mocked(ImportJobModel.insert).mockResolvedValue(inserted as never);

    const job = await createImportJob(
      "user_1",
      "https://www.instagram.com/reel/abc123/",
      "https://www.instagram.com/reel/abc123/",
      "instagram",
    );

    expect(ImportJobModel.insert).toHaveBeenCalledWith({
      userId: "user_1",
      sourceUrl: "https://www.instagram.com/reel/abc123/",
      normalizedUrl: "https://www.instagram.com/reel/abc123/",
      platform: "instagram",
    });
    expect(job.status).toBe("queued");
    expect(job.retryCount).toBe(0);
  });

  it("getImportJob retorna o doc para um id conhecido", async () => {
    const doc = {
      _id: "507f1f77bcf86cd799439011",
      userId: "user_1",
      status: "queued" as const,
    };
    vi.mocked(ImportJobModel.findById).mockResolvedValue(doc as never);

    const job = await getImportJob("507f1f77bcf86cd799439011");

    expect(ImportJobModel.findById).toHaveBeenCalledWith("507f1f77bcf86cd799439011");
    expect(job).toEqual(doc);
  });

  it("getImportJob retorna null para um id desconhecido", async () => {
    vi.mocked(ImportJobModel.findById).mockResolvedValue(null as never);

    const job = await getImportJob("507f1f77bcf86cd799439099");

    expect(job).toBeNull();
  });

  it("updateImportJobStatus aplica um patch parcial e atualiza updatedAt", async () => {
    vi.mocked(ImportJobModel.update).mockResolvedValue(undefined as never);
    const jobId = "507f1f77bcf86cd799439011";

    await updateImportJobStatus(jobId, {
      status: "ready_for_review",
      keyframeUrl: "https://cdn.example.com/imports/abc/keyframe.jpg",
      transcript: "modo de preparo...",
    });

    expect(ImportJobModel.update).toHaveBeenCalledTimes(1);
    const [filter, updateDoc] = vi.mocked(ImportJobModel.update).mock.calls[0]!;
    const filterId = (filter as unknown as { _id: ObjectId })._id;
    expect(filterId).toBeInstanceOf(ObjectId);
    expect(filterId.toString()).toBe(jobId);
    expect(updateDoc).toMatchObject({
      $set: {
        status: "ready_for_review",
        keyframeUrl: "https://cdn.example.com/imports/abc/keyframe.jpg",
        transcript: "modo de preparo...",
      },
    });
    expect((updateDoc as { $set: { updatedAt: Date } }).$set.updatedAt).toBeInstanceOf(Date);
  });

  it("findExistingSuccessfulImport retorna o job existente quando há um ready_for_review para o mesmo usuário e normalizedUrl (HIT)", async () => {
    const existing = {
      _id: "507f1f77bcf86cd799439011",
      userId: "user_1",
      normalizedUrl: "https://www.instagram.com/reel/abc123/",
      status: "ready_for_review" as const,
      recipeId: "recipe_1",
    };
    vi.mocked(ImportJobModel.find).mockResolvedValue(existing as never);

    const job = await findExistingSuccessfulImport(
      "user_1",
      "https://www.instagram.com/reel/abc123/",
    );

    expect(job).toEqual(existing);
  });

  it("findExistingSuccessfulImport retorna null quando não há import bem-sucedido anterior (MISS)", async () => {
    vi.mocked(ImportJobModel.find).mockResolvedValue(null as never);

    const job = await findExistingSuccessfulImport(
      "user_1",
      "https://www.instagram.com/reel/abc123/",
    );

    expect(job).toBeNull();
  });

  it("findExistingSuccessfulImport escopa o filtro por userId, normalizedUrl e status ready_for_review (guarda de IDOR / D-01, D-05)", async () => {
    vi.mocked(ImportJobModel.find).mockResolvedValue(null as never);

    await findExistingSuccessfulImport("user_1", "https://www.instagram.com/reel/abc123/");

    expect(ImportJobModel.find).toHaveBeenCalledTimes(1);
    const [filter] = vi.mocked(ImportJobModel.find).mock.calls[0]!;
    const filterObj = filter as unknown as {
      userId: string;
      normalizedUrl: string;
      status: string;
    };
    expect(filterObj.userId).toBe("user_1");
    expect(filterObj.normalizedUrl).toBe("https://www.instagram.com/reel/abc123/");
    expect(filterObj.status).toBe("ready_for_review");
    // D-05: um job failed nunca deve casar com o dedup — o filtro nunca usa "failed".
    expect(filterObj.status).not.toBe("failed");
  });

  it("findExistingSuccessfulImport lê o shape nested costCents com optional chaining sem lançar quando ausente", async () => {
    const jobSemCosto = {
      _id: "507f1f77bcf86cd799439011",
      userId: "user_1",
      normalizedUrl: "https://www.instagram.com/reel/abc123/",
      status: "ready_for_review" as const,
    };
    vi.mocked(ImportJobModel.find).mockResolvedValue(jobSemCosto as never);

    const job = await findExistingSuccessfulImport(
      "user_1",
      "https://www.instagram.com/reel/abc123/",
    );

    expect(job?.costCents?.download?.cents).toBeUndefined();
    expect(job?.costCents?.extraction?.inputTokens).toBeUndefined();
    expect(job?.costCents?.totalCents).toBeUndefined();
  });

  it("findExistingSuccessfulImport lê o shape nested costCents (download.cents, extraction.inputTokens, totalCents) quando presente", async () => {
    const jobComCosto = {
      _id: "507f1f77bcf86cd799439011",
      userId: "user_1",
      normalizedUrl: "https://www.instagram.com/reel/abc123/",
      status: "ready_for_review" as const,
      costCents: {
        download: { bytes: 1024, cents: 2 },
        extraction: { inputTokens: 500, outputTokens: 120, cents: 8 },
        totalCents: 10,
      },
    };
    vi.mocked(ImportJobModel.find).mockResolvedValue(jobComCosto as never);

    const job = await findExistingSuccessfulImport(
      "user_1",
      "https://www.instagram.com/reel/abc123/",
    );

    expect(job?.costCents?.download?.cents).toBe(2);
    expect(job?.costCents?.extraction?.inputTokens).toBe(500);
    expect(job?.costCents?.totalCents).toBe(10);
  });
});
