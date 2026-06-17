import { Type, type Static } from "@sinclair/typebox";

const EquipmentEnum = Type.Union([
  Type.Literal("stovetop"),
  Type.Literal("oven"),
  Type.Literal("microwave"),
  Type.Literal("blender"),
  Type.Literal("none"),
]);

const GoalEnum = Type.Union([
  Type.Literal("satiety"), // "matar a fome"
  Type.Literal("macros"), // "respeitar macros"
]);

/** Entrada da busca — espelha o User Input (I/E/T/N + ocasião). */
export const SearchRequestSchema = Type.Object(
  {
    // I — ingredientes que o usuário tem
    ingredients: Type.Array(Type.String({ minLength: 1 })),
    // E — equipamentos disponíveis
    equipment: Type.Optional(Type.Array(EquipmentEnum)),
    // T — tempo máximo disponível (faixas viram um teto em minutos)
    maxPrepTimeMin: Type.Optional(Type.Integer({ minimum: 1 })),
    // N — objetivo nutricional
    goal: Type.Optional(GoalEnum),
    // ocasião: tira-gosto / entrada / almoço...
    occasions: Type.Optional(Type.Array(Type.String())),
    note: Type.Optional(Type.String()),
    // nº de resultados (Card View pede mais, p/ formar packs de 25)
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  },
  { additionalProperties: false },
);

export type SearchRequest = Static<typeof SearchRequestSchema>;

const MissingIngredientSchema = Type.Object({
  canonicalId: Type.String(),
  name: Type.String(),
  core: Type.Boolean(),
});

const DimensionScoresSchema = Type.Object({
  i: Type.Number(),
  e: Type.Number(),
  t: Type.Number(),
  n: Type.Number(),
});

const SearchHitSchema = Type.Object({
  _id: Type.String(),
  title: Type.String(),
  intro: Type.String(),
  country: Type.String(),
  thumbnailUrl: Type.String(),
  prepTimeMin: Type.Number(),
  servings: Type.Number(),
  matchScore: Type.Number(),
  scores: DimensionScoresSchema,
  missing: Type.Array(MissingIngredientSchema),
  missingCoreCount: Type.Integer(),
  cookableNow: Type.Boolean(),
});

export const SearchResponseSchema = Type.Object({
  results: Type.Array(SearchHitSchema),
  unresolvedIngredients: Type.Array(Type.String()),
  // canonicalIds resolvidos do que o usuário tem — o front leva pro Details
  // marcar os ingredientes com ✓.
  haveIds: Type.Array(Type.String()),
});
