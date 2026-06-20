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

  // --- bebidas / café ---
  { _id: "cafe", displayName: "Café", synonyms: ["cafe", "café", "coffee", "café moído", "café solúvel", "instant coffee", "espresso", "nescafé"], category: "beverage", isStaple: false },
  { _id: "cha", displayName: "Chá", synonyms: ["cha", "chá", "tea", "chá verde", "green tea", "chá preto"], category: "beverage", isStaple: false },
  { _id: "suco_de_laranja", displayName: "Suco de laranja", synonyms: ["suco de laranja", "orange juice", "suco", "laranjada"], category: "beverage", isStaple: false },
  { _id: "leite_de_coco", displayName: "Leite de coco", synonyms: ["leite de coco", "coconut milk", "creme de coco"], category: "dairy", isStaple: false },

  // --- laticínios extras ---
  { _id: "leite_condensado", displayName: "Leite condensado", synonyms: ["leite condensado", "condensed milk", "leite condensado nestlé"], category: "dairy", isStaple: false },
  { _id: "iogurte", displayName: "Iogurte", synonyms: ["iogurte", "yogurt", "yoghurt", "iogurte natural", "iogurte grego", "greek yogurt"], category: "dairy", isStaple: false },
  { _id: "requeijao", displayName: "Requeijão", synonyms: ["requeijao", "requeijão", "cream cheese", "catupiry", "requeijão cremoso"], category: "dairy", isStaple: false },
  { _id: "queijo_coalho", displayName: "Queijo coalho", synonyms: ["queijo coalho", "queijo de coalho", "coalho"], category: "dairy", isStaple: false },
  { _id: "manteiga_ghee", displayName: "Ghee", synonyms: ["ghee", "manteiga ghee", "manteiga clarificada", "clarified butter"], category: "dairy", isStaple: false },

  // --- proteínas extras ---
  { _id: "presunto", displayName: "Presunto", synonyms: ["presunto", "ham", "presunto cozido"], category: "protein", isStaple: false },
  { _id: "linguica", displayName: "Linguiça", synonyms: ["linguica", "linguiça", "sausage", "linguiça calabresa", "linguiça portuguesa", "chouriço"], category: "protein", isStaple: false },
  { _id: "atum", displayName: "Atum", synonyms: ["atum", "tuna", "atum em lata", "canned tuna"], category: "protein", isStaple: false },
  { _id: "sardinha", displayName: "Sardinha", synonyms: ["sardinha", "sardine", "sardinha em lata"], category: "protein", isStaple: false },
  { _id: "frango_desfiado", displayName: "Frango desfiado", synonyms: ["frango desfiado", "shredded chicken", "frango cozido"], category: "protein", isStaple: false },
  { _id: "carne_de_sol", displayName: "Carne de sol", synonyms: ["carne de sol", "carne seca", "charque", "sun-dried beef"], category: "protein", isStaple: false },

  // --- frutas ---
  { _id: "banana", displayName: "Banana", synonyms: ["banana", "banana nanica", "banana prata", "bananas"], category: "fruit", isStaple: false },
  { _id: "maca", displayName: "Maçã", synonyms: ["maca", "maçã", "apple", "maçã verde", "granny smith"], category: "fruit", isStaple: false },
  { _id: "laranja", displayName: "Laranja", synonyms: ["laranja", "orange", "laranja pera", "laranja bahia"], category: "fruit", isStaple: false },
  { _id: "abacaxi", displayName: "Abacaxi", synonyms: ["abacaxi", "pineapple", "ananás"], category: "fruit", isStaple: false },
  { _id: "morango", displayName: "Morango", synonyms: ["morango", "morangos", "strawberry", "strawberries"], category: "fruit", isStaple: false },
  { _id: "manga", displayName: "Manga", synonyms: ["manga", "mango", "manga tommy", "manga palmer"], category: "fruit", isStaple: false },
  { _id: "uva", displayName: "Uva", synonyms: ["uva", "uvas", "grape", "grapes", "uva passa", "raisin"], category: "fruit", isStaple: false },
  { _id: "coco", displayName: "Coco", synonyms: ["coco", "coconut", "coco ralado", "coco fresco", "coconut flakes"], category: "fruit", isStaple: false },
  { _id: "abacate", displayName: "Abacate", synonyms: ["abacate", "avocado", "guacamole"], category: "fruit", isStaple: false },
  { _id: "maracuja", displayName: "Maracujá", synonyms: ["maracuja", "maracujá", "passion fruit", "suco de maracujá"], category: "fruit", isStaple: false },

  // --- legumes / verduras extras ---
  { _id: "batata_doce", displayName: "Batata-doce", synonyms: ["batata doce", "batata-doce", "sweet potato", "inhame"], category: "vegetable", isStaple: false },
  { _id: "abobrinha", displayName: "Abobrinha", synonyms: ["abobrinha", "zucchini", "courgette", "abobrinha italiana"], category: "vegetable", isStaple: false },
  { _id: "brocolis", displayName: "Brócolis", synonyms: ["brocolis", "brócolis", "broccoli", "brócolis ninja"], category: "vegetable", isStaple: false },
  { _id: "espinafre", displayName: "Espinafre", synonyms: ["espinafre", "spinach"], category: "vegetable", isStaple: false },
  { _id: "alface", displayName: "Alface", synonyms: ["alface", "lettuce", "alface americana", "alface crespa"], category: "vegetable", isStaple: false },
  { _id: "pepino", displayName: "Pepino", synonyms: ["pepino", "cucumber", "pepino japonês"], category: "vegetable", isStaple: false },
  { _id: "milho", displayName: "Milho", synonyms: ["milho", "corn", "milho verde", "milho cozido", "canned corn"], category: "vegetable", isStaple: false },
  { _id: "beterraba", displayName: "Beterraba", synonyms: ["beterraba", "beet", "beetroot"], category: "vegetable", isStaple: false },
  { _id: "repolho", displayName: "Repolho", synonyms: ["repolho", "cabbage", "repolho branco", "repolho roxo"], category: "vegetable", isStaple: false },
  { _id: "mandioca", displayName: "Mandioca", synonyms: ["mandioca", "aipim", "cassava", "macaxeira", "yuca"], category: "vegetable", isStaple: false },

  // --- grãos / leguminosas extras ---
  { _id: "graos_de_bico", displayName: "Grão-de-bico", synonyms: ["grao de bico", "grão-de-bico", "chickpea", "chickpeas", "grão de bico"], category: "grain_flour", isStaple: false },
  { _id: "lentilha", displayName: "Lentilha", synonyms: ["lentilha", "lentil", "lentils"], category: "grain_flour", isStaple: false },
  { _id: "aveia", displayName: "Aveia", synonyms: ["aveia", "oats", "oat", "aveia em flocos", "rolled oats"], category: "grain_flour", isStaple: false },
  { _id: "tapioca", displayName: "Tapioca", synonyms: ["tapioca", "polvilho", "goma de tapioca", "tapioca starch"], category: "grain_flour", isStaple: false },
  { _id: "farinha_de_mandioca", displayName: "Farinha de mandioca", synonyms: ["farinha de mandioca", "farinha", "cassava flour", "farofa"], category: "grain_flour", isStaple: false },
  { _id: "quinoa", displayName: "Quinoa", synonyms: ["quinoa", "quinua"], category: "grain_flour", isStaple: false },

  // --- padaria / confeitaria extras ---
  { _id: "acucar_mascavo", displayName: "Açúcar mascavo", synonyms: ["acucar mascavo", "açúcar mascavo", "brown sugar", "açúcar demerara", "demerara"], category: "baking", isStaple: false },
  { _id: "chocolate_em_po", displayName: "Chocolate em pó", synonyms: ["chocolate em po", "chocolate em pó", "cocoa powder", "cacau em pó", "nescau", "achocolatado"], category: "baking", isStaple: false },
  { _id: "baunilha", displayName: "Baunilha", synonyms: ["baunilha", "vanilla", "essência de baunilha", "extrato de baunilha", "vanilla extract"], category: "baking", isStaple: false },
  { _id: "bicarbonato", displayName: "Bicarbonato de sódio", synonyms: ["bicarbonato", "bicarbonato de sodio", "bicarbonato de sódio", "baking soda", "sodium bicarbonate"], category: "baking", isStaple: false },
  { _id: "amido_de_milho", displayName: "Amido de milho", synonyms: ["amido de milho", "maizena", "corn starch", "cornstarch", "maisena"], category: "baking", isStaple: false },
  { _id: "fermento_biologico", displayName: "Fermento biológico", synonyms: ["fermento biologico", "fermento biológico", "yeast", "levedura", "dry yeast", "active yeast"], category: "baking", isStaple: false },

  // --- oleaginosas ---
  { _id: "amendoim", displayName: "Amendoim", synonyms: ["amendoim", "peanut", "peanuts", "pasta de amendoim", "peanut butter"], category: "nut_seed", isStaple: false },
  { _id: "castanha_de_caju", displayName: "Castanha de caju", synonyms: ["castanha de caju", "cashew", "cashews", "castanha"], category: "nut_seed", isStaple: false },
  { _id: "amendoa", displayName: "Amêndoa", synonyms: ["amendoa", "amêndoa", "almond", "almonds", "farinha de amêndoa"], category: "nut_seed", isStaple: false },
  { _id: "nozes", displayName: "Nozes", synonyms: ["nozes", "walnut", "walnuts", "noz"], category: "nut_seed", isStaple: false },
  { _id: "gergelim", displayName: "Gergelim", synonyms: ["gergelim", "sesame", "sesame seeds", "sésamo"], category: "nut_seed", isStaple: false },

  // --- condimentos extras ---
  { _id: "extrato_de_tomate", displayName: "Extrato de tomate", synonyms: ["extrato de tomate", "tomato paste", "concentrado de tomate", "molho de tomate pronto"], category: "condiment", isStaple: false },
  { _id: "maionese", displayName: "Maionese", synonyms: ["maionese", "mayonnaise", "mayo"], category: "condiment", isStaple: false },
  { _id: "mostarda", displayName: "Mostarda", synonyms: ["mostarda", "mustard", "mostarda dijon", "dijon mustard"], category: "condiment", isStaple: false },
  { _id: "ketchup", displayName: "Ketchup", synonyms: ["ketchup", "catchup", "tomato ketchup"], category: "condiment", isStaple: false },
  { _id: "caldo_de_galinha", displayName: "Caldo de galinha", synonyms: ["caldo de galinha", "chicken broth", "chicken stock", "caldo de frango", "knorr"], category: "condiment", isStaple: false },
  { _id: "azeite_de_gergelim", displayName: "Óleo de gergelim", synonyms: ["azeite de gergelim", "óleo de gergelim", "sesame oil", "óleo de sésamo"], category: "oil_fat", isStaple: false },
  { _id: "creme_de_amendoim", displayName: "Pasta de amendoim", synonyms: ["pasta de amendoim", "creme de amendoim", "peanut butter", "manteiga de amendoim"], category: "condiment", isStaple: false },
];
