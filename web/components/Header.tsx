import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";

/** Cabeçalho com a marca e os controles de conta (quando o Clerk está ligado). */
export function Header({ clerkEnabled }: { clerkEnabled: boolean }) {
  return (
    <header className="mx-auto flex w-full max-w-md items-center justify-between px-4 pt-4">
      <Link href="/" className="text-lg font-bold tracking-tight">
        onFeed <span aria-hidden>🍽️</span>
      </Link>

      {clerkEnabled && (
        <div className="flex items-center gap-2">
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className="text-sm font-medium text-stone-700">
                Entrar
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="rounded-full bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white">
                Criar conta
              </button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>
      )}
    </header>
  );
}
