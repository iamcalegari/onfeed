import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Receitas sob-demanda",
  description:
    "Diga o que você tem; a gente acha a receita que melhor combina (I/E/T/N).",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen">
        <main className="mx-auto w-full max-w-md px-4 pb-16 pt-6">
          {children}
        </main>
      </body>
    </html>
  );
}
