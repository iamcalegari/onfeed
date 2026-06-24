/**
 * Orchestrador de scripts de banco de dados.
 *
 * Modos:
 *   npm run db:bootstrap  — ambiente novo: cria coleções + semeia ingredientes
 *   npm run db:migrate    — pós-ingestão: enriquece receitas existentes
 *   npm run db:sync       — bootstrap + migrate (reset completo ou primeiro setup)
 *
 * Flags:
 *   --dry-run   repassa --dry-run para cada script que aceitar
 *   --help      mostra esta ajuda
 *
 * Todos os scripts individuais são idempotentes — rodar de novo é seguro.
 */

import { spawnSync } from "child_process";

/* ── Tipos ──────────────────────────────────────────────────── */

type Step = {
  label: string;
  script: string;
  /** Quando true, passa --dry-run se a flag estiver presente */
  supportsDryRun?: boolean;
  /** Quando true, o passo é pulado no dry-run (sem sentido executá-lo) */
  skipOnDryRun?: boolean;
  /** Se false, uma falha NÃO interrompe a cadeia (aviso e segue) */
  required?: boolean;
};

/* ── Definição das cadeias ──────────────────────────────────── */

const BOOTSTRAP_STEPS: Step[] = [
  {
    label: "Criar coleções, validators e índices",
    script: "setup:db",
  },
  {
    label: "Semear catálogo canônico de ingredientes",
    script: "seed:ingredients",
  },
];

const MIGRATE_STEPS: Step[] = [
  {
    label: "Sync de schema (validators e índices novos)",
    script: "setup:db",
  },
  {
    label: "Preencher quantity + unit nos ingredientes",
    script: "migrate:quantities",
    supportsDryRun: true,
  },
  {
    label: "Reconciliar ingredientes pending com o catálogo",
    script: "reconcile:ingredients",
    supportsDryRun: true,
  },
  {
    label: "Marcar receitas de bebida com occasions:drinks",
    script: "migrate:drinks",
    supportsDryRun: true,
  },
  {
    label: "Inferir dietaryTags (vegetariano, vegano, sem glúten…)",
    script: "infer:dietary-tags",
    supportsDryRun: true,
  },
];

/* ── Helpers de terminal ─────────────────────────────────────── */

const C = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  red:    "\x1b[31m",
  cyan:   "\x1b[36m",
  gray:   "\x1b[90m",
};

function header(title: string) {
  const line = "─".repeat(52);
  console.log(`\n${C.cyan}${C.bold}${line}${C.reset}`);
  console.log(`${C.cyan}${C.bold}  ${title}${C.reset}`);
  console.log(`${C.cyan}${C.bold}${line}${C.reset}\n`);
}

function stepLine(n: number, total: number, label: string) {
  console.log(`${C.bold}[${n}/${total}]${C.reset} ${label}`);
}

function ok(ms: number) {
  console.log(`${C.green}  ✓ concluído ${C.gray}(${ms}ms)${C.reset}\n`);
}

function warn(label: string) {
  console.log(`${C.yellow}  ⚠ falhou — continuando (não obrigatório)${C.reset}\n`);
}

function die(label: string, code: number) {
  console.error(`${C.red}${C.bold}  ✗ falhou com código ${code}${C.reset}`);
  console.error(`${C.red}  Passo: ${label}${C.reset}\n`);
  process.exit(1);
}

/* ── Executor ────────────────────────────────────────────────── */

function run(steps: Step[], dryRun: boolean) {
  const total = steps.length;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    const n = i + 1;

    stepLine(n, total, step.label);

    if (dryRun && step.skipOnDryRun) {
      console.log(`${C.dim}  (pulado em dry-run)${C.reset}\n`);
      continue;
    }

    const extraArgs = dryRun && step.supportsDryRun ? ["--", "--dry-run"] : [];
    const t0 = Date.now();

    const result = spawnSync(
      "npm",
      ["run", step.script, ...extraArgs],
      { stdio: "inherit", shell: true },
    );

    if (result.status !== 0) {
      if (step.required === false) {
        warn(step.label);
      } else {
        die(step.label, result.status ?? 1);
      }
    } else {
      ok(Date.now() - t0);
    }
  }
}

/* ── Ajuda ───────────────────────────────────────────────────── */

function printHelp() {
  console.log(`
${C.bold}db-prepare — orchestrador de scripts de banco${C.reset}

${C.cyan}Uso:${C.reset}
  npm run db:bootstrap   Novo ambiente: cria coleções + semeia ingredientes
  npm run db:migrate     Pós-ingestão: enriquece receitas existentes
  npm run db:sync        Bootstrap + migrate em sequência

${C.cyan}Cadeia bootstrap:${C.reset}
  1. setup:db            Cria coleções, validators e vector search index
  2. seed:ingredients    Popula catálogo canônico de ingredientes com embeddings

${C.cyan}Cadeia migrate (pós-ingestão ou após schema change):${C.reset}
  1. setup:db            Sincroniza validators e índices com o código atual
  2. migrate:quantities  Preenche quantity+unit nos ingredientes via LLM
  3. reconcile           Resolve ingredientes pending → canônicos
  4. migrate:drinks      Marca bebidas com occasions:["drinks"]
  5. infer:dietary-tags  Infere vegetariano/vegano/sem glúten/sem lactose

${C.cyan}Flags:${C.reset}
  --dry-run  Mostra o que seria feito sem alterar dados (onde suportado)
  --help     Esta ajuda

${C.cyan}Scripts individuais disponíveis:${C.reset}
  npm run setup:db              npm run seed:ingredients
  npm run ingest:dataset        npm run seed:recipes
  npm run migrate:quantities    npm run reconcile:ingredients
  npm run migrate:drinks        npm run migrate:thumbnails
  npm run infer:dietary-tags    npm run db:status
`);
}

/* ── Main ────────────────────────────────────────────────────── */

const args = process.argv.slice(2);
const mode = args.find(a => !a.startsWith("--")) ?? "";
const dryRun = args.includes("--dry-run");
const help = args.includes("--help") || args.includes("-h");

if (help || !mode) {
  printHelp();
  process.exit(0);
}

const DRY_TAG = dryRun ? ` ${C.yellow}[dry-run]${C.reset}` : "";

if (mode === "bootstrap") {
  header(`Bootstrap${DRY_TAG}`);
  run(BOOTSTRAP_STEPS, dryRun);
  console.log(`${C.green}${C.bold}Bootstrap concluído.${C.reset}`);
  console.log(`${C.dim}Próximo: ingira receitas com npm run ingest:dataset${C.reset}\n`);

} else if (mode === "migrate") {
  header(`Migrate${DRY_TAG}`);
  run(MIGRATE_STEPS, dryRun);
  console.log(`${C.green}${C.bold}Migrate concluído.${C.reset}`);
  console.log(`${C.dim}Verifique o estado com npm run db:status${C.reset}\n`);

} else if (mode === "sync") {
  header(`Sync (bootstrap + migrate)${DRY_TAG}`);
  run([...BOOTSTRAP_STEPS, ...MIGRATE_STEPS], dryRun);
  console.log(`${C.green}${C.bold}Sync concluído.${C.reset}`);
  console.log(`${C.dim}Verifique o estado com npm run db:status${C.reset}\n`);

} else {
  console.error(`${C.red}Modo desconhecido: "${mode}". Use bootstrap, migrate ou sync.${C.reset}`);
  process.exit(1);
}
