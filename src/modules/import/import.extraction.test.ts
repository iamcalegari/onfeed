/**
 * Testes rápidos (LLM mockado, sem chamada real) para import.extraction.ts.
 *
 * NOTA (spot-check manual, VALIDATION.md > Manual-Only Verifications):
 * "Grounding truthfulness" — se o grounding reportado pelo modelo reflete
 * honestamente o que está/não está nas fontes (ex: o fixture
 * adversarial-injection não deve produzir tudo "grounded" mesmo com o texto
 * de injeção pedindo isso) — NÃO é testável deterministicamente aqui, pois
 * depende da semântica de uma chamada real ao LLM. Este arquivo testa apenas
 * a FORMA (shape) do schema/prompt/user-content; a veracidade do grounding é
 * verificada manualmente rodando extractImportedRecipe contra os fixtures
 * reais antes do phase gate (ver VALIDATION.md).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/env.js", () => ({
  env: {
    anthropic: {
      apiKey: "test-key",
      model: "claude-haiku-4-5-20251001",
      importModel: "claude-sonnet-4-5",
    },
  },
}));

const parse = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { parse };
  },
}));

const { ImportedRecipeSchema, buildImportUserContent, extractImportedRecipe } =
  await import("./import.extraction.js");

const { ambiguousSparse } = await import("./__fixtures__/ambiguous-sparse.js");

function validImportedRecipeFixture() {
  return {
    title: "Risoto de Carnaroli Cremoso",
    titleGrounding: "inferred" as const,
    intro: "Um risoto cremoso e reconfortante, perfeito para o inverno.",
    country: "IT",
    occasions: ["comfort_food"],
    equipment: ["stovetop" as const],
    ingredients: [
      {
        raw: "2 xícaras de arroz carnaroli",
        name: "arroz carnaroli",
        quantity: 2,
        unit: "xícara",
        core: true,
        quantityGrounding: "grounded" as const,
      },
      {
        raw: "parmesão ralado a gosto",
        name: "parmesão ralado",
        quantity: null,
        unit: "a gosto",
        core: false,
        quantityGrounding: "ambiguous" as const,
      },
    ],
    steps: [
      {
        text: "Refogue a cebola no azeite até ficar transparente.",
        minutes: 5,
        grounding: "grounded" as const,
      },
    ],
    nutrition: {
      calories: 420,
      protein: 12,
      carbs: 55,
      fat: 14,
    },
    sourceDivergence: [],
  };
}

describe("ImportedRecipeSchema", () => {
  it("accepts a valid recorded fixture output (EXT-01)", () => {
    const result = ImportedRecipeSchema.safeParse(validImportedRecipeFixture());
    expect(result.success).toBe(true);
  });

  it("accepts an ambiguous ingredient with quantity:null, unit:'a gosto', quantityGrounding:'ambiguous' and does not coerce quantity to a number (D-04)", () => {
    const fixture = validImportedRecipeFixture();
    const result = ImportedRecipeSchema.parse(fixture);
    const ambiguousIngredient = result.ingredients.find(
      (i) => i.quantityGrounding === "ambiguous",
    );
    expect(ambiguousIngredient).toBeDefined();
    expect(ambiguousIngredient?.quantity).toBeNull();
    expect(ambiguousIngredient?.unit).toBe("a gosto");
  });

  it("accepts a recorded output with titleGrounding:'inferred' (D-06 — missing title proposed by the model)", () => {
    const fixture = validImportedRecipeFixture();
    fixture.titleGrounding = "inferred";
    const result = ImportedRecipeSchema.safeParse(fixture);
    expect(result.success).toBe(true);
    expect(result.data?.titleGrounding).toBe("inferred");
  });

  it("rejects an out-of-enum grounding value", () => {
    const fixture = validImportedRecipeFixture() as unknown as Record<
      string,
      unknown
    >;
    fixture.titleGrounding = "very-grounded";
    const result = ImportedRecipeSchema.safeParse(fixture);
    expect(result.success).toBe(false);
  });
});

describe("buildImportUserContent", () => {
  it("contains both delimited labeled sections when transcript+caption are present", () => {
    const content = buildImportUserContent({
      transcript: "oi gente, hoje vou fazer um risoto",
      caption: "Risoto cremoso #receita",
      noSpeechDetected: false,
    });
    expect(content).toContain("Transcrição do áudio:");
    expect(content).toContain('"""');
    expect(content).toContain("oi gente, hoje vou fazer um risoto");
    expect(content).toContain("Legenda do post:");
    expect(content).toContain("Risoto cremoso #receita");
  });

  it("emits the no-speech marker when noSpeechDetected is true and no transcript is present", () => {
    const content = buildImportUserContent({
      noSpeechDetected: ambiguousSparse.noSpeechDetected,
      ...(ambiguousSparse.caption !== undefined && {
        caption: ambiguousSparse.caption,
      }),
    });
    expect(content).toContain("(sem fala detectada)");
    expect(content).not.toContain("undefined");
  });

  it("emits the no-caption marker when no caption is present", () => {
    const content = buildImportUserContent({
      transcript: "transcript sem legenda",
      noSpeechDetected: false,
    });
    expect(content).toContain("(sem legenda)");
  });

  it("never places transcript/caption content inside the system prompt string", async () => {
    const { IMPORT_RECONCILIATION_SYSTEM_PROMPT } = await import(
      "./import.extraction.js"
    );
    expect(IMPORT_RECONCILIATION_SYSTEM_PROMPT).not.toContain(
      "oi gente, hoje vou fazer um risoto",
    );
  });
});

describe("extractImportedRecipe", () => {
  beforeEach(() => {
    parse.mockReset();
  });

  it("returns parsed_output plus LLM token usage when the LLM call succeeds", async () => {
    const fixture = validImportedRecipeFixture();
    parse.mockResolvedValue({
      parsed_output: fixture,
      stop_reason: "end_turn",
      usage: { input_tokens: 1234, output_tokens: 567 },
    });

    const result = await extractImportedRecipe({
      transcript: "oi gente, hoje vou fazer um risoto",
      caption: "Risoto cremoso",
      noSpeechDetected: false,
    });

    expect(result.recipe).toEqual(fixture);
    expect(result.usage).toEqual({ inputTokens: 1234, outputTokens: 567 });
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it("throws an error including stop_reason when parsed_output is null", async () => {
    parse.mockResolvedValue({ parsed_output: null, stop_reason: "max_tokens" });

    await expect(
      extractImportedRecipe({
        transcript: "transcript longo",
        noSpeechDetected: false,
      }),
    ).rejects.toThrow(/max_tokens/);
  });
});
