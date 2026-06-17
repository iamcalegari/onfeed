# Deploy (AWS)

Dois containers (**API** Fastify e **Web** Next.js) no **AWS App Runner**, com
**MongoDB Atlas**, **Clerk**, **Voyage**, **Anthropic** e **Bedrock+S3+CloudFront**
para imagens. (App Runner pode ser trocado por **Lightsail Containers** — mesmo
container, custo fixo mais previsível.)

## Pré-requisitos
- Conta AWS + Docker instalado.
- Cluster **MongoDB Atlas** (Vector Search habilitado) com os search indexes já
  criados (`yarn setup:db` rodado uma vez apontando pro cluster).
- App no **Clerk** (chaves `pk_live_…` / `sk_live_…`).
- Chaves **Voyage** e **Anthropic**.

---

## 1. S3 + CloudFront (imagens)
```bash
aws s3 mb s3://onfeed-images --region us-east-1
```
(Opcional, recomendado) Crie uma distribuição CloudFront com origem nesse bucket
e use o domínio em `IMAGES_CDN_DOMAIN`. Sem CloudFront, as URLs apontam direto
pro S3 (deixe o bucket com leitura pública só nos objetos `recipes/*`).

## 2. IAM (instance role da API)
A API (App Runner) precisa de uma **instance role** com:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["bedrock:InvokeModel"],
      "Resource": "arn:aws:bedrock:*::foundation-model/*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject"],
      "Resource": "arn:aws:s3:::onfeed-images/*"
    }
  ]
}
```
> Habilite o modelo de imagem no **Bedrock → Model access** antes (o gerador
> suporta Stability AI e Amazon Titan/Nova; default `stability.stable-image-core-v1:0`).
> O `Resource` acima cobre qualquer foundation model — pode estreitar pro id escolhido.

## 3. Build & push das imagens (ECR)
```bash
ACCT=<sua-conta>; REGION=us-east-1
aws ecr create-repository --repository-name onfeed-api
aws ecr create-repository --repository-name onfeed-web
aws ecr get-login-password --region $REGION | \
  docker login --username AWS --password-stdin $ACCT.dkr.ecr.$REGION.amazonaws.com

# API (a partir da raiz do repo)
docker build -t $ACCT.dkr.ecr.$REGION.amazonaws.com/onfeed-api:latest .
docker push $ACCT.dkr.ecr.$REGION.amazonaws.com/onfeed-api:latest

# Web (NEXT_PUBLIC_* é embutido no build → passa como build-arg)
docker build -t $ACCT.dkr.ecr.$REGION.amazonaws.com/onfeed-web:latest \
  --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_xxx ./web
docker push $ACCT.dkr.ecr.$REGION.amazonaws.com/onfeed-web:latest
```

## 4. App Runner — serviço API
- Source: imagem `onfeed-api` no ECR. **Porta: 3000.**
- Instance role: a do passo 2.
- Env vars:

| Var | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `MONGODB_URI` / `MONGODB_USERNAME` / `MONGODB_PASSWORD` / `MONGODB_DB_NAME` | do Atlas |
| `VOYAGE_API_KEY` | Voyage |
| `ANTHROPIC_API_KEY` | Anthropic |
| `CLERK_SECRET_KEY` / `CLERK_PUBLISHABLE_KEY` | Clerk |
| `FRONTEND_ORIGIN` | URL do serviço Web (preenche no passo 6) |
| `AWS_REGION` | `us-east-1` |
| `IMAGES_S3_BUCKET` | `onfeed-images` |
| `IMAGES_CDN_DOMAIN` | domínio do CloudFront (se houver) |
| `BEDROCK_IMAGE_MODEL` | `stability.stable-image-core-v1:0` |
| `BEDROCK_REGION` | região do modelo (ex: `us-west-2` p/ Stability; default = `AWS_REGION`) |

## 5. App Runner — serviço Web
- Source: imagem `onfeed-web`. **Porta: 3001.**
- Env vars:

| Var | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `API_BASE_URL` | URL https do serviço **API** |
| `CLERK_SECRET_KEY` | Clerk |

> O `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` já foi embutido no build (passo 3).

## 6. Amarrar as pontas
- Pegue a URL do serviço **Web** e coloque em `FRONTEND_ORIGIN` da **API** (CORS).
- No **Clerk → Domains**, adicione a URL do Web (origens permitidas).
- Redeploy da API pra aplicar o `FRONTEND_ORIGIN`.

---

## Notas
- **Atlas network access:** App Runner usa IPs de egresso dinâmicos. Pro MVP,
  libere `0.0.0.0/0` no Atlas (ou use um VPC connector + NAT pra travar). Mantenha
  o db-user com senha forte e escopo mínimo.
- **Segredos:** pro MVP, env vars do App Runner (criptografadas) bastam; ao
  crescer, migre pra **AWS Secrets Manager**.
- **Alternativa mais barata/previsível:** Lightsail Containers (mesmas imagens,
  ~US$7–10/mês por serviço, fixo).
- **Imagens desligadas?** Se não setar `AWS_REGION`+`IMAGES_S3_BUCKET`, o app cai
  no placeholder e não chama Bedrock (custo zero de imagem).
