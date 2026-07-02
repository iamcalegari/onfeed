# Requirements: onFeed Import

**Defined:** 2026-07-01
**Core Value:** Transformar um vídeo de receita do feed do usuário em uma receita real, correta e acionável (ingredientes com quantidade, passo a passo e dicas fiéis) dentro do onFeed.

## v1 Requirements

Núcleo do MVP: **colar link → receita confiável**. Extensão de browser, carrossel de imagens e OCR ficam para v2 (logo após validar o núcleo).

### Captura (paste link)

- [x] **CAP-01**: Usuário pode colar a URL de um vídeo (Instagram, TikTok ou YouTube) numa tela do app e iniciar a importação
- [x] **CAP-02**: O app valida a URL/plataforma antes de enfileirar; URL inválida ou plataforma não suportada retorna erro claro
- [x] **CAP-03**: Importações duplicadas da mesma URL (normalizada) são deduplicadas — reusa o resultado existente em vez de reprocessar

### Pipeline de mídia

- [x] **PIPE-01**: Dado uma URL, o worker baixa o vídeo via yt-dlp (IG/TikTok/YouTube num único motor)
- [x] **PIPE-02**: O worker extrai o áudio e transcreve via Whisper (hospedado), com pré-filtro para clipes sem fala/só música (evita transcrição alucinada)
- [x] **PIPE-03**: O worker captura a caption do post e os metadados de origem (plataforma, URL do vídeo, @ do autor, URL do perfil quando extraíveis)
- [x] **PIPE-04**: O worker extrai 1 keyframe representativo do vídeo como imagem da receita (melhor frame)
- [x] **PIPE-05**: O vídeo/áudio baixado é apagado após o processamento (não re-hospeda mídia de terceiros)
- [x] **PIPE-06**: Um `ImportJob` rastreia o estado do trabalho (queued → downloading → transcribing → extracting → ready_for_review → published/failed) com idempotência, retry e DLQ
- [x] **PIPE-07**: Falha de download por bloqueio de plataforma é um estado tratado e monitorado (circuit breaker + telemetria de taxa de sucesso por plataforma), com mensagem específica ao usuário

### Extração estruturada

- [x] **EXT-01**: Claude extrai da transcrição + caption: título, ingredientes **com quantidade + unidade**, passo a passo ordenado e dicas
- [x] **EXT-02**: Cada campo extraído carrega um sinal de confiança/grounding (declarado na fonte vs inferido pelo LLM)
- [x] **EXT-03**: Ingredientes extraídos passam pela canonicalização existente (match exato → semântico → pending)
- [x] **EXT-04**: A receita extraída recebe embedding (Voyage) e entra na busca híbrida I/E/T/N como qualquer receita
- [x] **EXT-05**: Extração de baixa confiança global é marcada e roteada para revisão obrigatória (nunca publica silenciosamente)

### Revisão obrigatória

- [x] **REV-01**: Antes de salvar, o usuário vê uma tela de revisão/edição da receita extraída
- [x] **REV-02**: Campos de baixa confiança são sinalizados visualmente (inferido vs declarado) para correção
- [x] **REV-03**: Usuário pode editar título, ingredientes (quantidade/unidade), passos e dicas antes de confirmar
- [x] **REV-04**: A receita só é persistida como válida após a confirmação do usuário na revisão

### Cidadania no catálogo

- [ ] **RCP-01**: A receita importada é adaptável aos macros do usuário (reusa adaptRecipe)
- [ ] **RCP-02**: A receita importada pode ter ingredientes faltantes adicionados à lista de compras
- [ ] **RCP-03**: A receita importada funciona no modo cozinha passo a passo (com timer)
- [ ] **RCP-04**: A receita importada aparece nos resultados de busca e no swipe deck com match score I/E/T/N

### Social, atribuição e promoção

- [ ] **SOC-01**: A receita importada nasce **privada**, no livro do usuário que importou
- [ ] **SOC-02**: A receita privada tem um **link compartilhável**; quem abre o link pode visualizar e dar like
- [ ] **SOC-03**: A página da receita credita o creator original (@ do autor + link do perfil + link do vídeo fonte, quando disponíveis)
- [ ] **SOC-04**: Ao atingir **+5 likes**, a receita é promovida ao catálogo público como **variante** (reusa promoteToVariant), gated por confiança E contagem de likes
- [ ] **SOC-05**: A receita promovida mantém crédito ao creator e ao usuário importador (createdBy[])

### Custo, quota e gate

- [x] **COST-01**: A quota diária de importação (free tier) é reservada **na submissão**, não na conclusão (evita gasto antes do gate perceber)
- [x] **COST-02**: O custo por job é medido por estágio (download/bandwidth, minutos de ASR, tokens de LLM, embedding)
- [x] **COST-03**: Importação básica é grátis dentro da quota; volume alto exige PRO (reusa entitlement)

## v2 Requirements

Deferidos para logo após validar o núcleo. Rastreados, fora do roadmap atual.

### Captura por extensão

- **EXTN-01**: Extensão de browser (Manifest V3) captura a URL da aba atual do IG/TikTok/YouTube com 1 clique
- **EXTN-02**: App encaminha o usuário para instalar a extensão; a extensão autentica contra a API (token de handoff curto, não sessão Clerk crua)
- **EXTN-03**: A extensão posta a URL no mesmo endpoint de importação (adaptador fino sobre o mesmo pipeline)

### Carrossel de imagens

- **IMG-01**: A receita importada exibe carrossel com os 3 melhores keyframes do vídeo
- **IMG-02**: O usuário gerador pode editar/substituir imagens do carrossel
- **IMG-03**: O usuário gerador pode pedir geração de imagem via CheffIA (Bedrock/Stability)

### Enriquecimento PRO

- **PRO-01**: OCR do texto na tela (frames) via Claude vision, gated ao PRO
- **PRO-02**: O texto de OCR enriquece a extração (concilia com áudio + caption)

### Captura nativa / mobile

- **SHARE-01**: Web Share Target (PWA instalado) permite compartilhar do app do IG direto para o onFeed (Android)
- **SHARE-02**: Share sheet nativo (app nativo) para iOS/Android

### Extras

- **TS-01**: Passos da receita linkados a timestamps do vídeo (byproduct do Whisper)
- **MOD-01**: Fila de revisão humana para importações que falham a extração

## Out of Scope

| Feature | Reason |
|---------|--------|
| Re-hospedar o vídeo/áudio original | Risco legal (redistribuição de mídia); extraímos fatos e linkamos a fonte |
| Importar URL arbitrária da web (blogs, sites) | Foco é vídeo curto de feed; scraping de markup é problema diferente |
| Chatbot conversacional de receitas | CheffIA é gerador estruturado; chat é commodity e custo de IA imprevisível |
| Deeplink/afiliado de delivery por pedido | Inviável no BR (API iFood é merchant-side); não gera receita |
| Salvar receita sem revisão (auto-save) | Viola o Core Value; nenhum concorrente sério publica extração de vídeo sem revisão |
| Tesseract como OCR primário | Pior que LLM vision em texto estilizado e ainda exige limpeza por LLM |
| Rodar o pipeline pesado em Lambda | yt-dlp/Whisper/ffmpeg são binários Python/nativos; timeout de 15 min inviabiliza — usar worker Render |

## Traceability

Mapeamento confirmado pelo roadmapper em `.planning/ROADMAP.md` (2026-07-01).

| Requirement | Phase | Status |
|-------------|-------|--------|
| PIPE-01 | Phase 1 (Video Pipeline Foundation) | Complete |
| PIPE-02 | Phase 1 (Video Pipeline Foundation) | Complete |
| PIPE-03 | Phase 1 (Video Pipeline Foundation) | Complete |
| PIPE-04 | Phase 1 (Video Pipeline Foundation) | Complete |
| PIPE-05 | Phase 1 (Video Pipeline Foundation) | Complete |
| PIPE-06 | Phase 1 (Video Pipeline Foundation) | Complete |
| PIPE-07 | Phase 1 (Video Pipeline Foundation) | Complete |
| CAP-02 | Phase 1 (Video Pipeline Foundation) | Complete |
| EXT-01 | Phase 2 (Structured Extraction & Recipe Persistence) | Complete |
| EXT-02 | Phase 2 (Structured Extraction & Recipe Persistence) | Complete |
| EXT-03 | Phase 2 (Structured Extraction & Recipe Persistence) | Complete |
| EXT-04 | Phase 2 (Structured Extraction & Recipe Persistence) | Complete |
| EXT-05 | Phase 2 (Structured Extraction & Recipe Persistence) | Complete |
| CAP-01 | Phase 3 (Capture & Mandatory Review UI) | Complete |
| REV-01 | Phase 3 (Capture & Mandatory Review UI) | Complete |
| REV-02 | Phase 3 (Capture & Mandatory Review UI) | Complete |
| REV-03 | Phase 3 (Capture & Mandatory Review UI) | Complete |
| REV-04 | Phase 3 (Capture & Mandatory Review UI) | Complete |
| CAP-03 | Phase 4 (Cost/Quota Gating & Dedup) | Complete |
| COST-01 | Phase 4 (Cost/Quota Gating & Dedup) | Complete |
| COST-02 | Phase 4 (Cost/Quota Gating & Dedup) | Complete |
| COST-03 | Phase 4 (Cost/Quota Gating & Dedup) | Complete |
| SOC-01 | Phase 5 (Publish, Promotion & Full Citizenship) | Pending |
| SOC-02 | Phase 5 (Publish, Promotion & Full Citizenship) | Pending |
| SOC-03 | Phase 5 (Publish, Promotion & Full Citizenship) | Pending |
| SOC-04 | Phase 5 (Publish, Promotion & Full Citizenship) | Pending |
| SOC-05 | Phase 5 (Publish, Promotion & Full Citizenship) | Pending |
| RCP-01 | Phase 5 (Publish, Promotion & Full Citizenship) | Pending |
| RCP-02 | Phase 5 (Publish, Promotion & Full Citizenship) | Pending |
| RCP-03 | Phase 5 (Publish, Promotion & Full Citizenship) | Pending |
| RCP-04 | Phase 5 (Publish, Promotion & Full Citizenship) | Pending |

**Coverage:**

- v1 requirements: 31 total (CAP-01..03, PIPE-01..07, EXT-01..05, REV-01..04, RCP-01..04, SOC-01..05, COST-01..03)
- Mapeados: 31/31 (100%)
- Unmapped: 0
- v2 requirements (EXTN, IMG, PRO, SHARE, TS, MOD — 12 total) intencionalmente fora das fases: ver seção "Future / v2" em `.planning/ROADMAP.md`

---
*Requirements defined: 2026-07-01*
*Last updated: 2026-07-01 after roadmap creation — traceability confirmed, 31/31 v1 requirements mapped*
