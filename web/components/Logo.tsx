import Image from "next/image";
import Link from "next/link";

/**
 * Logomarca onFeed.
 * Ícone: PNG oficial com cantos arredondados já incorporados + fundo transparente.
 * Wordmark: "on" medium + "feed" bold em fonte display serif.
 */
export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5">
      {/*
        Sem rounded extra — a imagem já carrega os cantos arredondados.
        next/image entrega versão otimizada para o tamanho real exibido.
      */}
      <Image
        src="/app-icon.png"
        alt="onFeed"
        width={36}
        height={36}
        sizes="36px"
        className="shrink-0 rounded-[9px]"
        priority
      />
      <span className="font-display text-[1.2rem] leading-none tracking-tight text-forest select-none">
        <span className="font-medium">on</span>
        <span className="font-bold">feed</span>
      </span>
    </Link>
  );
}
