import type {
  IngestOptions,
  IngestRecipeInput,
} from "@/modules/recipes/recipe.ingestion.js";

export interface IngestJobMessage {
  jobId: string;
  input: IngestRecipeInput;
  opts: IngestOptions;
}
