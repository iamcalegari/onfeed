#!/usr/bin/env bash
# Inicia BE (porta 3000) e FE (porta 3001) em paralelo com logs prefixados.
# Uso: ./dev.sh
# Ctrl+C encerra os dois processos.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BE=$'\033[36m[BE]\033[0m'
FE=$'\033[35m[FE]\033[0m'

trap 'printf "\nencerrando...\n"; kill 0' EXIT INT TERM

printf "\033[1monfeed dev\033[0m\n"
printf "  backend  → \033[4mhttp://localhost:3000\033[0m\n"
printf "  frontend → \033[4mhttp://localhost:3001\033[0m\n\n"

(cd "$ROOT"      && yarn dev 2>&1 | while IFS= read -r line; do printf '%b %s\n' "$BE" "$line"; done) &
(cd "$ROOT/web"  && yarn dev 2>&1 | while IFS= read -r line; do printf '%b %s\n' "$FE" "$line"; done) &

wait
