"use client";

import Link from "next/link";
import { useState } from "react";

import { flagEmoji, formatMinutes } from "@/lib/format";
import type { ImportedRecipeListItem } from "@/lib/types";

function statusFor(item: ImportedRecipeListItem): { label: string; href: string } {
  if (item.confirmedAt) {
    return { label: "Confirmada", href: `/recipe/${item._id}` };
  }
  // Ainda não confirmado: reviewRequired true ou false, o item só existe
  // aqui porque a receita já foi extraída — a tela de revisão é o próximo
  // passo em ambos os casos (nenhum PATCH de confirmação foi disparado).
  return { label: "Em revisão", href: `/import/${item._id}/review` };
}

function ImportRow({ item }: { item: ImportedRecipeListItem }) {
  const { label, href } = statusFor(item);

  return (
    <Link
      href={href}
      className="flex select-none gap-3 rounded-2xl border border-areia bg-surface p-3"
    >
      {item.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.thumbnailUrl}
          alt=""
          className="h-16 w-16 shrink-0 rounded-xl object-cover"
          draggable={false}
        />
      ) : (
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-areia/30 text-xl">
          🍽️
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate font-display text-base font-semibold text-carvao">
            <span className="mr-1">{flagEmoji(item.country)}</span>
            {item.title}
          </h3>
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{
              background: item.confirmedAt ? "var(--t-bg-section)" : "var(--t-warn-bg)",
              color: item.confirmedAt ? "var(--t-text-secondary)" : "var(--t-warn-fg)",
            }}
          >
            {label}
          </span>
        </div>
        <p className="line-clamp-2 text-xs text-carvao/55">{item.intro}</p>
        <span className="text-[11px] text-carvao/40">{formatMinutes(item.prepTimeMin)}</span>
      </div>
    </Link>
  );
}

export function ImportsList({ initialItems }: { initialItems: ImportedRecipeListItem[] }) {
  const [items] = useState<ImportedRecipeListItem[]>(initialItems);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="font-display text-lg font-semibold text-carvao/70">
          Nenhuma importação ainda
        </p>
        <p className="text-sm text-carvao/50">
          Cole o link de um vídeo de receita para começar.
        </p>
        <Link
          href="/import"
          className="mt-2 rounded-full bg-terracota px-4 py-2 text-sm font-bold text-creme"
        >
          Importar receita
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <ImportRow key={item._id} item={item} />
      ))}
    </div>
  );
}
