"use client";

import { SignIn } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";

/* Paleta usada pelo Clerk component (espelha o design system) */
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
  identityPreviewText:     "!text-carvao",
  identityPreviewEditButton: "!text-forest",
  formResendCodeLink:      "!text-forest",
};

export default function SignInPage() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-creme">

      {/* ── Painel superior: identidade da marca ──────────────── */}
      <div className="relative flex flex-col items-center justify-end px-6 pb-10 pt-16 text-center">

        {/* Decoração: círculo grande desfocado no canto */}
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-forest/6"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -left-16 top-20 h-48 w-48 rounded-full bg-terracota/5"
          aria-hidden
        />

        {/* Logo */}
        <Link href="/" className="mb-6 flex flex-col items-center gap-3">
          <div
            className="relative"
            style={{ animation: "logo-breathe 3s ease-in-out infinite" }}
          >
            <Image
              src="/app-icon.png"
              alt="onFeed"
              width={72}
              height={72}
              sizes="72px"
              className="rounded-[18px]"
              priority
            />
          </div>
          <span className="font-display text-2xl tracking-tight text-forest">
            <span className="font-medium">on</span>
            <span className="font-bold">feed</span>
          </span>
        </Link>

        <p
          className="max-w-[22ch] text-[0.95rem] leading-relaxed text-carvao/55"
          style={{ animation: "fade-up 0.5s ease 0.1s both" }}
        >
          Diga o que você tem em casa.<br />
          A receita aparece na hora.
        </p>
      </div>

      {/* ── Card de formulário ────────────────────────────────── */}
      <div
        className="relative z-10 mx-auto w-full max-w-sm flex-1 px-5"
        style={{ animation: "fade-up 0.45s ease 0.2s both" }}
      >
        {/* Título customizado acima do componente Clerk */}
        <div className="mb-5 text-center">
          <h1 className="font-display text-xl font-semibold text-carvao">
            Entre na sua conta
          </h1>
        </div>

        <div className="rounded-2xl border border-areia/60 bg-surface p-6 shadow-card">
          <SignIn
            appearance={{
              variables: clerkVars,
              elements:  clerkElements,
            }}
          />
        </div>

        {/* Link para cadastro */}
        <p className="mt-5 pb-10 text-center text-sm text-carvao/50">
          Não tem conta?{" "}
          <Link href="/sign-up" className="font-medium text-forest hover:text-forest/70 transition-colors">
            Criar conta
          </Link>
        </p>
      </div>
    </div>
  );
}
