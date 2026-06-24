import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";

import { CookMode } from "@/components/CookMode";
import { getRecipe } from "@/lib/api";

export default async function CookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const recipe = await getRecipe(id);
  if (!recipe) notFound();

  let canRate = false;
  try {
    canRate = (await auth()).userId !== null;
  } catch {
    canRate = false;
  }

  return <CookMode recipe={recipe} canRate={canRate} />;
}
