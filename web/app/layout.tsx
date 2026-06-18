import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import { cookies } from "next/headers";

import { THEME_SCRIPT } from "@/lib/settings";
import type { Theme } from "@/lib/settings";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

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
  icons: {
    icon: "/app-icon.png",
    apple: "/app-icon.png",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  const cookieStore = await cookies();
  const theme = (cookieStore.get("theme")?.value ?? "system") as Theme;
  const isDark = theme === "dark";

  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} ${fraunces.variable}${isDark ? " dark" : ""}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen">
        {clerkEnabled ? (
          <ClerkProvider>{children}</ClerkProvider>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
