// Circuit breaker por plataforma (PIPE-07, D-02): rastreia uma janela
// deslizante de sucesso/falha por plataforma e, quando a taxa de falha
// cruza um limiar, interrompe novas tentativas em vez de martelar uma
// plataforma bloqueada/rate-limited. Estado em processo — adequado para uma
// única instância de worker no MVP (ver 01-RESEARCH.md Architecture Pattern
// 3); se o worker escalar horizontalmente depois, promover para uma coleção
// Mongo compartilhada é a nota de escalabilidade já documentada lá.

export type BreakerState = "closed" | "open" | "half_open";

interface PlatformStats {
  state: BreakerState;
  recentOutcomes: boolean[]; // ring buffer, mais recente no fim
  openedAt?: number; // epoch ms — quando o breaker abriu (para calcular cooldown)
}

// Constantes tunáveis — ponto de partida razoável (RESEARCH Architecture
// Pattern 3 / Assumption A3), não uma especificação externa travada.
const COOLDOWN_MS = 5 * 60_000; // 5 min antes de tentar half-open
const FAILURE_THRESHOLD = 0.7; // 70% de falha na janela abre o breaker
const MIN_SAMPLES = 5; // não dispara com amostra pequena demais
const WINDOW_SIZE = 20; // tamanho do ring buffer de outcomes recentes

const stats = new Map<string, PlatformStats>();

// Seam de clock injetável — permite testar transições de cooldown
// deterministicamente sem esperas reais.
let now: () => number = () => Date.now();

/** Permite que os testes injetem um clock determinístico. */
export function setClock(fn: () => number): void {
  now = fn;
}

/** Reseta o clock para Date.now() (uso em testes). */
export function resetClock(): void {
  now = () => Date.now();
}

/** Limpa todo o estado do breaker (uso em testes). */
export function resetForTest(): void {
  stats.clear();
  resetClock();
}

function getOrCreate(platform: string): PlatformStats {
  let s = stats.get(platform);
  if (!s) {
    s = { state: "closed", recentOutcomes: [] };
    stats.set(platform, s);
  }
  return s;
}

function failureRate(s: PlatformStats): number {
  if (s.recentOutcomes.length === 0) return 0;
  const failures = s.recentOutcomes.filter((success) => !success).length;
  return failures / s.recentOutcomes.length;
}

/**
 * Registra o resultado de uma tentativa (download) para a plataforma.
 * Atualiza o ring buffer e avalia transições de estado:
 *  - closed -> open: taxa de falha >= FAILURE_THRESHOLD com >= MIN_SAMPLES amostras
 *  - half_open -> closed: um outcome de sucesso durante o trial
 *  - half_open -> open: um outcome de falha durante o trial (novo cooldown)
 */
export function recordOutcome(platform: string, success: boolean): void {
  const s = getOrCreate(platform);

  s.recentOutcomes.push(success);
  if (s.recentOutcomes.length > WINDOW_SIZE) {
    s.recentOutcomes.shift();
  }

  if (s.state === "half_open") {
    if (success) {
      s.state = "closed";
      delete s.openedAt;
      s.recentOutcomes = []; // trial bem-sucedido: começa uma janela limpa
    } else {
      s.state = "open";
      s.openedAt = now();
    }
    return;
  }

  // closed (ou open reavaliado por segurança): checa se deve abrir.
  if (s.state === "closed" && s.recentOutcomes.length >= MIN_SAMPLES) {
    if (failureRate(s) >= FAILURE_THRESHOLD) {
      s.state = "open";
      s.openedAt = now();
    }
  }
}

/**
 * true se novas tentativas devem ser bloqueadas para essa plataforma.
 * Transiciona open -> half_open automaticamente após COOLDOWN_MS (nesse
 * caso retorna false para permitir uma tentativa de trial).
 */
export function isOpen(platform: string): boolean {
  const s = stats.get(platform);
  if (!s) return false;

  if (s.state === "open") {
    const openedAt = s.openedAt ?? now();
    if (now() - openedAt >= COOLDOWN_MS) {
      s.state = "half_open";
      return false;
    }
    return true;
  }

  return false;
}

/** Taxa de sucesso na janela recente (0 se não há amostras). */
export function successRate(platform: string): number {
  const s = stats.get(platform);
  if (!s || s.recentOutcomes.length === 0) return 0;
  return 1 - failureRate(s);
}
