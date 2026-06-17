import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";

import { Header } from "@/components/Header";
import "./globals.css";

export const metadata: Metadata = {
  title: "onFeed — receitas sob-demanda",
  description:
    "Diga o que você tem; a gente acha a receita que melhor combina (I/E/T/N).",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  const inner = (
    <>
      <Header clerkEnabled={clerkEnabled} />
      <main className="mx-auto w-full max-w-md px-4 pb-16 pt-6">{children}</main>
    </>
  );

  return (
    <html lang="pt-BR">
      <body className="min-h-screen">
        {/* ClerkProvider dentro do <body> (convenção atual); condicional pra
            o app rodar sem as chaves configuradas. */}
        {clerkEnabled ? <ClerkProvider>{inner}</ClerkProvider> : inner}
      </body>
    </html>
  );
}
