#!/usr/bin/env bash
# Primeiro deploy do onfeed.
#
# O que faz:
#   1. Verifica pré-requisitos (AWS CLI)
#   2. Garante que os segredos estão no SSM
#   3. Cria o stack de ingestão (SQS + Lambda) se ainda não existe
#   4. Cria o stack aws-infra (CloudFront + IAM user + OIDC GitHub)
#   5. Gera as credenciais AWS para o Render (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)
#   6. Imprime as env vars que precisam ser configuradas no Render
#
# Uso:
#   bash infra/scripts/bootstrap.sh
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
STACK_INGEST="onfeed-ingest-pipeline"
STACK_INFRA="onfeed-infra"

# Estados que indicam stack em estado saudável e completo
stack_ready() {
  local status
  status=$(aws cloudformation describe-stacks --stack-name "$1" \
    --region "$REGION" --no-cli-pager \
    --query "Stacks[0].StackStatus" --output text 2>/dev/null) || return 1
  [[ "$status" == "CREATE_COMPLETE" || "$status" == "UPDATE_COMPLETE" ]]
}
S3_BUCKET="${IMAGES_S3_BUCKET:-on-feed-recipes-dev}"
GITHUB_ORG="${GITHUB_ORG:-iamcalegari}"
GITHUB_REPO="${GITHUB_REPO:-onfeed}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

ok()   { echo "  ✓ $*"; }
info() { echo ""; echo "▶ $*"; }
err()  { echo "  ✗ $*" >&2; exit 1; }
ssm()  { aws ssm get-parameter --name "$1" --with-decryption --query Parameter.Value --output text --region "$REGION" --no-cli-pager; }

# ─── Pré-requisitos ───────────────────────────────────────────────────────

info "Verificando pré-requisitos..."
command -v aws >/dev/null 2>&1 || err "AWS CLI não encontrado. Instale: https://aws.amazon.com/cli/"
aws sts get-caller-identity --no-cli-pager >/dev/null 2>&1 || err "AWS CLI não configurado. Execute: aws configure"
ok "AWS ($ACCOUNT_ID) disponível"

# ─── Segredos no SSM ──────────────────────────────────────────────────────

info "Verificando segredos no SSM..."
MISSING_PARAMS=()
for param in \
  /onfeed/mongodb-uri \
  /onfeed/mongodb-username \
  /onfeed/mongodb-password \
  /onfeed/voyage-api-key \
  /onfeed/anthropic-api-key \
  /onfeed/clerk-secret-key \
  /onfeed/clerk-publishable-key; do
  if ! aws ssm get-parameter --name "$param" --region "$REGION" --no-cli-pager >/dev/null 2>&1; then
    MISSING_PARAMS+=("$param")
  fi
done

if [ ${#MISSING_PARAMS[@]} -gt 0 ]; then
  echo ""
  echo "  Parâmetros SSM faltando:"
  for p in "${MISSING_PARAMS[@]}"; do echo "    - $p"; done
  echo ""
  echo "  Execute primeiro: npm run setup:ssm"
  exit 1
fi
ok "Todos os segredos configurados no SSM"

# ─── Stack de ingestão (SQS + Lambda) ─────────────────────────────────────

info "Verificando stack de ingestão ($STACK_INGEST)..."
if stack_ready "$STACK_INGEST"; then
  ok "Stack $STACK_INGEST já existe e está pronta"
else
  echo "  Stack de ingestão não encontrado. Criando..."
  npm run build:lambda

  python3 -c "
import zipfile
with zipfile.ZipFile('dist/lambda/ingest-handler.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    z.write('dist/lambda/handler.js', 'handler.js')
"
  aws s3 cp dist/lambda/ingest-handler.zip \
    "s3://$S3_BUCKET/lambda/ingest-handler.zip" \
    --region "$REGION" --no-cli-pager

  aws cloudformation deploy \
    --stack-name "$STACK_INGEST" \
    --template-file "$ROOT/infra/cloudformation/ingest-pipeline.yaml" \
    --parameter-overrides \
      LambdaS3Bucket="$S3_BUCKET" \
      LambdaS3Key="lambda/ingest-handler.zip" \
      MongodbUri="$(ssm /onfeed/mongodb-uri)" \
      MongodbUsername="$(ssm /onfeed/mongodb-username)" \
      MongodbPassword="$(ssm /onfeed/mongodb-password)" \
      VoyageApiKey="$(ssm /onfeed/voyage-api-key)" \
      AnthropicApiKey="$(ssm /onfeed/anthropic-api-key)" \
    --capabilities CAPABILITY_NAMED_IAM \
    --region "$REGION" --no-cli-pager
  ok "Stack de ingestão criado"
fi

INGEST_QUEUE_ARN=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_INGEST" \
  --query "Stacks[0].Outputs[?OutputKey=='QueueArn'].OutputValue" \
  --output text --region "$REGION")
[[ -z "$INGEST_QUEUE_ARN" || "$INGEST_QUEUE_ARN" == "None" ]] && \
  err "QueueArn não encontrado nos outputs de $STACK_INGEST. Verifique o template ingest-pipeline.yaml."

INGEST_QUEUE_URL=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_INGEST" \
  --query "Stacks[0].Outputs[?OutputKey=='QueueUrl'].OutputValue" \
  --output text --region "$REGION")
[[ -z "$INGEST_QUEUE_URL" || "$INGEST_QUEUE_URL" == "None" ]] && \
  err "QueueUrl não encontrado nos outputs de $STACK_INGEST."

# ─── Stack aws-infra (CloudFront + IAM user + GitHub OIDC) ────────────────

info "Deployando stack de infra ($STACK_INFRA)..."
# CF recusa criar BucketPolicy se já existe uma criada fora do stack
aws s3api delete-bucket-policy --bucket "$S3_BUCKET" --region "$REGION" --no-cli-pager 2>/dev/null || true
aws cloudformation deploy \
  --stack-name "$STACK_INFRA" \
  --template-file "$ROOT/infra/cloudformation/aws-infra.yaml" \
  --parameter-overrides \
    ImagesS3Bucket="$S3_BUCKET" \
    IngestQueueArn="$INGEST_QUEUE_ARN" \
    GitHubOrg="$GITHUB_ORG" \
    GitHubRepo="$GITHUB_REPO" \
  --capabilities CAPABILITY_NAMED_IAM \
  --region "$REGION" --no-cli-pager
ok "Stack $STACK_INFRA criado"

get_output() {
  aws cloudformation describe-stacks \
    --stack-name "$STACK_INFRA" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" \
    --output text --region "$REGION"
}

CDN_DOMAIN=$(get_output "CDNDomain")
RENDER_USER=$(get_output "RenderApiUserName")
DEPLOY_ROLE_ARN=$(get_output "GitHubDeployRoleArn")

# ─── Credenciais IAM para o Render ────────────────────────────────────────

info "Gerando credenciais IAM para o Render (user: $RENDER_USER)..."

# Remove chaves antigas se existirem (IAM permite no máximo 2 por user)
EXISTING_KEYS=$(aws iam list-access-keys \
  --user-name "$RENDER_USER" \
  --query "AccessKeyMetadata[*].AccessKeyId" \
  --output text 2>/dev/null || echo "")
if [ -n "$EXISTING_KEYS" ]; then
  for key in $EXISTING_KEYS; do
    aws iam delete-access-key --user-name "$RENDER_USER" --access-key-id "$key"
    echo "  Removida chave antiga: $key"
  done
fi

ACCESS_KEY_JSON=$(aws iam create-access-key \
  --user-name "$RENDER_USER" \
  --output json)

AWS_KEY_ID=$(echo "$ACCESS_KEY_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['AccessKey']['AccessKeyId'])")
AWS_KEY_SECRET=$(echo "$ACCESS_KEY_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['AccessKey']['SecretAccessKey'])")
ok "Credenciais geradas"

# ─── Output final ─────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo " ✓ Bootstrap concluído!"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo " ── Configurar no Render ─────────────────────────────────────────"
echo " render.com → seu serviço → Environment → adicione estas variáveis:"
echo ""
echo "   AWS_ACCESS_KEY_ID=$AWS_KEY_ID"
echo "   AWS_SECRET_ACCESS_KEY=$AWS_KEY_SECRET"
echo "   IMAGES_CDN_DOMAIN=$CDN_DOMAIN"
echo "   SQS_INGEST_QUEUE_URL=$INGEST_QUEUE_URL"
echo "   MONGODB_URI=$(ssm /onfeed/mongodb-uri)"
echo "   MONGODB_USERNAME=$(ssm /onfeed/mongodb-username)"
echo "   MONGODB_PASSWORD=$(ssm /onfeed/mongodb-password)"
echo "   VOYAGE_API_KEY=$(ssm /onfeed/voyage-api-key)"
echo "   ANTHROPIC_API_KEY=$(ssm /onfeed/anthropic-api-key)"
echo "   CLERK_SECRET_KEY=$(ssm /onfeed/clerk-secret-key)"
echo "   CLERK_PUBLISHABLE_KEY=$(ssm /onfeed/clerk-publishable-key)"
echo ""
echo " ── Configurar no GitHub (para deploy da Lambda via CI) ──────────"
echo " Settings → Secrets → Actions → New repository secret"
echo ""
echo "   AWS_DEPLOY_ROLE_ARN=$DEPLOY_ROLE_ARN"
echo ""
echo " ── Vercel (frontend) ────────────────────────────────────────────"
echo " 1. vercel.com → Add New Project → Import do GitHub"
echo " 2. Root Directory: web"
echo " 3. Environment Variables:"
echo "    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$(ssm /onfeed/clerk-publishable-key)"
echo "    CLERK_SECRET_KEY=$(ssm /onfeed/clerk-secret-key)"
echo "    API_BASE_URL=<URL do seu serviço no Render>"
echo ""
echo " ── Render (próximos passos) ─────────────────────────────────────"
echo " 1. render.com → New → Web Service → Connect a repository"
echo " 2. Selecione o repo $GITHUB_ORG/$GITHUB_REPO"
echo "    (render.yaml será detectado automaticamente)"
echo " 3. Adicione as env vars listadas acima no dashboard"
echo " 4. O primeiro deploy será disparado automaticamente"
echo ""
echo " AVISO: Guarde AWS_SECRET_ACCESS_KEY agora — não é exibido de novo!"
echo "═══════════════════════════════════════════════════════════════════"
