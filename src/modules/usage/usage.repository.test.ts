import { beforeEach, describe, expect, it, vi } from "vitest";

import { ImportUsageModel } from "./import-usage.model.js";
import { consumeDailyImportQuota, refundDailyImportQuota } from "./usage.repository.js";

// Testa a camada de repositório de quota de import contra um ImportUsageModel
// mockado (sem Mongo real) — primeira cobertura de teste deste arquivo.
// usage.repository.ts também importa AdaptUsageModel (usage.model.js) — precisa
// ser mockado também, senão o construtor real do mongoat lança "Database not
// found" fora de um ambiente com Mongo vivo (ver [[Mongoat gotchas]]).
vi.mock("./usage.model.js", () => ({
  AdaptUsageModel: {
    update: vi.fn(),
    find: vi.fn(),
  },
}));

vi.mock("./import-usage.model.js", () => ({
  ImportUsageModel: {
    update: vi.fn(),
    find: vi.fn(),
  },
}));

beforeEach(() => {
  vi.mocked(ImportUsageModel.update).mockReset();
  vi.mocked(ImportUsageModel.find).mockReset();
});

describe("usage.repository — consumeDailyImportQuota", () => {
  it("retorna allowed:true quando o contador incrementado ainda está dentro do limite", async () => {
    vi.mocked(ImportUsageModel.update).mockResolvedValue({ count: 2 } as never);

    const result = await consumeDailyImportQuota("user_1", 3);

    expect(result).toEqual({ allowed: true, count: 2, limit: 3 });
  });

  it("boundary: retorna allowed:false quando o contador ultrapassa o limite", async () => {
    vi.mocked(ImportUsageModel.update).mockResolvedValue({ count: 4 } as never);

    const result = await consumeDailyImportQuota("user_1", 3);

    expect(result).toEqual({ allowed: false, count: 4, limit: 3 });
  });

  it("chama update com filtro {userId, day} e $inc: {count: 1} via upsert", async () => {
    vi.mocked(ImportUsageModel.update).mockResolvedValue({ count: 1 } as never);

    await consumeDailyImportQuota("user_1", 3);

    expect(ImportUsageModel.update).toHaveBeenCalledTimes(1);
    const [filter, updateDoc, options] = vi.mocked(ImportUsageModel.update).mock.calls[0]!;
    const day = new Date().toISOString().slice(0, 10);
    expect(filter).toEqual({ userId: "user_1", day });
    expect(updateDoc).toMatchObject({ $inc: { count: 1 } });
    expect(options).toEqual({ upsert: true });
  });

  it("isolamento: o filtro {userId, day} é passado sem alteração (escopo por usuário e dia)", async () => {
    vi.mocked(ImportUsageModel.update).mockResolvedValue({ count: 1 } as never);

    await consumeDailyImportQuota("user_2", 5);

    const [filter] = vi.mocked(ImportUsageModel.update).mock.calls[0]!;
    expect((filter as { userId: string }).userId).toBe("user_2");
  });
});

describe("usage.repository — refundDailyImportQuota", () => {
  it("chama update com $inc: {count: -1} para o dia reservado, sem upsert", async () => {
    vi.mocked(ImportUsageModel.update).mockResolvedValue(undefined as never);

    await refundDailyImportQuota("user_1", "2026-07-01");

    expect(ImportUsageModel.update).toHaveBeenCalledTimes(1);
    const call = vi.mocked(ImportUsageModel.update).mock.calls[0]!;
    const [filter, updateDoc, options] = call;
    expect(filter).toEqual({ userId: "user_1", day: "2026-07-01" });
    expect(updateDoc).toMatchObject({ $inc: { count: -1 } });
    expect(options).toBeUndefined();
  });
});
