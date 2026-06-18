#!/usr/bin/env bash
# Build da Lambda + upload para S3 + deploy do CloudFormation.
# Execute sempre que o código da Lambda mudar.
#
# Uso:
#   npm run deploy:lambda
#   STACK=meu-stack npm run deploy:lambda   # stack customizado
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
BUCKET="${IMAGES_S3_BUCKET:-on-feed-recipes-dev}"
S3_KEY="lambda/ingest-handler.zip"
STACK="${STACK:-onfeed-ingest-pipeline}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIST="$ROOT/dist/lambda"

echo "[1/4] Bundling Lambda com esbuild..."
mkdir -p "$DIST"

# esbuild lê o tsconfig.json para resolver os path aliases (@/ → src/).
# --external:"@aws-sdk/*" não inclui o SDK no bundle — o runtime Node.js 22
# da Lambda já o fornece, economizando ~5MB e acelerando o cold start.
"$ROOT/node_modules/.bin/esbuild" \
  "$ROOT/src/lambda/ingest-handler.ts" \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=cjs \
  --outfile="$DIST/handler.js" \
  --external:"@aws-sdk/*" \
  --tsconfig="$ROOT/tsconfig.json"

BUNDLE_SIZE=$(du -sh "$DIST/handler.js" | cut -f1)
echo "    Bundle: $BUNDLE_SIZE"

echo "[2/4] Criando ZIP..."
cd "$DIST"
python3 -c "
import zipfile, os
with zipfile.ZipFile('ingest-handler.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    z.write('handler.js')
print('    ZIP:', round(os.path.getsize('ingest-handler.zip')/1024/1024, 1), 'MB')
"

echo "[3/4] Upload para s3://$BUCKET/$S3_KEY..."
aws s3 cp ingest-handler.zip "s3://$BUCKET/$S3_KEY" \
  --region "$REGION" \
  --no-cli-pager

echo "[4/4] Deploy do CloudFormation stack '$STACK'..."

# Lê segredos do SSM para passá-los como parâmetros NoEcho ao CloudFormation.
# Lambda não suporta {{resolve:ssm-secure:...}} em variáveis de ambiente.
ssm() { aws ssm get-parameter --name "$1" --with-decryption --query Parameter.Value --output text --region "$REGION" --no-cli-pager; }

aws cloudformation deploy \
  --stack-name "$STACK" \
  --template-file "$ROOT/infra/cloudformation/ingest-pipeline.yaml" \
  --parameter-overrides \
    LambdaS3Bucket="$BUCKET" \
    LambdaS3Key="$S3_KEY" \
    MongodbUri="$(ssm /onfeed/mongodb-uri)" \
    MongodbUsername="$(ssm /onfeed/mongodb-username)" \
    MongodbPassword="$(ssm /onfeed/mongodb-password)" \
    VoyageApiKey="$(ssm /onfeed/voyage-api-key)" \
    AnthropicApiKey="$(ssm /onfeed/anthropic-api-key)" \
  --capabilities CAPABILITY_NAMED_IAM \
  --region "$REGION" \
  --no-cli-pager

echo ""
echo "✓ Deploy concluído!"
echo ""
echo "Queue URL (adicione ao .env como SQS_INGEST_QUEUE_URL):"
aws cloudformation describe-stacks \
  --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='QueueUrl'].OutputValue" \
  --output text \
  --region "$REGION"

echo ""
echo "Dashboard CloudWatch:"
aws cloudformation describe-stacks \
  --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='DashboardUrl'].OutputValue" \
  --output text \
  --region "$REGION"
