#!/usr/bin/env bash
# Armazena os segredos da aplicação no SSM Parameter Store (SecureString).
# Execute uma vez antes do primeiro deploy — ou sempre que um segredo mudar.
#
# Pré-requisito: AWS CLI configurado com permissões em ssm:PutParameter.
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"

echo "Configurando parâmetros SSM para onfeed na região $REGION..."
echo "(Os valores ficam ocultos durante a digitação)"
echo ""

put_secure() {
  local name="$1"
  local value="$2"
  aws ssm put-parameter \
    --name "$name" \
    --value "$value" \
    --type SecureString \
    --overwrite \
    --region "$REGION" \
    --no-cli-pager \
    --query "Version" \
    --output text > /dev/null
  echo "  ✓ $name (versão atualizada)"
}

read_secret() {
  local prompt="$1"
  local value
  read -rsp "$prompt: " value
  echo ""
  echo "$value"
}

MONGODB_URI=$(read_secret "MONGODB_URI (mongodb+srv://...)")
put_secure "/onfeed/mongodb-uri" "$MONGODB_URI"

MONGODB_USERNAME=$(read_secret "MONGODB_USERNAME")
put_secure "/onfeed/mongodb-username" "$MONGODB_USERNAME"

MONGODB_PASSWORD=$(read_secret "MONGODB_PASSWORD")
put_secure "/onfeed/mongodb-password" "$MONGODB_PASSWORD"

VOYAGE_API_KEY=$(read_secret "VOYAGE_API_KEY")
put_secure "/onfeed/voyage-api-key" "$VOYAGE_API_KEY"

ANTHROPIC_API_KEY=$(read_secret "ANTHROPIC_API_KEY")
put_secure "/onfeed/anthropic-api-key" "$ANTHROPIC_API_KEY"

CLERK_SECRET_KEY=$(read_secret "CLERK_SECRET_KEY (sk_live_...)")
put_secure "/onfeed/clerk-secret-key" "$CLERK_SECRET_KEY"

CLERK_PUBLISHABLE_KEY=$(read_secret "CLERK_PUBLISHABLE_KEY (pk_live_...)")
put_secure "/onfeed/clerk-publishable-key" "$CLERK_PUBLISHABLE_KEY"

echo ""
echo "✓ Todos os segredos configurados no SSM em /onfeed/*"
echo "  Próximo passo: bash infra/scripts/bootstrap.sh"
