import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";

import { getImportJobAction } from "@/app/actions";
import { ImportReviewForm } from "@/components/ImportReviewForm";
import { getRecipe } from "@/lib/api";

export default async function ImportReviewPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { jobId } = await params;

  // Duas idas ao backend (Open Question 2 resolvida): primeiro o job (pra
  // pegar o recipeId), depois a receita completa com grounding. O job NÃO
  // embute a receita na resposta do polling.
  const job = await getImportJobAction(jobId);
  if (!job.recipeId) notFound();

  const recipe = await getRecipe(job.recipeId);
  if (!recipe) notFound();

  return <ImportReviewForm jobId={jobId} initialRecipe={recipe} />;
}
