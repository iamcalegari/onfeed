#!/usr/bin/env bash
#
# Build + push das imagens (API e Web) para o ECR.
# A criação dos serviços App Runner é feita depois (console ou CLI) — ver DEPLOY.md,
# porque depende de ARNs/role específicos da sua conta.
#
# Uso:
#   export AWS_REGION=us-east-1
#   export ACCOUNT_ID=123456789012
#   export NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_xxx   # embutido no build do web
#   ./scripts/deploy.sh
#
set -euo pipefail

: "${AWS_REGION:?defina AWS_REGION}"
: "${ACCOUNT_ID:?defina ACCOUNT_ID}"
: "${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:?defina NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}"

command -v aws >/dev/null || { echo "aws cli ausente"; exit 1; }
command -v docker >/dev/null || { echo "docker ausente"; exit 1; }

REGISTRY="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> login no ECR (${REGISTRY})"
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$REGISTRY"

# cria os repositórios se ainda não existirem (idempotente)
for repo in onfeed-api onfeed-web; do
  aws ecr describe-repositories --repository-names "$repo" --region "$AWS_REGION" >/dev/null 2>&1 \
    || aws ecr create-repository --repository-name "$repo" --region "$AWS_REGION" >/dev/null
done

echo "==> build + push: onfeed-api"
docker build -t "${REGISTRY}/onfeed-api:latest" "$REPO_ROOT"
docker push "${REGISTRY}/onfeed-api:latest"

echo "==> build + push: onfeed-web"
docker build \
  --build-arg "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}" \
  -t "${REGISTRY}/onfeed-web:latest" "${REPO_ROOT}/web"
docker push "${REGISTRY}/onfeed-web:latest"

echo
echo "==> Imagens no ECR. Próximo passo: criar/atualizar os serviços App Runner"
echo "    (porta 3000 p/ API, 3001 p/ Web) com as env vars e a instance role do DEPLOY.md."
