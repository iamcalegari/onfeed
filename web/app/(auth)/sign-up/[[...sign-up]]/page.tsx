"use client";

import { SignUp } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";

const clerkVars = {
  colorPrimary:        "#0f2f2a",
  colorBackground:     "#ffffff",
  colorText:           "#2b2b2b",
  colorTextSecondary:  "#6b8480",
  colorInputBackground:"#ffffff",
  colorInputText:      "#2b2b2b",
  colorDanger:         "#c8583a",
  borderRadius:        "12px",
  fontFamily:          "var(--font-inter), ui-sans-serif, system-ui, sans-serif",
  fontSize:            "0.9rem",
  spacingUnit:         "14px",
};

const clerkElements = {
  rootBox:                 "w-full",
  card:                    "!shadow-none !bg-transparent !p-0 !rounded-none w-full",
  header:                  "hidden",
  socialButtonsBlockButton:"!border !border-areia !bg-white !rounded-xl !font-medium hover:!bg-areia/30 !transition-colors !text-carvao",
  socialButtonsBlockButtonText: "!font-medium",
  dividerRow:              "!my-5",
  dividerText:             "!text-carvao/30 !text-xs !uppercase !tracking-wider",
  dividerLine:             "!bg-areia",
  formFieldLabel:          "!text-sm !font-medium !text-carvao/70",
  formFieldInput:
    "!bg-white !border !border-areia !rounded-xl !text-carvao placeholder:!text-carvao/30 focus:!ring-2 focus:!ring-forest/15 focus:!border-forest/50",
  formButtonPrimary:
    "!bg-forest hover:!bg-forest/90 !text-creme !font-semibold !rounded-xl !transition-colors",
  footerActionLink:        "!text-forest !font-medium hover:!text-forest/70 !transition-colors",
  footer:                  "hidden",
};

export default function SignUpPage() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-creme">

      {/* Decoração de fundo */}
      <div
        className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-terracota/5"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-16 top-24 h-48 w-48 rounded-full bg-forest/5"
        aria-hidden
      />

      {/* ── Topo ──────────────────────────────────────────────── */}
      <div className="flex flex-col items-center px-6 pb-8 pt-14 text-center">
        <Link href="/" className="mb-6 flex flex-col items-center gap-3">
          <Image
            src="/app-icon.png"
            alt="onFeed"
            width={64}
            height={64}
            sizes="64px"
            className=""
            priority
          />
          <span className="font-display text-2xl tracking-tight text-forest">
            <span className="font-medium">on</span>
            <span className="font-bold">feed</span>
          </span>
        </Link>

        <p className="max-w-[24ch] text-[0.95rem] leading-relaxed text-carvao/55">
          Crie sua conta e comece a descobrir receitas incríveis.
        </p>
      </div>

      {/* ── Formulário ───────────────────────────────────────── */}
      <div
        className="relative z-10 mx-auto w-full max-w-sm flex-1 px-5"
        style={{ animation: "fade-up 0.45s ease 0.15s both" }}
      >
        <div className="mb-5 text-center">
          <h1 className="font-display text-xl font-semibold text-carvao">
            Criar conta
          </h1>
        </div>

        <div className="rounded-2xl border border-areia/60 bg-surface p-6 shadow-card">
          <SignUp
            appearance={{
              variables: clerkVars,
              elements:  clerkElements,
            }}
          />
        </div>

        <p className="mt-5 pb-10 text-center text-sm text-carvao/50">
          Já tem conta?{" "}
          <Link href="/sign-in" className="font-medium text-forest hover:text-forest/70 transition-colors">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
