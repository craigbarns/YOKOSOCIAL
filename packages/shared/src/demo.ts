export const DEMO_ORGANIZATION_ID = "demo-org-yokosushi";
export const DEMO_BRAND_ID = "demo-brand-yokosushi";

export const demoEstablishments = [
  {
    id: "demo-establishment-compans",
    name: "YokoSushi Compans — DÉMONSTRATION",
    city: "Toulouse",
    address: "Adresse fictive — à valider",
    phone: "Téléphone fictif — à valider",
    services: ["Livraison (démo)", "À emporter (démo)"],
    validationRequired: true
  },
  {
    id: "demo-establishment-peri",
    name: "YokoSushi Péri — DÉMONSTRATION",
    city: "Toulouse",
    address: "Adresse fictive — à valider",
    phone: "Téléphone fictif — à valider",
    services: ["Sur place (démo)", "À emporter (démo)"],
    validationRequired: true
  }
] as const;

export const demoProducts = [
  {
    id: "demo-product-platter",
    name: "Plateau Signature — PRODUIT DE DÉMONSTRATION",
    category: "Plateaux",
    description: "Assortiment fictif utilisé uniquement pour démontrer le parcours.",
    price: null,
    establishmentIds: ["demo-establishment-compans", "demo-establishment-peri"]
  },
  {
    id: "demo-product-california",
    name: "California Saumon — PRODUIT DE DÉMONSTRATION",
    category: "California",
    description: "Produit fictif : aucun prix ou ingrédient réel n’est affirmé.",
    price: null,
    establishmentIds: ["demo-establishment-compans"]
  },
  {
    id: "demo-product-poke",
    name: "Poké Coloré — PRODUIT DE DÉMONSTRATION",
    category: "Poké",
    description: "Visuel et fiche fictifs destinés au mode hors ligne.",
    price: null,
    establishmentIds: ["demo-establishment-peri"]
  }
] as const;

export const demoMedia = [
  {
    id: "demo-media-platter",
    title: "Plateau signature — visuel de démonstration",
    category: "PLATTER",
    editorialCategory: "plateaux",
    src: "/demo/platter.svg",
    width: 1200,
    height: 1200,
    qualityScore: 94,
    status: "APPROVED",
    usageCount: 0,
    establishmentIds: ["demo-establishment-compans", "demo-establishment-peri"]
  },
  {
    id: "demo-media-california",
    title: "California — visuel de démonstration",
    category: "PRODUCT",
    editorialCategory: "california",
    src: "/demo/california.svg",
    width: 1080,
    height: 1350,
    qualityScore: 91,
    status: "APPROVED",
    usageCount: 1,
    establishmentIds: ["demo-establishment-compans"]
  },
  {
    id: "demo-media-poke",
    title: "Poké — visuel de démonstration",
    category: "PRODUCT",
    editorialCategory: "poke",
    src: "/demo/poke.svg",
    width: 1080,
    height: 1350,
    qualityScore: 88,
    status: "APPROVED",
    usageCount: 0,
    establishmentIds: ["demo-establishment-peri"]
  },
  {
    id: "demo-media-restaurant",
    title: "Restaurant — visuel de démonstration",
    category: "RESTAURANT",
    editorialCategory: "restaurant",
    src: "/demo/restaurant.svg",
    width: 1600,
    height: 1000,
    qualityScore: 84,
    status: "NEEDS_REVIEW",
    usageCount: 0,
    establishmentIds: ["demo-establishment-compans"]
  },
  {
    id: "demo-media-delivery",
    title: "Livraison — visuel de démonstration",
    category: "DELIVERY",
    editorialCategory: "livraison",
    src: "/demo/delivery.svg",
    width: 1080,
    height: 1920,
    qualityScore: 86,
    status: "APPROVED",
    usageCount: 0,
    establishmentIds: ["demo-establishment-compans", "demo-establishment-peri"]
  }
] as const;
