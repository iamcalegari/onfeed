import type { IngestRecipeInput } from "./recipe.ingestion.js";

/**
 * Receitas de exemplo para testar o app de ponta a ponta sem dataset/Batches.
 * São textos crus (como num dataset) — a extração LLM normaliza ingredientes,
 * infere equipamentos e estima o tempo dos passos.
 */
export const SAMPLE_RECIPES: IngestRecipeInput[] = [
  {
    title: "Macarrão alho e óleo",
    rawIngredients: [
      "200g de macarrão espaguete",
      "3 dentes de alho fatiados",
      "4 colheres de azeite de oliva",
      "sal a gosto",
      "pimenta calabresa a gosto",
      "salsinha picada",
    ],
    steps: [
      "Cozinhe o macarrão em água com sal até al dente.",
      "Doure o alho no azeite em fogo baixo, sem queimar.",
      "Misture o macarrão escorrido ao alho, ajuste o sal e finalize com salsinha.",
    ],
    thumbnailUrl: "",
    prepTimeMin: 20,
    servings: 2,
  },
  {
    title: "Omelete de queijo",
    rawIngredients: [
      "3 ovos",
      "1 colher de manteiga",
      "50g de queijo mussarela",
      "sal e pimenta a gosto",
    ],
    steps: [
      "Bata os ovos com sal e pimenta.",
      "Derreta a manteiga na frigideira e despeje os ovos.",
      "Adicione o queijo, dobre a omelete e sirva.",
    ],
    thumbnailUrl: "",
    prepTimeMin: 10,
    servings: 1,
  },
  {
    title: "Panqueca americana",
    rawIngredients: [
      "1 xícara de farinha de trigo",
      "1 xícara de leite",
      "1 ovo",
      "1 colher de fermento químico",
      "2 colheres de açúcar",
      "manteiga para untar",
    ],
    steps: [
      "Misture os secos e depois os líquidos até ficar homogêneo.",
      "Aqueça a frigideira untada e despeje conchas da massa.",
      "Vire quando surgirem bolhas e doure o outro lado.",
    ],
    thumbnailUrl: "",
    prepTimeMin: 20,
    servings: 3,
  },
  {
    title: "Vitamina de banana",
    rawIngredients: [
      "2 bananas",
      "1 copo de leite",
      "1 colher de mel",
    ],
    steps: ["Bata tudo no liquidificador até ficar cremoso e sirva gelado."],
    thumbnailUrl: "",
    prepTimeMin: 5,
    servings: 1,
  },
  {
    title: "Frango grelhado com limão",
    rawIngredients: [
      "2 peitos de frango",
      "suco de 1 limão",
      "2 dentes de alho",
      "2 colheres de azeite",
      "sal e pimenta",
    ],
    steps: [
      "Tempere o frango com limão, alho, sal e pimenta por 15 minutos.",
      "Grelhe na frigideira com azeite até dourar dos dois lados.",
    ],
    thumbnailUrl: "",
    prepTimeMin: 30,
    servings: 2,
    nutrition: { calories: 320, protein: 38, carbs: 4, fat: 16 },
  },
  {
    title: "Brownie de chocolate",
    rawIngredients: [
      "200g de chocolate amargo",
      "1 xícara de açúcar",
      "1/2 xícara de farinha de trigo",
      "3 ovos",
      "100g de manteiga",
    ],
    steps: [
      "Derreta o chocolate com a manteiga.",
      "Misture açúcar, ovos e farinha até incorporar.",
      "Asse em forma untada por cerca de 25 minutos no forno.",
    ],
    thumbnailUrl: "",
    prepTimeMin: 40,
    servings: 8,
    nutrition: { calories: 410, protein: 6, carbs: 48, fat: 22 },
  },
  {
    title: "Salada de tomate e manjericão",
    rawIngredients: [
      "3 tomates",
      "1/2 cebola roxa",
      "manjericão fresco",
      "azeite de oliva",
      "sal",
    ],
    steps: ["Corte os tomates e a cebola, tempere com azeite, sal e manjericão."],
    thumbnailUrl: "",
    prepTimeMin: 10,
    servings: 2,
    nutrition: { calories: 90, protein: 2, carbs: 8, fat: 6 },
  },
  {
    title: "Arroz de forno com queijo",
    rawIngredients: [
      "2 xícaras de arroz cozido",
      "100g de queijo mussarela",
      "100g de presunto picado",
      "2 ovos",
      "sal a gosto",
    ],
    steps: [
      "Misture o arroz, o presunto, os ovos e metade do queijo.",
      "Coloque em um refratário, cubra com o resto do queijo.",
      "Leve ao forno até gratinar.",
    ],
    thumbnailUrl: "",
    prepTimeMin: 35,
    servings: 4,
  },
  {
    title: "Sopa de legumes",
    rawIngredients: [
      "2 batatas",
      "2 cenouras",
      "1 cebola",
      "2 dentes de alho",
      "sal e pimenta",
    ],
    steps: [
      "Refogue cebola e alho na panela.",
      "Junte os legumes em cubos e cubra com água.",
      "Cozinhe até amaciar e ajuste o tempero.",
    ],
    thumbnailUrl: "",
    prepTimeMin: 40,
    servings: 4,
  },
  {
    title: "Macarrão à carbonara",
    rawIngredients: [
      "200g de macarrão",
      "100g de bacon em cubos",
      "2 ovos",
      "50g de queijo parmesão ralado",
      "pimenta-do-reino",
    ],
    steps: [
      "Cozinhe o macarrão al dente.",
      "Frite o bacon até dourar.",
      "Misture os ovos com o parmesão e envolva o macarrão quente fora do fogo.",
    ],
    thumbnailUrl: "",
    prepTimeMin: 25,
    servings: 2,
    nutrition: { calories: 520, protein: 24, carbs: 58, fat: 22 },
  },
];
