/**
 * Catálogo canônico inicial (starter). Suficiente para o fallback semântico
 * começar a funcionar e ir se auto-enriquecendo via ingestão.
 *
 * Convenções:
 * - `_id`: slug estável em pt-BR (snake_case, sem acento).
 * - `synonyms`: SEMPRE em minúsculas; inclua variações pt e en (datasets
 *   públicos costumam vir em inglês) — todos resolvem para o mesmo canônico.
 * - `isStaple`: true só para o que praticamente todo mundo tem em casa.
 */
export interface SeedIngredient {
  _id: string;
  displayName: string;
  synonyms: string[];
  category: string;
  isStaple: boolean;
}

export const INGREDIENT_SEED: SeedIngredient[] = [
  // --- staples (não contam como "faltando") ---
  { _id: "sal", displayName: "Sal", synonyms: ["sal", "salt", "sal refinado", "sal grosso"], category: "staple", isStaple: true },
  { _id: "agua", displayName: "Água", synonyms: ["agua", "água", "water"], category: "staple", isStaple: true },
  { _id: "pimenta_do_reino", displayName: "Pimenta-do-reino", synonyms: ["pimenta do reino", "pimenta-do-reino", "black pepper", "pepper"], category: "staple", isStaple: true },
  { _id: "acucar", displayName: "Açúcar", synonyms: ["acucar", "açúcar", "sugar", "açúcar refinado"], category: "staple", isStaple: true },

  // --- gorduras / óleos ---
  { _id: "azeite_de_oliva", displayName: "Azeite de oliva", synonyms: ["azeite", "azeite de oliva", "azeite extra-virgem", "evoo", "olive oil", "extra virgin olive oil"], category: "oil_fat", isStaple: false },
  { _id: "oleo_vegetal", displayName: "Óleo vegetal", synonyms: ["oleo", "óleo", "oleo vegetal", "óleo de soja", "vegetable oil", "canola oil"], category: "oil_fat", isStaple: false },
  { _id: "manteiga", displayName: "Manteiga", synonyms: ["manteiga", "butter", "unsalted butter"], category: "dairy", isStaple: false },

  // --- laticínios / ovos ---
  { _id: "leite", displayName: "Leite", synonyms: ["leite", "milk", "leite integral", "whole milk"], category: "dairy", isStaple: false },
  { _id: "ovo", displayName: "Ovo", synonyms: ["ovo", "ovos", "egg", "eggs"], category: "protein", isStaple: false },
  { _id: "queijo_parmesao", displayName: "Queijo parmesão", synonyms: ["parmesao", "parmesão", "queijo parmesão", "parmesan", "parmigiano"], category: "dairy", isStaple: false },
  { _id: "queijo_mussarela", displayName: "Queijo mussarela", synonyms: ["mussarela", "muçarela", "mozzarella", "queijo mussarela"], category: "dairy", isStaple: false },
  { _id: "creme_de_leite", displayName: "Creme de leite", synonyms: ["creme de leite", "heavy cream", "creme de leite fresco", "nata"], category: "dairy", isStaple: false },

  // --- grãos / farinhas / massas ---
  { _id: "farinha_de_trigo", displayName: "Farinha de trigo", synonyms: ["farinha", "farinha de trigo", "flour", "all-purpose flour", "wheat flour"], category: "grain_flour", isStaple: false },
  { _id: "arroz", displayName: "Arroz", synonyms: ["arroz", "rice", "arroz branco", "white rice"], category: "grain_flour", isStaple: false },
  { _id: "macarrao", displayName: "Macarrão", synonyms: ["macarrao", "macarrão", "massa", "pasta", "spaghetti", "espaguete"], category: "grain_flour", isStaple: false },
  { _id: "feijao", displayName: "Feijão", synonyms: ["feijao", "feijão", "beans", "black beans", "feijão preto"], category: "grain_flour", isStaple: false },
  { _id: "pao", displayName: "Pão", synonyms: ["pao", "pão", "bread", "pão francês"], category: "grain_flour", isStaple: false },

  // --- legumes / verduras ---
  { _id: "cebola", displayName: "Cebola", synonyms: ["cebola", "onion", "cebola branca", "cebola roxa"], category: "vegetable", isStaple: false },
  { _id: "alho", displayName: "Alho", synonyms: ["alho", "garlic", "dente de alho", "garlic clove"], category: "vegetable", isStaple: false },
  { _id: "tomate", displayName: "Tomate", synonyms: ["tomate", "tomato", "tomates", "tomato sauce", "molho de tomate"], category: "vegetable", isStaple: false },
  { _id: "batata", displayName: "Batata", synonyms: ["batata", "potato", "batatas", "potatoes"], category: "vegetable", isStaple: false },
  { _id: "cenoura", displayName: "Cenoura", synonyms: ["cenoura", "carrot", "cenouras"], category: "vegetable", isStaple: false },
  { _id: "pimentao", displayName: "Pimentão", synonyms: ["pimentao", "pimentão", "bell pepper", "pimentão vermelho"], category: "vegetable", isStaple: false },
  { _id: "cogumelo", displayName: "Cogumelo", synonyms: ["cogumelo", "cogumelos", "mushroom", "mushrooms", "champignon"], category: "vegetable", isStaple: false },

  // --- proteínas ---
  { _id: "frango", displayName: "Frango", synonyms: ["frango", "chicken", "peito de frango", "chicken breast"], category: "protein", isStaple: false },
  { _id: "carne_bovina", displayName: "Carne bovina", synonyms: ["carne", "carne bovina", "beef", "ground beef", "carne moída"], category: "protein", isStaple: false },
  { _id: "carne_suina", displayName: "Carne suína", synonyms: ["carne suina", "carne suína", "pork", "lombo", "bacon"], category: "protein", isStaple: false },
  { _id: "peixe", displayName: "Peixe", synonyms: ["peixe", "fish", "filé de peixe", "salmão", "salmon", "tilápia"], category: "protein", isStaple: false },
  { _id: "camarao", displayName: "Camarão", synonyms: ["camarao", "camarão", "shrimp", "prawn"], category: "protein", isStaple: false },

  // --- ervas / temperos ---
  { _id: "manjericao", displayName: "Manjericão", synonyms: ["manjericao", "manjericão", "basil", "fresh basil"], category: "herb_spice", isStaple: false },
  { _id: "salsinha", displayName: "Salsinha", synonyms: ["salsinha", "salsa", "parsley", "cheiro verde"], category: "herb_spice", isStaple: false },
  { _id: "oregano", displayName: "Orégano", synonyms: ["oregano", "orégano", "oregano seco"], category: "herb_spice", isStaple: false },
  { _id: "coentro", displayName: "Coentro", synonyms: ["coentro", "cilantro", "coriander"], category: "herb_spice", isStaple: false },
  { _id: "pimenta_calabresa", displayName: "Pimenta calabresa", synonyms: ["pimenta calabresa", "chili flakes", "red pepper flakes", "pimenta vermelha"], category: "herb_spice", isStaple: false },
  { _id: "cominho", displayName: "Cominho", synonyms: ["cominho", "cumin", "ground cumin"], category: "herb_spice", isStaple: false },
  { _id: "canela", displayName: "Canela", synonyms: ["canela", "cinnamon", "canela em pó"], category: "herb_spice", isStaple: false },
  { _id: "gengibre", displayName: "Gengibre", synonyms: ["gengibre", "ginger", "fresh ginger"], category: "herb_spice", isStaple: false },

  // --- condimentos / despensa ---
  { _id: "molho_de_soja", displayName: "Molho de soja", synonyms: ["molho de soja", "shoyu", "soy sauce"], category: "condiment", isStaple: false },
  { _id: "vinagre", displayName: "Vinagre", synonyms: ["vinagre", "vinegar", "vinagre balsâmico", "balsamic vinegar"], category: "condiment", isStaple: false },
  { _id: "limao", displayName: "Limão", synonyms: ["limao", "limão", "lemon", "lime", "suco de limão"], category: "fruit", isStaple: false },
  { _id: "mel", displayName: "Mel", synonyms: ["mel", "honey"], category: "condiment", isStaple: false },
  { _id: "fermento_quimico", displayName: "Fermento químico", synonyms: ["fermento", "fermento químico", "baking powder", "fermento em pó"], category: "baking", isStaple: false },
  { _id: "chocolate", displayName: "Chocolate", synonyms: ["chocolate", "chocolate amargo", "dark chocolate", "cacau", "cocoa"], category: "baking", isStaple: false },
];
