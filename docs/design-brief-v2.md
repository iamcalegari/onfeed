# onFeed v2 — Design Brief
## De app de receitas para super app de saúde alimentar

**Versão:** 2.0  
**Data:** Junho 2026  
**Público-alvo:** Pessoas em dieta que querem cozinhar mas não sabem o que fazer com os ingredientes que têm

---

## 1. Visão e Proposta de Valor

### Problema central
Pessoas em dieta sabem o que devem comer (calorias, macros, restrições), mas travam na execução: ou pedem delivery e saem da dieta, ou ficam sem inspiração com os ingredientes que têm em casa.

### Proposta única
> "Diga o que você tem na geladeira e qual é seu plano — a gente monta sua refeição, rastreia seus macros e ainda te ensina a cozinhar."

### Diferencial vs concorrentes
| App | Foco | Gap |
|-----|------|-----|
| MyFitnessPal | Tracking de macros | Não sugere receitas com o que você tem |
| Tasty / TudoGostoso | Receitas | Não conecta com metas nutricionais |
| iFood | Delivery | Caro, fora da dieta |
| **onFeed v2** | **Receitas + macros + ingredientes** | **Liga os três mundos** |

---

## 2. Persona Principal

**"A Ana, 28 anos"**
- Começou uma dieta low-carb há 3 semanas
- Tem medo de cozinhar — não sabe o que pode fazer
- Às 12h olha para a geladeira e paralisa
- Acaba pedindo delivery por falta de opção
- Tem ingredientes de dieta em casa mas não sabe combiná-los
- Quer praticidade, não quer pesar cada grama de alimento
- Usa apps no celular, consome conteúdo de saúde no Instagram

---

## 3. Arquitetura de Informação

### Navegação principal (bottom bar — 5 tabs)

```
┌─────────────────────────────────────────┐
│                                         │
│            [conteúdo da tela]           │
│                                         │
├─────┬─────┬─────┬─────┬─────┐
│ Hoje│ Buscar│ Plano│ Progresso│ Perfil │
│  🏠  │  🔍  │  📋  │    📊   │   👤   │
└─────┴─────┴─────┴─────┴─────┘
```

### Hierarquia de módulos

```
onFeed v2
├── Hoje (Dashboard)
│   ├── Resumo de macros do dia
│   ├── Refeições registradas
│   ├── Sugestão de próxima refeição
│   └── Streak / gamificação
│
├── Buscar (Discover — evolução do atual)
│   ├── Busca por ingredientes (atual)
│   ├── Busca por macro-goal ("alta proteína")
│   ├── Filtros (tempo, ocasião, dieta)
│   └── Visão lista + packs (atual)
│
├── Plano (Meal Planning — novo)
│   ├── Calendário semanal
│   ├── Geração automática (premium)
│   └── Lista de compras → integração mercado
│
├── Progresso (novo)
│   ├── Histórico de macros (7/30 dias)
│   ├── Peso e medidas
│   ├── Aderência à dieta (%)
│   └── Conquistas e streaks
│
└── Perfil
    ├── Metas (calorias, macros, peso-alvo)
    ├── Preferências de dieta
    ├── Alergias e restrições
    ├── Dispensa (ingredientes fixos)
    └── Premium / configurações
```

---

## 4. Onboarding (novo — obrigatório na v2)

### Fluxo de 6 passos (rápido, visual, sem formulário)

**Tela 1 — Boas-vindas**
```
┌─────────────────────────┐
│         [ícone f]       │
│                         │
│      onFeed             │
│  Receitas que encaixam  │
│      no seu plano       │
│                         │
│  [Começar →]            │
│  [Já tenho conta]       │
└─────────────────────────┘
```

**Tela 2 — Qual é o seu objetivo?** (toque único)
```
○  Perder peso
○  Manter o peso saudável
○  Ganhar massa muscular
○  Simplesmente comer melhor
```

**Tela 3 — Seus dados** (3 campos, sem drama)
```
Peso atual:   [__ kg]
Altura:       [__ cm]
Idade:        [__]
```
→ App calcula TMB + déficit automaticamente

**Tela 4 — Como você come?** (multi-seleção)
```
☐ Normal (como de tudo)
☐ Low-carb / Keto
☐ Vegetariano
☐ Vegano
☐ Sem glúten
☐ Sem lactose
☐ Alta proteína
```

**Tela 5 — Sua meta diária** (calculada, editável)
```
┌─────────────────────────┐
│  Calculamos pra você:   │
│                         │
│    1.840 kcal/dia       │
│                         │
│  Proteína   140g        │
│  Carboidrato 150g       │
│  Gordura     70g        │
│                         │
│  [Aceitar] [Ajustar]    │
└─────────────────────────┘
```

**Tela 6 — O que você tem em casa?** (leva direto ao search atual)
```
┌─────────────────────────┐
│  Agora me diz o que     │
│  tem na geladeira 🥦    │
│                         │
│  [campo de ingredientes]│
│                         │
│  [Ver minhas receitas →]│
└─────────────────────────┘
```

---

## 5. Telas — Especificação Detalhada

### 5.1 HOJE (Dashboard — tela principal)

A mais importante. Deve responder em 3 segundos: "O que ainda posso comer?"

```
┌─────────────────────────────┐
│  Bom dia, Ana 👋    seg, 23 │
│                             │
│  ┌─── ANEL DE MACROS ─────┐ │
│  │     1.240 kcal         │ │
│  │     restantes          │ │
│  │   ●●●●●●○○○○          │ │
│  │   [P] [C] [G] [Kcal]  │ │
│  └────────────────────────┘ │
│                             │
│  ┌── PRÓXIMA REFEIÇÃO ────┐ │
│  │  🍽 Almoço             │ │
│  │  Com o que você tem:   │ │
│  │  [card de receita]     │ │
│  │  [Ver outras opções]   │ │
│  └────────────────────────┘ │
│                             │
│  HOJE                       │
│  ┌── Café da manhã ───────┐ │
│  │  + Registrar           │ │
│  └────────────────────────┘ │
│  ┌── Almoço ──────────────┐ │
│  │  Frango grelhado...    │ │
│  │  420 kcal · P:45 C:12 │ │
│  └────────────────────────┘ │
│  ┌── Jantar ──────────────┐ │
│  │  + Registrar           │ │
│  └────────────────────────┘ │
│                             │
│  🔥 7 dias na dieta  Streak │
└─────────────────────────────┘
```

**Componentes-chave:**
- **Macro Ring**: círculo animado dividido em 4 arcos (proteína=azul, carb=âmbar, gordura=terracota, restante=areia). Centro mostra kcal restantes em destaque.
- **Macro Pills**: 4 chips horizontais com ícone + valor atual/meta + barra de progresso
- **Próxima refeição**: card de receita sugerida com base nos macros que ainda faltam + ingredientes disponíveis
- **Refeições do dia**: lista vertical com slots de café/almoço/snack/jantar, cada um expansível

### 5.2 BUSCAR (evolução do atual)

```
┌─────────────────────────────┐
│  O que você tem aí? 🥦      │
│                             │
│  [buscar ingredientes...] 🔍│
│                             │
│  Filtros rápidos:           │
│  [Alta proteína] [Low-carb] │
│  [< 30 min] [Posso fazer]   │
│                             │
│  ─── Buscas recentes ────── │
│  ovo, frango, brócolis      │
│  atum, batata-doce          │
│                             │
│  ─── Cabe no seu plano ──── │
│  [receitas que ainda cabem  │
│   nos macros do dia]        │
│                             │
│  ─── Explorar ──────────── │
│  [Alta proteína →]          │
│  [Café da manhã fit →]      │
│  [Drinks sem açúcar →]      │
└─────────────────────────────┘
```

**Novidades vs v1:**
- Badge "✓ Cabe no plano" (verde) ou "⚠ Vai estourar X kcal" (âmbar) em cada receita
- Seção "Cabe no seu plano" mostra receitas filtradas pelos macros restantes do dia
- Filtros rápidos de macro-goal
- Histórico preenche ingredientes (já implementado)

### 5.3 CARD DE RECEITA (evolução)

```
┌─────────────────────────────┐
│ [thumbnail]          [1° 🥇] │
│                             │
│ 🇧🇷 Frango Grelhado com...   │
│ ────────────────────────────│
│ ✓ Cabe no plano             │ ← badge verde se dentro dos macros
│                             │
│ 420 kcal                    │ ← destaque
│ P 45g · C 12g · G 18g      │ ← linha de macros
│                             │
│ [barras de score]  ⏱ 25 min │
└─────────────────────────────┘
```

**Nova linha de macros** abaixo do título — a mudança mais impactante para a persona.

### 5.4 DETALHE DA RECEITA (evolução)

Adicionar seção de nutrição antes dos ingredientes:

```
┌─────────────────────────────┐
│ [thumbnail full-width]      │
│                             │
│ Frango Grelhado             │
│ ⏱ 25 min  🍽 2 porções     │
│                             │
│ ─── INFORMAÇÃO NUTRICIONAL ─│
│ Por porção:                 │
│                             │
│  Calorias    420 kcal       │
│  ┌──P──┬──C──┬──G──┐        │
│  │ 45g │ 12g │ 18g │        │
│  └─────┴─────┴─────┘        │
│                             │
│  [+ Registrar no meu dia]  ← CTA principal
│                             │
│ ─── INGREDIENTES ───────────│
│ ...                         │
│                             │
│ ─── MODO DE PREPARO ────────│
│ ...                         │
└─────────────────────────────┘
```

**CTA "Registrar no meu dia"** — integração direta com o tracker. Ao clicar, adiciona as macros da receita no log do dia.

### 5.5 PLANO SEMANAL (novo)

```
┌─────────────────────────────┐
│  Seu plano   Jun 22-28      │
│                             │
│  [Seg][Ter][Qua][Qui][Sex]  │
│   ●    ○    ○    ○    ○    │
│                             │
│  SEGUNDA-FEIRA              │
│  ┌── Café ────────────────┐ │
│  │  Omelete de espinafre  │ │
│  │  280 kcal P:22 C:8 G:18│ │
│  └────────────────────────┘ │
│  ┌── Almoço ──────────────┐ │
│  │  + Adicionar receita   │ │
│  └────────────────────────┘ │
│  ┌── Jantar ──────────────┐ │
│  │  + Adicionar receita   │ │
│  └────────────────────────┘ │
│                             │
│  Total: 1.640/1.840 kcal   │
│                             │
│  [✨ Gerar plano automático]│ ← Premium
│  [🛒 Gerar lista de compras]│
└─────────────────────────────┘
```

**Lista de compras → integração:**
```
┌─────────────────────────────┐
│  Lista da semana            │
│                             │
│  ○ Frango (600g)            │
│  ● Brócolis (ja tenho)      │
│  ○ Ovo (12 unidades)        │
│  ○ Azeite (já tenho)        │
│                             │
│  [Pedir no Rappi  →]        │ ← deeplink
│  [Pedir no iFood  →]        │
│  [Pão de Açúcar   →]        │
└─────────────────────────────┘
```

### 5.6 PROGRESSO (novo)

```
┌─────────────────────────────┐
│  Progresso                  │
│                             │
│  ─── Esta semana ───────────│
│  Aderência à dieta: 85%    │
│  [████████░░] 6/7 dias      │
│                             │
│  ─── Macros (7 dias) ───────│
│  [gráfico de barras         │
│   empilhadas P/C/G por dia] │
│                             │
│  ─── Peso ─────────────────│
│  71.2 kg hoje               │
│  ↓ 1.8kg em 3 semanas      │
│  [gráfico de linha]         │
│                             │
│  ─── Conquistas ───────────│
│  🔥 Semana perfeita         │
│  🥗 10 receitas cozinhadas  │
│  💪 Meta de proteína 5×     │
└─────────────────────────────┘
```

### 5.7 PERFIL / CONFIGURAÇÕES (evolução)

```
┌─────────────────────────────┐
│  Ana Oliveira               │
│  🔥 7 dias streak           │
│                             │
│  ─── Minha Meta ───────────│
│  Objetivo: Perder peso      │
│  Déficit: 400 kcal/dia      │
│  Meta: 1.840 kcal           │
│  P: 140g  C: 150g  G: 70g  │
│  [Editar metas]             │
│                             │
│  ─── Preferências ─────────│
│  Dieta: Low-carb            │
│  Restrições: Sem lactose    │
│  [Editar]                   │
│                             │
│  ─── Minha Dispensa ───────│
│  Ingredientes fixos em casa │
│  azeite, sal, ovo...        │
│  [Gerenciar]                │
│                             │
│  ─── Premium ──────────────│
│  [✨ Assinar onFeed Pro]    │
└─────────────────────────────┘
```

---

## 6. Sistema Visual — Adições ao Design System Atual

### Paleta atual (manter)
```
Forest    #162f25   Verde principal
Terracota #d4644a   CTA / ação
Salvia    #7a9e94   Secundário
Areia     #e0c9a6   Bordas
Creme     #faf4e8   Background
Carvao    #232320   Texto
Surface   #ffffff   Cards
```

### Novos tokens — Macros
```
--color-macro-protein:  #4a7fcb   Azul (proteína)
--color-macro-carb:     #e8a020   Âmbar (carboidrato = energia)
--color-macro-fat:      #d4644a   Terracota (já existe = gordura)
--color-macro-kcal:     #162f25   Forest (calorias = base)

--color-success:        #2d7d4e   Verde confirmação
--color-warning:        #c27a00   Âmbar alerta
--color-streak:         #f45d22   Laranja streak (gamificação)
```

### Novos componentes

**MacroRing** — anel circular animado com 4 arcos
```
Props: protein, carb, fat, goal
Tamanhos: sm (48px), md (96px), lg (160px)
Uso: Dashboard (lg), card de receita (sm)
```

**MacroBar** — linha horizontal com 3 valores
```
P 45g · C 12g · G 18g
Cor por macro, compacto, uma linha
```

**MacroPill** — chip com ícone + progresso
```
[P] 87/140g  ████████░░
```

**NutritionBadge** — badge no card de receita
```
✓ Cabe no plano   (verde)
⚠ +180 kcal       (âmbar)
✕ Fora do plano   (vermelho)
```

**StreakBadge** — gamificação
```
🔥 7 dias
```

**LogButton** — registrar no dia
```
[+ Registrar no meu dia]
Primário em verde forest
```

### Tipografia — adições
```
Números de macro:   Inter Bold, tabular-nums, tamanho variável
Calorias destaque:  Recoleta Bold, grande (32-48px)
Labels nutrição:    Inter Medium, uppercase, tracking wide, xs
```

---

## 7. Freemium — O que é Free vs Premium

### Free
- Busca por ingredientes ilimitada
- Receitas completas
- Tracking manual de macros (até 7 dias de histórico)
- Plano semanal manual (drag receitas)
- Lista de compras básica
- 1 perfil de dieta
- Badge "cabe no plano" nas receitas

### Premium (onFeed Pro)
- Geração automática de plano semanal com IA
- Histórico ilimitado
- Scanner de código de barras para logging
- Integração com balança smart
- Receitas exclusivas premium
- Receitas adaptadas por macro-goal ("adaptar para low-carb")
- Integração com supermercados (1-tap order)
- Nutricionista IA para tirar dúvidas
- Análise nutricional detalhada (micronutrientes)
- Export de dados (CSV, PDF)

### Preço sugerido
- R$ 19,90/mês
- R$ 149,90/ano (economize 37%)
- Trial de 7 dias grátis

---

## 8. Integrações

### Supermercados / Delivery
- **Rappi**: deeplink para carrinho com itens
- **iFood Market**: deeplink para lista
- **Pão de Açúcar**: API de parceiro (futura)
- **Carrefour**: API de parceiro (futura)

### Health APIs
- Apple Health / HealthKit (iOS)
- Google Fit (Android)
- Garmin / Fitbit (futuro)

### Autenticação
- Apple Sign In
- Google Sign In
- E-mail/senha

---

## 9. User Flows Principais

### Flow A — "O que eu almoço hoje?" (core job-to-be-done)
```
Abre app → Hoje → "Próxima refeição" sugerida
   ↓ (não gostou)
"Ver outras opções" → Buscar com macros filtrados automaticamente
   ↓
Escolhe receita → Vê macros → "✓ Cabe no plano"
   ↓
Cozinha → "Registrar no meu dia" → Macros atualizados no Hoje
```

### Flow B — Planejar a semana (premium / habitual)
```
Plano → "Gerar plano automático"
   ↓ (IA gera 21 refeições baseadas nos macros e preferências)
Revisão → ajusta o que quiser (drag & drop)
   ↓
"Gerar lista de compras"
   ↓
"Pedir no Rappi" → abre Rappi com carrinho montado
```

### Flow C — Busca direta por meta
```
Buscar → filtro "Alta proteína" → ingredientes disponíveis
   ↓
Resultados rankeados por match de ingredientes E macros
   ↓
Escolhe → cozinha → registra
```

---

## 10. Roadmap de Implementação

### Fase 1 — Fundação nutricional (agora)
Prioridade máxima. Sem reescrita total do app.

- [ ] **Macros nas receitas**: adicionar campo `nutrition` na extração (calorias, P, C, G) via LLM
- [ ] **Linha de macros no ResultCard**: P 45g · C 12g · G 18g
- [ ] **Badge "Cabe no plano"**: baseado em meta diária salva
- [ ] **Perfil de meta nutricional**: tela simples com metas diárias (kcal, P, C, G)
- [ ] **Registro de refeição**: toque em uma receita → "Registrar no meu dia"

### Fase 2 — Dashboard e tracking
- [ ] Tela "Hoje" com anel de macros
- [ ] Log de refeições por dia
- [ ] Histórico semanal básico

### Fase 3 — Planejamento
- [ ] Plano semanal manual
- [ ] Lista de compras
- [ ] Deeplink para Rappi/iFood

### Fase 4 — Premium e monetização
- [ ] Paywall + Stripe/RevenueCat
- [ ] Geração de plano com IA
- [ ] Scanner de barcode

### Fase 5 — Super app
- [ ] Progresso e analytics
- [ ] Integração Apple Health
- [ ] Parceria com supermercados

---

## 11. Métricas de Sucesso

| Métrica | Hoje | Meta 6 meses |
|---------|------|--------------|
| Retenção D7 | ? | > 40% |
| Retenção D30 | ? | > 20% |
| Receitas registradas/usuário/semana | 0 | > 3 |
| Conversão free→premium | 0% | > 8% |
| NPS | ? | > 50 |

---

## 12. Princípios de Design

1. **Speed to answer**: A pergunta "O que eu como agora?" deve ser respondida em < 3 toques
2. **Macros sem ansiedade**: Mostrar macros de forma positiva ("ainda tenho 400 kcal") não punitiva
3. **Cooking confidence**: Linguagem encorajadora, passos simples, tempos reais
4. **Progressive disclosure**: Não mostrar tudo de uma vez — revelar complexidade conforme o usuário avança
5. **Celebration, not guilt**: Gamificação focada em sequência e conquistas, não em erros
6. **One-tap logging**: Registrar uma refeição nunca pode ter mais de 2 toques
7. **Visual food-first**: Fotos sempre, texto secundário
