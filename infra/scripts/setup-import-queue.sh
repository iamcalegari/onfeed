#!/usr/bin/env bash
# Provisiona a fila SQS de import (onfeed-import) + sua DLQ (onfeed-import-dlq)
# com redrive policy (maxReceiveCount: 3). Idempotente — seguro re-executar.
#
# Fecha o gap que CONCERNS.md aponta na fila de ingest existente
# ("SQS Ingest Queue No Dead-Letter Queue"): a fila de import NÃO herda
# essa lacuna — a DLQ é criada primeiro e a fila principal referencia sua ARN.
#
# Pré-requisito: AWS CLI configurado com permissões em sqs:CreateQueue,
# sqs:GetQueueUrl, sqs:GetQueueAttributes, sqs:SetQueueAttributes.
#
# Uso:
#   npm run setup:import-queue
#   AWS_REGION=us-east-1 bash infra/scripts/setup-import-queue.sh
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
QUEUE_NAME="onfeed-import"
DLQ_NAME="onfeed-import-dlq"
MAX_RECEIVE_COUNT=3
# Visibility timeout do worker: ~6x o p95 esperado de processamento
# (download+transcrição+keyframe: 30s-3min) — 1200s (20min) dá margem
# confortável sem ser absurdo (ver 01-RESEARCH.md Common Pitfalls §4).
VISIBILITY_TIMEOUT=1200

echo "Provisionando fila de import onFeed na região $REGION..."
echo ""

get_or_create_queue_url() {
  local name="$1"
  local attrs_json="$2"

  local existing
  existing=$(aws sqs get-queue-url \
    --queue-name "$name" \
    --region "$REGION" \
    --no-cli-pager \
    --query "QueueUrl" \
    --output text 2>/dev/null || true)

  if [ -n "$existing" ] && [ "$existing" != "None" ]; then
    echo "  já existe: $name" >&2
    echo "$existing"
    return
  fi

  local created
  created=$(aws sqs create-queue \
    --queue-name "$name" \
    --attributes "$attrs_json" \
    --region "$REGION" \
    --no-cli-pager \
    --query "QueueUrl" \
    --output text)
  echo "  criada: $name" >&2
  echo "$created"
}

get_queue_arn() {
  local queue_url="$1"
  aws sqs get-queue-attributes \
    --queue-url "$queue_url" \
    --attribute-names QueueArn \
    --region "$REGION" \
    --no-cli-pager \
    --query "Attributes.QueueArn" \
    --output text
}

# 1) DLQ primeiro — a fila principal referencia sua ARN no RedrivePolicy.
echo "[1/3] Fila DLQ ($DLQ_NAME)..."
DLQ_URL=$(get_or_create_queue_url "$DLQ_NAME" '{"MessageRetentionPeriod":"1209600"}')
DLQ_ARN=$(get_queue_arn "$DLQ_URL")

# 2) Fila principal, com RedrivePolicy apontando para a DLQ.
# RedrivePolicy é uma string JSON *dentro* do JSON de atributos — a AWS CLI
# exige o valor como texto (não objeto aninhado), daí o escaping manual das
# aspas internas via \".
echo "[2/3] Fila principal ($QUEUE_NAME) com redrive policy (maxReceiveCount: $MAX_RECEIVE_COUNT)..."
REDRIVE_POLICY="{\\\"deadLetterTargetArn\\\":\\\"${DLQ_ARN}\\\",\\\"maxReceiveCount\\\":\\\"${MAX_RECEIVE_COUNT}\\\"}"
QUEUE_ATTRS="{\"VisibilityTimeout\":\"${VISIBILITY_TIMEOUT}\",\"RedrivePolicy\":\"${REDRIVE_POLICY}\"}"
QUEUE_URL=$(get_or_create_queue_url "$QUEUE_NAME" "$QUEUE_ATTRS")

# Se a fila já existia (idempotência), garante que o RedrivePolicy e o
# VisibilityTimeout estejam corretos mesmo assim (create-queue com atributos
# diferentes numa fila já existente é ignorado pela AWS silenciosamente).
echo "[3/3] Garantindo RedrivePolicy + VisibilityTimeout na fila existente..."
aws sqs set-queue-attributes \
  --queue-url "$QUEUE_URL" \
  --attributes "$QUEUE_ATTRS" \
  --region "$REGION" \
  --no-cli-pager

echo ""
echo "✓ Fila de import provisionada."
echo ""
echo "Copie estas URLs para o dashboard do Render (onfeed-import-worker + onfeed-api → Environment):"
echo ""
echo "SQS_IMPORT_QUEUE_URL=$QUEUE_URL"
echo "SQS_IMPORT_DLQ_URL=$DLQ_URL"
