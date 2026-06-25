"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { getGoals, type NutritionGoals } from "@/lib/nutritionPlan";
import { getLatestWeight } from "@/lib/weightStorage";
import { usePro } from "@/lib/usePro";
import { showToast } from "@/lib/toast";

const PROFILE_KEY = "onfeed:profile";

interface Profile {
  name: string;
}

function loadProfile(): Profile {
  if (typeof window === "undefined") return { name: "" };
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : { name: "" };
  } catch { return { name: "" }; }
}

function saveProfile(p: Profile) {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

function initials(name: string): string {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() || "👤";
}

export default function PerfilPage() {
  const router = useRouter();
  const pro = usePro();
  const { isSignedIn, isLoaded } = useAuth();
  const { user } = useUser();
  const [streak, setStreak]       = useState(0);
  const [goals, setGoalsState]    = useState<NutritionGoals | null>(null);
  const [profileName, setProfileName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName]  = useState("");
  const [latestKg, setLatestKg]   = useState<{ kg: number } | null>(null);
  const [mounted, setMounted]     = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  // Preenche o nome com o do Clerk se ainda não tiver nome salvo
  useEffect(() => {
    if (user?.fullName) {
      const saved = loadProfile();
      if (!saved.name && user.fullName) {
        const clerkName = user.fullName;
        setProfileName(clerkName);
        setDraftName(clerkName);
        saveProfile({ name: clerkName });
      }
    }
  }, [user]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("onfeed:streak");
      if (raw) setStreak(JSON.parse(raw).count ?? 0);
    } catch { /* ignore */ }
    setGoalsState(getGoals());
    const p = loadProfile();
    setProfileName(p.name);
    setDraftName(p.name);
    setLatestKg(getLatestWeight());
    setMounted(true);
  }, []);

  function saveName() {
    const trimmed = draftName.trim();
    setProfileName(trimmed);
    saveProfile({ name: trimmed });
    setEditingName(false);
  }

  async function handleSubscribe() {
    if (subscribing) return;
    if (pro.isPro) { showToast("Você já é PRO ✨", "✅"); return; }
    const email = user?.primaryEmailAddress?.emailAddress;
    if (!email) { showToast("Não foi possível obter seu e-mail", "⚠️"); return; }
    setSubscribing(true);
    try {
      const res = await fetch("/api/billing/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Falha ao iniciar a assinatura");
      window.location.href = data.initPoint as string;
    } catch (e) {
      showToast((e as Error).message || "Não foi possível assinar agora", "⚠️");
      setSubscribing(false);
    }
  }

  // Aguarda Clerk carregar para não piscar o conteúdo errado
  if (!isLoaded) return null;

  // Deslogado — mostra estado de visitante
  if (!isSignedIn) {
    return (
      <div className="flex flex-col items-center gap-5 py-16 text-center">
        <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--t-bd-card)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>
          👤
        </div>
        <div>
          <p style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--t-text-title)" }}>Bem-vindo ao onFeed</p>
          <p style={{ fontSize: 13, color: "var(--t-text-muted)", marginTop: 6 }}>Entre para salvar seu perfil, metas e favoritos.</p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/sign-in")}
          style={{ background: "var(--t-bg-hero)", color: "var(--t-hero-fg)", borderRadius: 14, padding: "13px 32px", fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer" }}
        >
          Entrar na conta
        </button>
        <button
          type="button"
          onClick={() => router.push("/sign-up")}
          style={{ fontSize: 13, color: "var(--t-text-muted)", background: "none", border: "none", cursor: "pointer" }}
        >
          Criar conta grátis
        </button>
      </div>
    );
  }

  const displayName = profileName || "Meu Perfil";
  const ini = profileName ? initials(profileName) : "👤";

  const SETTINGS = [
    { icon: "🥑", title: "Preferências de dieta", sub: "Restrições e preferências alimentares", href: "/settings" },
    { icon: "🧺", title: "Minha despensa",          sub: "Ingredientes que você sempre tem",      href: "/pantry"   },
    { icon: "⚙️", title: "Configurações",           sub: "Conta, notificações e dados",           href: "/settings" },
  ];

  return (
    <div className="flex flex-col gap-4 pb-4" style={{ animation: "ofRise .28s ease both" }}>

      {/* ── Avatar + nome ─────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
        <div style={{
          width: 62, height: 62, borderRadius: "50%",
          background: "repeating-linear-gradient(135deg,#e9ddc7 0 7px,#dccaa9 7px 14px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: profileName ? "var(--font-display)" : "Inter,sans-serif",
          fontSize: profileName ? 24 : 28,
          color: "var(--t-text-title)", flexShrink: 0,
        }}>
          {ini}
        </div>
        <div style={{ flex: 1 }}>
          {editingName ? (
            <div style={{ display: "flex", gap: 8 }}>
              <input
                autoFocus
                value={draftName}
                onChange={e => setDraftName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && saveName()}
                placeholder="Seu nome"
                style={{
                  flex: 1, fontSize: 16, color: "var(--t-text-title)", background: "var(--t-bg-card)",
                  border: "1px solid var(--t-bd-strong)", borderRadius: 10, padding: "6px 10px",
                  outline: "none",
                }}
              />
              <button type="button" onClick={saveName}
                style={{ background: "var(--t-bg-hero)", color: "var(--t-hero-fg)", borderRadius: 10, padding: "6px 12px", fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer" }}>
                OK
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 23, color: "var(--t-text-title)" }}>
                {displayName}
              </div>
              <button type="button" onClick={() => { setDraftName(profileName); setEditingName(true); }}
                style={{ fontSize: 12, color: "var(--t-text-muted)", background: "none", border: "none", cursor: "pointer" }}>
                ✏️
              </button>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5, flexWrap: "wrap" }}>
            <span
              onClick={() => router.push("/progresso")}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                fontSize: 11, fontWeight: 800, letterSpacing: 0.4, borderRadius: 20, padding: "3px 9px", cursor: "pointer",
                background: pro.isPro ? "var(--t-carb-bg)" : "var(--t-bg-section)",
                color:      pro.isPro ? "var(--t-pro-chip-fg)" : "var(--t-text-muted)",
                border:     `1px solid ${pro.isPro ? "var(--t-pro-chip-bd)" : "var(--t-bd-soft)"}`,
              }}
            >
              {pro.isPro ? "✦ PRO" : "Plano grátis"}
            </span>
            {streak > 0 && (
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 13 }}>🔥</span>
                <span style={{ fontSize: 13, color: "#f45d22", fontWeight: 700 }}>{streak} {streak === 1 ? "dia" : "dias"}</span>
              </span>
            )}
          </div>
          {latestKg && (
            <div style={{ fontSize: 12, color: "var(--t-text-muted)", marginTop: 2 }}>
              Peso atual: {latestKg.kg.toLocaleString("pt-BR", { minimumFractionDigits: 1 })} kg
            </div>
          )}
        </div>
      </div>

      {/* ── Minha meta (dark card) ─────────────────────────────── */}
      {mounted && (
        <div style={{ background: "var(--t-bg-hero)", borderRadius: 22, padding: 20, color: "var(--t-hero-fg)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "var(--t-hero-fg2)" }}>
              Minha meta
            </span>
            <button
              type="button"
              onClick={() => router.push("/onboarding")}
              style={{ fontSize: 12.5, color: "#e0c9a6", fontWeight: 700, background: "none", border: "none", cursor: "pointer" }}
            >
              {goals ? "Editar" : "Configurar"}
            </button>
          </div>

          {goals ? (
            <>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--t-hero-fg2)", marginTop: 10 }}>
                {goals.calories >= 1800 ? "Manutenção de peso" : "Perda de peso"} · {goals.calories} kcal/dia
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 30, fontVariantNumeric: "tabular-nums" }}>
                  {goals.calories.toLocaleString("pt-BR")}
                </span>
                <span style={{ fontSize: 13, color: "var(--t-hero-fg2)" }}>kcal / dia</span>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <MacroChip value={goals.protein} label="Proteína" color="#9cc0f0" bg="rgba(74,127,203,.18)" />
                <MacroChip value={goals.carbs}   label="Carbo"    color="#f0c069" bg="rgba(232,160,32,.18)" />
                <MacroChip value={goals.fat}     label="Gordura"  color="#eaa08c" bg="rgba(212,100,74,.18)" />
              </div>
            </>
          ) : (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 14, color: "var(--t-hero-fg2)" }}>Sem meta configurada.</div>
              <button
                type="button"
                onClick={() => router.push("/onboarding")}
                style={{ marginTop: 12, background: "#e0c9a6", color: "var(--t-text-title)", borderRadius: 12, padding: "10px 16px", fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer" }}
              >
                Configurar metas →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Settings list ─────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {SETTINGS.map(s => (
          <button
            key={s.title}
            type="button"
            onClick={() => router.push(s.href)}
            style={{ background: "var(--t-bg-card)", border: "1px solid var(--t-bd-card)", borderRadius: 16, padding: "15px 16px", display: "flex", alignItems: "center", gap: 13, cursor: "pointer", textAlign: "left" }}
          >
            <span style={{ width: 38, height: 38, borderRadius: 11, background: "var(--t-bg-section)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>
              {s.icon}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--t-text-primary)" }}>{s.title}</div>
              <div style={{ fontSize: 12, color: "var(--t-text-muted)", fontWeight: 500, marginTop: 1 }}>{s.sub}</div>
            </div>
            <span style={{ color: "var(--t-text-hint)", fontSize: 18 }}>›</span>
          </button>
        ))}
      </div>

      {/* ── Pro upsell (some quando já é PRO) ───────────────────── */}
      {!pro.isPro && (
      <div style={{ background: "linear-gradient(125deg,#d4644a,#e0865f)", borderRadius: 22, padding: 22, color: "#fff", boxShadow: "0 12px 28px -12px rgba(212,100,74,.6)" }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5 }}>✨ ONFEED PRO</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 21, marginTop: 8, lineHeight: 1.2 }}>
          Planos com IA, histórico ilimitado e muito mais
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 12 }}>
          <span style={{ fontSize: 24, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>R$ 19,90</span>
          <span style={{ fontSize: 13, opacity: 0.85 }}>/mês</span>
        </div>
        <button
          type="button"
          onClick={handleSubscribe}
          disabled={subscribing}
          style={{ background: "var(--t-bg-card)", color: "#d4644a", borderRadius: 14, padding: 13, textAlign: "center", fontSize: 14, fontWeight: 800, marginTop: 14, cursor: subscribing ? "default" : "pointer", border: "none", width: "100%", opacity: subscribing ? 0.7 : 1 }}
        >
          {subscribing ? "Redirecionando…" : "Testar 7 dias grátis"}
        </button>
      </div>
      )}
    </div>
  );
}

function MacroChip({ value, label, color, bg }: { value: number; label: string; color: string; bg: string }) {
  return (
    <div style={{ flex: 1, background: bg, borderRadius: 12, padding: 10, textAlign: "center" }}>
      <div style={{ fontSize: 15, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>{value}g</div>
      <div style={{ fontSize: 10, color: "var(--t-hero-fg2)", marginTop: 2 }}>{label}</div>
    </div>
  );
}
