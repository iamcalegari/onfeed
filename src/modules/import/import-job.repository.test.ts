import { ObjectId } from "mongodb";
import { describe, expect, it, vi } from "vitest";

import { ImportJobModel } from "./import-job.model.js";
import {
  createImportJob,
  getImportJob,
  updateImportJobStatus,
} from "./import-job.repository.js";

// Testa a camada de repositório contra um ImportJobModel mockado (sem Mongo real)
// — o caminho real end-to-end é coberto pelo gate manual descrito em 01-VALIDATION.md.
vi.mock("./import-job.model.js", () => ({
  ImportJobModel: {
    insert: vi.fn(),
    findById: vi.fn(),
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
});
