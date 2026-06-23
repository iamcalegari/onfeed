import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { DM_Serif_Display, Inter } from "next/font/google";
import { cookies } from "next/headers";

import { SessionRefresher } from "@/components/SessionRefresher";
import { THEME_SCRIPT } from "@/lib/settings";
import type { Theme } from "@/lib/settings";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  variable: "--font-dm-serif",
  weight: ["400"],
  style: ["normal", "italic"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#162f25",
};

export const metadata: Metadata = {
  title: "onFeed — receitas que combinam com você",
  description:
    "Diga o que você tem; a gente acha a receita que melhor combina (I/E/T/N).",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "onFeed",
  },
  icons: {
    icon: "/app-icon.png",
    apple: [
      { url: "/app-icon.png", sizes: "192x192" },
      { url: "/app-icon.png", sizes: "512x512" },
    ],
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  const cookieStore = await cookies();
  const theme = (cookieStore.get("theme")?.value ?? "light") as Theme;
  const isDark = theme === "dark";

  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} ${dmSerif.variable}${isDark ? " dark" : ""}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen">
        {clerkEnabled ? (
          <ClerkProvider afterSignOutUrl="/">
            <SessionRefresher />
            {children}
          </ClerkProvider>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
