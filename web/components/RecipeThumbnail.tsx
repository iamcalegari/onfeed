import { LazyThumbnail } from "./LazyThumbnail";

/**
 * Hero do detalhe com geração lazy. Reusa o LazyThumbnail (mesma lógica de
 * geração por visibilidade dos cards), só com o tamanho do hero.
 */
export function RecipeThumbnail({
  recipeId,
  initialUrl,
}: {
  recipeId: string;
  initialUrl: string;
}) {
  return (
    <LazyThumbnail
      recipeId={recipeId}
      initialUrl={initialUrl}
      className="h-44 w-full"
      rounded="rounded-2xl"
      iconClassName="text-5xl"
    />
  );
}
