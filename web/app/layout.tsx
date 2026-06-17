import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";

import { BottomNav } from "@/components/BottomNav";
import { Header } from "@/components/Header";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// Fraunces = substituta livre da Recoleta (serif suave). Trocável pela
// Recoleta licenciada depois, só ajustando --font-display no globals.css.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: ["500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "onFeed — receitas que combinam com você",
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
      <main className="mx-auto w-full max-w-md px-4 pb-28 pt-4">{children}</main>
      <BottomNav />
    </>
  );

  return (
    <html lang="pt-BR" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="min-h-screen">
        {clerkEnabled ? <ClerkProvider>{inner}</ClerkProvider> : inner}
      </body>
    </html>
  );
}
