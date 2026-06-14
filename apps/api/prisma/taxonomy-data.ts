/**
 * Strict 2-level marketplace taxonomy + dynamic-attribute templates + brand
 * library (Marketplace Taxonomy initiative, 2026-06-14, Phase 2b-1).
 *
 * Single source of truth for the catalog structure. `seed.ts` consumes these
 * tables to upsert categories, per-subcategory ProductAttribute templates, and
 * the reusable Brand library (with brand↔subcategory links). Pure data — no
 * Prisma access here.
 *
 * Rules:
 *  - Exactly TWO levels: Catégorie (top) → Sous-catégorie. No third level.
 *  - Deterministic UUIDs so re-seeding is idempotent. Ranges:
 *      categories  13000000-…  (top = n, sub = parent*100 + index)
 *      attributes  14000000-…  (n = subN*100 + slot)
 *      brands      15000000-…  (n = 1..N)
 *  - Attribute names / options are French (the only locale).
 */
import { AttributeType } from '@prisma/client';

export interface SubcategoryDef {
  /** Stable numeric key: parent*100 + index. */
  n: number;
  fr: string;
}

export interface CategoryDef {
  /** Stable numeric key 1..7. */
  n: number;
  emoji: string;
  fr: string;
  subs: SubcategoryDef[];
}

export interface AttrDef {
  /** Stable numeric key: subN*100 + slot. Unique across the whole taxonomy. */
  n: number;
  /** Subcategory numeric key this attribute belongs to. */
  subN: number;
  fr: string;
  type: AttributeType;
  options?: string[];
  isRequired?: boolean;
}

export interface BrandDef {
  /** Stable numeric key 1..N. */
  n: number;
  fr: string;
  /** Subcategory numeric keys this brand is offered in. */
  subs: number[];
}

// ────────────────────────────────────────────────────────────────────────────
// CATEGORIES (7) + SUBCATEGORIES (80)
// ────────────────────────────────────────────────────────────────────────────

export const STRICT_CATEGORIES: CategoryDef[] = [
  {
    n: 1,
    emoji: '🛒',
    fr: 'Supermarché',
    subs: [
      { n: 101, fr: 'Riz, Farines & Céréales' },
      { n: 102, fr: 'Huiles & Condiments' },
      { n: 103, fr: 'Conserves' },
      { n: 104, fr: 'Pâtes alimentaires' },
      { n: 105, fr: 'Produits surgelés' },
      { n: 106, fr: 'Boissons' },
      { n: 107, fr: 'Snacks & Biscuits' },
      { n: 108, fr: 'Café, Thé & Petit-déjeuner' },
      { n: 109, fr: "Produits d'entretien" },
      { n: 110, fr: 'Hygiène personnelle' },
      { n: 111, fr: 'Couches & Bébés' },
      { n: 112, fr: 'Eau minérale' },
    ],
  },
  {
    n: 2,
    emoji: '📱',
    fr: 'Téléphones & Accessoires',
    subs: [
      { n: 201, fr: 'Smartphones' },
      { n: 202, fr: 'Téléphones simples' },
      { n: 203, fr: 'Tablettes' },
      { n: 204, fr: 'Chargeurs' },
      { n: 205, fr: 'Écouteurs & Casques' },
      { n: 206, fr: 'Power Banks' },
      { n: 207, fr: 'Coques & Protections' },
      { n: 208, fr: 'Routeurs & Modems' },
      { n: 209, fr: 'Ordinateurs portables' },
      { n: 210, fr: 'Ordinateurs de bureau' },
      { n: 211, fr: 'Imprimantes' },
      { n: 212, fr: 'Accessoires informatiques' },
    ],
  },
  {
    n: 3,
    emoji: '🔌',
    fr: 'Électroménager',
    subs: [
      { n: 301, fr: 'Réfrigérateurs & Congélateurs' },
      { n: 302, fr: 'Cuisinières & Fours' },
      { n: 303, fr: 'Micro-ondes' },
      { n: 304, fr: 'Machines à laver' },
      { n: 305, fr: 'Fers à repasser' },
      { n: 306, fr: 'Ventilateurs' },
      { n: 307, fr: 'Climatiseurs' },
      { n: 308, fr: 'Mixeurs & Blenders' },
      { n: 309, fr: 'Bouilloires & Cafetières' },
      { n: 310, fr: 'Générateurs' },
      { n: 311, fr: 'Équipements solaires' },
      { n: 312, fr: 'Onduleurs & Régulateurs' },
    ],
  },
  {
    n: 4,
    emoji: '👗',
    fr: 'Mode',
    subs: [
      { n: 401, fr: 'Vêtements Homme' },
      { n: 402, fr: 'Vêtements Femme' },
      { n: 403, fr: 'Vêtements Enfant' },
      { n: 404, fr: 'Chaussures Homme' },
      { n: 405, fr: 'Chaussures Femme' },
      { n: 406, fr: 'Chaussures Enfant' },
      { n: 407, fr: 'Sacs & Valises' },
      { n: 408, fr: 'Montres' },
      { n: 409, fr: 'Bijoux' },
      { n: 410, fr: 'Lunettes' },
      { n: 411, fr: 'Accessoires de mode' },
    ],
  },
  {
    n: 5,
    emoji: '💄',
    fr: 'Beauté & Santé',
    subs: [
      { n: 501, fr: 'Soins du visage' },
      { n: 502, fr: 'Soins du corps' },
      { n: 503, fr: 'Produits capillaires' },
      { n: 504, fr: 'Perruques & Mèches' },
      { n: 505, fr: 'Maquillage' },
      { n: 506, fr: 'Parfums Homme' },
      { n: 507, fr: 'Parfums Femme' },
      { n: 508, fr: 'Hygiène personnelle' },
      { n: 509, fr: 'Produits pour bébé' },
      { n: 510, fr: 'Premiers secours' },
      { n: 511, fr: 'Santé & Bien-être' },
    ],
  },
  {
    n: 6,
    emoji: '🔨',
    fr: 'Construction & Bricolage',
    subs: [
      { n: 601, fr: 'Ciment & Matériaux' },
      { n: 602, fr: 'Fer & Métaux' },
      { n: 603, fr: 'Tôles & Couverture' },
      { n: 604, fr: 'Électricité' },
      { n: 605, fr: 'Plomberie' },
      { n: 606, fr: 'Peinture & Finition' },
      { n: 607, fr: 'Outils manuels' },
      { n: 608, fr: 'Outils électriques' },
      { n: 609, fr: 'Réservoirs & Pompes à eau' },
      { n: 610, fr: 'Équipements de sécurité' },
      { n: 611, fr: 'Quincaillerie' },
    ],
  },
  {
    n: 7,
    emoji: '🚗',
    fr: 'Automobile & Moto',
    subs: [
      { n: 701, fr: 'Batteries' },
      { n: 702, fr: 'Pneus & Jantes' },
      { n: 703, fr: 'Huiles & Lubrifiants' },
      { n: 704, fr: 'Pièces moteur' },
      { n: 705, fr: 'Freinage & Suspension' },
      { n: 706, fr: 'Électricité automobile' },
      { n: 707, fr: 'Accessoires automobiles' },
      { n: 708, fr: 'Pièces moto' },
      { n: 709, fr: 'Casques & Équipements moto' },
      { n: 710, fr: 'Entretien & Nettoyage' },
      { n: 711, fr: 'Sécurité routière' },
    ],
  },
];

// ────────────────────────────────────────────────────────────────────────────
// ATTRIBUTE TEMPLATES (per subcategory). Brand is NOT an attribute — it's a
// first-class Brand library + filter (decision D1). Attribute n = subN*100 + slot.
// Reused option vocabularies are inlined for readability.
// ────────────────────────────────────────────────────────────────────────────

const T = AttributeType;
const VETEMENT_TAILLES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const POINTURES = ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47', '48'];
const ETAT = ['Neuf', 'Reconditionné', "Occasion - Bon état", 'Occasion - État moyen'];

export const STRICT_ATTRIBUTES: AttrDef[] = [
  // ── 1. Supermarché ────────────────────────────────────────────────────────
  // Supermarché example (spec): Brand / Weight / Volume / Expiration.
  { n: 10101, subN: 101, fr: 'Poids', type: T.SELECT, options: ['1kg', '2kg', '5kg', '10kg', '25kg', '50kg'] },
  { n: 10102, subN: 101, fr: 'Type', type: T.SELECT, options: ['Riz', 'Farine de froment', 'Farine de maïs', 'Semoule', 'Céréales', 'Maïs'] },
  { n: 10201, subN: 102, fr: 'Volume', type: T.SELECT, options: ['250ml', '500ml', '1L', '2L', '5L', '20L'] },
  { n: 10202, subN: 102, fr: 'Type', type: T.SELECT, options: ['Huile végétale', "Huile d'olive", 'Huile de palme', 'Vinaigre', 'Sel', 'Épices', 'Sauce'] },
  { n: 10301, subN: 103, fr: 'Type', type: T.SELECT, options: ['Tomates', 'Thon', 'Sardines', 'Maïs', 'Petits pois', 'Haricots', 'Lait concentré'] },
  { n: 10302, subN: 103, fr: 'Poids', type: T.TEXT },
  { n: 10401, subN: 104, fr: 'Type', type: T.SELECT, options: ['Spaghetti', 'Macaroni', 'Coquillettes', 'Nouilles', 'Vermicelles'] },
  { n: 10402, subN: 104, fr: 'Poids', type: T.SELECT, options: ['250g', '500g', '1kg', '5kg'] },
  { n: 10501, subN: 105, fr: 'Type', type: T.SELECT, options: ['Poisson', 'Viande', 'Poulet', 'Légumes', 'Frites', 'Glaces'] },
  { n: 10502, subN: 105, fr: 'Poids', type: T.TEXT },
  { n: 10601, subN: 106, fr: 'Type', type: T.SELECT, options: ['Eau', 'Jus', 'Soda', 'Bière', 'Vin', 'Énergisant', 'Sirop'] },
  { n: 10602, subN: 106, fr: 'Volume', type: T.SELECT, options: ['33cl', '50cl', '1L', '1.5L', '2L', 'Pack'] },
  { n: 10701, subN: 107, fr: 'Type', type: T.SELECT, options: ['Biscuits', 'Chips', 'Bonbons', 'Chocolat', 'Cacahuètes', 'Gâteaux'] },
  { n: 10801, subN: 108, fr: 'Type', type: T.SELECT, options: ['Café', 'Thé', 'Chocolat en poudre', 'Lait en poudre', 'Confiture', 'Céréales petit-déjeuner', 'Miel'] },
  { n: 10901, subN: 109, fr: 'Type', type: T.SELECT, options: ['Savon de lessive', 'Détergent', 'Javel', 'Désinfectant', 'Liquide vaisselle', 'Nettoyant sol'] },
  { n: 11001, subN: 110, fr: 'Type', type: T.SELECT, options: ['Savon de toilette', 'Dentifrice', 'Brosse à dents', 'Papier hygiénique', 'Serviettes hygiéniques', 'Shampooing'] },
  { n: 11101, subN: 111, fr: 'Taille', type: T.SELECT, options: ['Nouveau-né', 'Mini (3-6kg)', 'Midi (4-9kg)', 'Maxi (7-18kg)', 'Junior (15-30kg)'] },
  { n: 11102, subN: 111, fr: 'Type', type: T.SELECT, options: ['Couches', 'Lingettes', 'Lait infantile', 'Bouillie'] },
  { n: 11201, subN: 112, fr: 'Volume', type: T.SELECT, options: ['50cl', '1L', '1.5L', '5L', '10L', 'Pack de 6', 'Pack de 12'] },

  // ── 2. Téléphones & Accessoires ───────────────────────────────────────────
  // Smartphones example (spec): Brand / Model / Storage / RAM / Color / Condition / Warranty.
  { n: 20101, subN: 201, fr: 'Modèle', type: T.TEXT },
  { n: 20102, subN: 201, fr: 'Mémoire interne', type: T.SELECT, options: ['16Go', '32Go', '64Go', '128Go', '256Go', '512Go', '1To'], isRequired: true },
  { n: 20103, subN: 201, fr: 'RAM', type: T.SELECT, options: ['1Go', '2Go', '3Go', '4Go', '6Go', '8Go', '12Go', '16Go'] },
  { n: 20104, subN: 201, fr: 'Couleur', type: T.TEXT },
  { n: 20105, subN: 201, fr: 'État', type: T.SELECT, options: ETAT, isRequired: true },
  { n: 20106, subN: 201, fr: 'Sous garantie', type: T.BOOLEAN },
  { n: 20107, subN: 201, fr: 'Taille écran', type: T.SELECT, options: ['5.0"', '5.5"', '6.0"', '6.1"', '6.4"', '6.5"', '6.6"', '6.7"', '6.8"'] },
  { n: 20201, subN: 202, fr: 'Double SIM', type: T.BOOLEAN },
  { n: 20202, subN: 202, fr: 'Couleur', type: T.TEXT },
  { n: 20301, subN: 203, fr: 'Mémoire interne', type: T.SELECT, options: ['32Go', '64Go', '128Go', '256Go', '512Go'] },
  { n: 20302, subN: 203, fr: 'Taille écran', type: T.SELECT, options: ['7"', '8"', '10.1"', '10.9"', '11"', '12.4"', '12.9"'] },
  { n: 20303, subN: 203, fr: 'Connectivité', type: T.SELECT, options: ['WiFi', 'WiFi + 4G'] },
  { n: 20401, subN: 204, fr: 'Type de connecteur', type: T.SELECT, options: ['USB-C', 'Micro-USB', 'Lightning', 'Universel'] },
  { n: 20402, subN: 204, fr: 'Puissance', type: T.SELECT, options: ['5W', '10W', '18W', '25W', '33W', '45W', '65W'] },
  { n: 20403, subN: 204, fr: 'Charge rapide', type: T.BOOLEAN },
  { n: 20501, subN: 205, fr: 'Type', type: T.SELECT, options: ['Écouteurs filaires', 'Écouteurs sans fil', 'Casque', 'Oreillette Bluetooth'] },
  { n: 20502, subN: 205, fr: 'Sans fil', type: T.BOOLEAN },
  { n: 20601, subN: 206, fr: 'Capacité', type: T.SELECT, options: ['5000mAh', '10000mAh', '20000mAh', '30000mAh'] },
  { n: 20602, subN: 206, fr: 'Charge rapide', type: T.BOOLEAN },
  { n: 20701, subN: 207, fr: 'Type', type: T.SELECT, options: ['Coque silicone', 'Coque rigide', 'Étui à rabat', 'Verre trempé', 'Film protecteur'] },
  { n: 20702, subN: 207, fr: 'Compatible avec', type: T.TEXT },
  { n: 20801, subN: 208, fr: 'Type', type: T.SELECT, options: ['Routeur WiFi', 'Modem 4G', 'Routeur 4G', 'Répéteur WiFi', 'MiFi portable'] },
  { n: 20802, subN: 208, fr: 'Norme WiFi', type: T.SELECT, options: ['WiFi 4', 'WiFi 5', 'WiFi 6'] },
  // Laptops example (spec): Brand / Processor / RAM / Storage / Screen size.
  { n: 20901, subN: 209, fr: 'Processeur', type: T.SELECT, options: ['Intel Core i3', 'Intel Core i5', 'Intel Core i7', 'Intel Core i9', 'AMD Ryzen 3', 'AMD Ryzen 5', 'AMD Ryzen 7', 'Apple M1', 'Apple M2', 'Apple M3', 'Celeron'] },
  { n: 20902, subN: 209, fr: 'RAM', type: T.SELECT, options: ['4Go', '8Go', '16Go', '32Go', '64Go'], isRequired: true },
  { n: 20903, subN: 209, fr: 'Stockage', type: T.SELECT, options: ['128Go SSD', '256Go SSD', '512Go SSD', '1To SSD', '500Go HDD', '1To HDD'] },
  { n: 20904, subN: 209, fr: 'Taille écran', type: T.SELECT, options: ['11.6"', '13.3"', '14"', '15.6"', '16"', '17.3"'] },
  { n: 20905, subN: 209, fr: 'État', type: T.SELECT, options: ETAT },
  { n: 21001, subN: 210, fr: 'Processeur', type: T.SELECT, options: ['Intel Core i3', 'Intel Core i5', 'Intel Core i7', 'AMD Ryzen 5', 'AMD Ryzen 7'] },
  { n: 21002, subN: 210, fr: 'RAM', type: T.SELECT, options: ['4Go', '8Go', '16Go', '32Go'] },
  { n: 21003, subN: 210, fr: 'Stockage', type: T.SELECT, options: ['256Go SSD', '512Go SSD', '1To SSD', '1To HDD'] },
  { n: 21004, subN: 210, fr: 'Écran inclus', type: T.BOOLEAN },
  { n: 21101, subN: 211, fr: 'Type', type: T.SELECT, options: ['Jet d\'encre', 'Laser', 'Laser couleur', 'Multifonction', 'Photo'] },
  { n: 21102, subN: 211, fr: 'Sans fil', type: T.BOOLEAN },
  { n: 21201, subN: 212, fr: 'Type', type: T.SELECT, options: ['Souris', 'Clavier', 'Clé USB', 'Disque dur externe', 'Webcam', 'Hub USB', 'Câble', 'Onduleur'] },

  // ── 3. Électroménager ─────────────────────────────────────────────────────
  { n: 30101, subN: 301, fr: 'Type', type: T.SELECT, options: ['Réfrigérateur 1 porte', 'Réfrigérateur 2 portes', 'Combiné', 'Congélateur coffre', 'Congélateur armoire'] },
  { n: 30102, subN: 301, fr: 'Capacité', type: T.SELECT, options: ['90L', '150L', '200L', '250L', '350L', '450L+'] },
  { n: 30103, subN: 301, fr: 'Classe énergétique', type: T.SELECT, options: ['A+++', 'A++', 'A+', 'A', 'B'] },
  { n: 30201, subN: 302, fr: 'Type', type: T.SELECT, options: ['Cuisinière à gaz', 'Cuisinière électrique', 'Cuisinière mixte', 'Four encastrable', 'Réchaud'] },
  { n: 30202, subN: 302, fr: 'Nombre de feux', type: T.SELECT, options: ['1', '2', '3', '4', '5', '6'] },
  { n: 30301, subN: 303, fr: 'Capacité', type: T.SELECT, options: ['17L', '20L', '23L', '25L', '30L', '42L'] },
  { n: 30302, subN: 303, fr: 'Grill', type: T.BOOLEAN },
  { n: 30401, subN: 304, fr: 'Type', type: T.SELECT, options: ['Top (chargement dessus)', 'Frontale (hublot)', 'Semi-automatique', 'Automatique'] },
  { n: 30402, subN: 304, fr: 'Capacité', type: T.SELECT, options: ['5kg', '6kg', '7kg', '8kg', '9kg', '10kg+'] },
  { n: 30501, subN: 305, fr: 'Type', type: T.SELECT, options: ['Fer à sec', 'Fer à vapeur', 'Centrale vapeur', 'Défroisseur'] },
  { n: 30601, subN: 306, fr: 'Type', type: T.SELECT, options: ['Ventilateur sur pied', 'Ventilateur de table', 'Ventilateur mural', 'Ventilateur plafond', 'Brasseur d\'air'] },
  { n: 30701, subN: 307, fr: 'Type', type: T.SELECT, options: ['Split mural', 'Monobloc', 'Mobile', 'Cassette'] },
  { n: 30702, subN: 307, fr: 'Puissance (BTU)', type: T.SELECT, options: ['9000 BTU', '12000 BTU', '18000 BTU', '24000 BTU'] },
  { n: 30801, subN: 308, fr: 'Type', type: T.SELECT, options: ['Blender', 'Mixeur plongeant', 'Robot multifonction', 'Hachoir', 'Presse-agrumes'] },
  { n: 30802, subN: 308, fr: 'Puissance', type: T.SELECT, options: ['300W', '500W', '800W', '1000W', '1500W'] },
  { n: 30901, subN: 309, fr: 'Type', type: T.SELECT, options: ['Bouilloire', 'Cafetière filtre', 'Machine à expresso', 'Théière électrique'] },
  { n: 30902, subN: 309, fr: 'Capacité', type: T.TEXT },
  { n: 31001, subN: 310, fr: 'Puissance', type: T.SELECT, options: ['650W', '1kVA', '2.5kVA', '3.5kVA', '5kVA', '7.5kVA', '10kVA+'] },
  { n: 31002, subN: 310, fr: 'Carburant', type: T.SELECT, options: ['Essence', 'Diesel', 'Mixte'] },
  { n: 31003, subN: 310, fr: 'Démarrage électrique', type: T.BOOLEAN },
  { n: 31101, subN: 311, fr: 'Type', type: T.SELECT, options: ['Panneau solaire', 'Batterie solaire', 'Régulateur solaire', 'Kit solaire complet', 'Lampe solaire'] },
  { n: 31102, subN: 311, fr: 'Puissance', type: T.TEXT },
  { n: 31201, subN: 312, fr: 'Type', type: T.SELECT, options: ['Onduleur', 'Régulateur de tension', 'Stabilisateur', 'Inverter'] },
  { n: 31202, subN: 312, fr: 'Puissance', type: T.SELECT, options: ['500VA', '1kVA', '2kVA', '3kVA', '5kVA'] },

  // ── 4. Mode ───────────────────────────────────────────────────────────────
  // Vêtements example (spec): sizes XS–XXXL. Chaussures example: EU size 35–48 / Color / Material / Gender.
  { n: 40101, subN: 401, fr: 'Taille', type: T.SELECT, options: VETEMENT_TAILLES, isRequired: true },
  { n: 40102, subN: 401, fr: 'Couleur', type: T.TEXT },
  { n: 40103, subN: 401, fr: 'Matière', type: T.SELECT, options: ['Coton', 'Polyester', 'Lin', 'Jean', 'Cuir', 'Laine', 'Wax'] },
  { n: 40201, subN: 402, fr: 'Taille', type: T.SELECT, options: VETEMENT_TAILLES, isRequired: true },
  { n: 40202, subN: 402, fr: 'Couleur', type: T.TEXT },
  { n: 40203, subN: 402, fr: 'Matière', type: T.SELECT, options: ['Coton', 'Polyester', 'Soie', 'Lin', 'Wax', 'Dentelle', 'Jean', 'Laine'] },
  { n: 40301, subN: 403, fr: 'Taille', type: T.SELECT, options: ['2-3 ans', '4-5 ans', '6-7 ans', '8-9 ans', '10-11 ans', '12-13 ans', '14-15 ans'], isRequired: true },
  { n: 40302, subN: 403, fr: 'Couleur', type: T.TEXT },
  { n: 40303, subN: 403, fr: 'Genre', type: T.SELECT, options: ['Garçon', 'Fille', 'Unisexe'] },
  { n: 40401, subN: 404, fr: 'Pointure', type: T.SELECT, options: POINTURES, isRequired: true },
  { n: 40402, subN: 404, fr: 'Couleur', type: T.TEXT },
  { n: 40403, subN: 404, fr: 'Matière', type: T.SELECT, options: ['Cuir', 'Cuir synthétique', 'Tissu', 'Toile', 'Caoutchouc', 'Daim'] },
  { n: 40501, subN: 405, fr: 'Pointure', type: T.SELECT, options: ['35', '36', '37', '38', '39', '40', '41', '42'], isRequired: true },
  { n: 40502, subN: 405, fr: 'Couleur', type: T.TEXT },
  { n: 40503, subN: 405, fr: 'Matière', type: T.SELECT, options: ['Cuir', 'Cuir synthétique', 'Tissu', 'Toile', 'Caoutchouc', 'Daim'] },
  { n: 40601, subN: 406, fr: 'Pointure', type: T.SELECT, options: ['24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '34'], isRequired: true },
  { n: 40602, subN: 406, fr: 'Genre', type: T.SELECT, options: ['Garçon', 'Fille', 'Unisexe'] },
  { n: 40701, subN: 407, fr: 'Type', type: T.SELECT, options: ['Sac à main', 'Sac à dos', 'Sacoche', 'Pochette', 'Valise', 'Sac de voyage', 'Portefeuille'] },
  { n: 40702, subN: 407, fr: 'Matière', type: T.SELECT, options: ['Cuir', 'Cuir synthétique', 'Tissu', 'Toile', 'Nylon'] },
  { n: 40703, subN: 407, fr: 'Couleur', type: T.TEXT },
  { n: 40801, subN: 408, fr: 'Type', type: T.SELECT, options: ['Montre analogique', 'Montre digitale', 'Montre connectée', 'Chronographe'] },
  { n: 40802, subN: 408, fr: 'Genre', type: T.SELECT, options: ['Homme', 'Femme', 'Unisexe'] },
  { n: 40803, subN: 408, fr: 'Matière du bracelet', type: T.SELECT, options: ['Métal', 'Cuir', 'Silicone', 'Tissu'] },
  { n: 40901, subN: 409, fr: 'Type', type: T.SELECT, options: ['Collier', 'Bracelet', 'Bague', "Boucles d'oreilles", 'Parure', 'Chaîne'] },
  { n: 40902, subN: 409, fr: 'Matière', type: T.SELECT, options: ['Plaqué or', 'Plaqué argent', 'Acier inoxydable', 'Or', 'Argent', 'Fantaisie'] },
  { n: 41001, subN: 410, fr: 'Type', type: T.SELECT, options: ['Lunettes de soleil', 'Lunettes de vue', 'Lunettes de lecture'] },
  { n: 41002, subN: 410, fr: 'Genre', type: T.SELECT, options: ['Homme', 'Femme', 'Unisexe'] },
  { n: 41101, subN: 411, fr: 'Type', type: T.SELECT, options: ['Ceinture', 'Chapeau', 'Écharpe', 'Gants', 'Cravate', 'Foulard'] },

  // ── 5. Beauté & Santé ─────────────────────────────────────────────────────
  { n: 50101, subN: 501, fr: 'Type', type: T.SELECT, options: ['Crème hydratante', 'Nettoyant', 'Sérum', 'Masque', 'Tonique', 'Exfoliant', 'Écran solaire'] },
  { n: 50102, subN: 501, fr: 'Type de peau', type: T.SELECT, options: ['Tous types', 'Peau grasse', 'Peau sèche', 'Peau mixte', 'Peau sensible'] },
  { n: 50201, subN: 502, fr: 'Type', type: T.SELECT, options: ['Lait corporel', 'Gel douche', 'Gommage', 'Beurre de karité', 'Huile corporelle', 'Crème éclaircissante'] },
  { n: 50301, subN: 503, fr: 'Type', type: T.SELECT, options: ['Shampooing', 'Après-shampooing', 'Masque capillaire', 'Huile capillaire', 'Crème coiffante', 'Défrisant'] },
  { n: 50302, subN: 503, fr: 'Type de cheveux', type: T.SELECT, options: ['Tous types', 'Cheveux crépus', 'Cheveux secs', 'Cheveux colorés', 'Cheveux gras'] },
  { n: 50401, subN: 504, fr: 'Type', type: T.SELECT, options: ['Perruque', 'Mèches', 'Tissage', 'Closure', 'Frontal'] },
  { n: 50402, subN: 504, fr: 'Longueur', type: T.SELECT, options: ['8"', '10"', '12"', '14"', '16"', '18"', '20"', '22"', '24"'] },
  { n: 50403, subN: 504, fr: 'Type de cheveux', type: T.SELECT, options: ['Naturel humain', 'Synthétique'] },
  { n: 50501, subN: 505, fr: 'Type', type: T.SELECT, options: ['Fond de teint', 'Rouge à lèvres', 'Mascara', 'Palette', 'Poudre', 'Vernis', 'Eyeliner', 'Anticerne'] },
  { n: 50601, subN: 506, fr: 'Volume', type: T.SELECT, options: ['30ml', '50ml', '75ml', '100ml', '125ml', '200ml'] },
  { n: 50602, subN: 506, fr: 'Type', type: T.SELECT, options: ['Eau de toilette', 'Eau de parfum', 'Parfum', 'Déodorant'] },
  { n: 50701, subN: 507, fr: 'Volume', type: T.SELECT, options: ['30ml', '50ml', '75ml', '100ml', '125ml', '200ml'] },
  { n: 50702, subN: 507, fr: 'Type', type: T.SELECT, options: ['Eau de toilette', 'Eau de parfum', 'Parfum', 'Déodorant'] },
  { n: 50801, subN: 508, fr: 'Type', type: T.SELECT, options: ['Savon', 'Dentifrice', 'Déodorant', 'Coton-tige', 'Rasoir', 'Serviettes hygiéniques'] },
  { n: 50901, subN: 509, fr: 'Type', type: T.SELECT, options: ['Lait de toilette', 'Crème change', 'Lingettes', 'Shampooing bébé', 'Huile bébé', 'Talc'] },
  { n: 51001, subN: 510, fr: 'Type', type: T.SELECT, options: ['Pansements', 'Antiseptique', 'Bandages', 'Trousse de secours', 'Compresses', 'Thermomètre'] },
  { n: 51101, subN: 511, fr: 'Type', type: T.SELECT, options: ['Complément alimentaire', 'Vitamines', 'Tensiomètre', 'Masques', 'Gel hydroalcoolique', 'Matériel médical'] },

  // ── 6. Construction & Bricolage ───────────────────────────────────────────
  { n: 60101, subN: 601, fr: 'Type', type: T.SELECT, options: ['Ciment', 'Sable', 'Gravier', 'Brique', 'Parpaing', 'Chaux', 'Plâtre'] },
  { n: 60102, subN: 601, fr: 'Conditionnement', type: T.SELECT, options: ['Sac 25kg', 'Sac 50kg', 'Tonne', 'Mètre cube', 'Unité'] },
  { n: 60201, subN: 602, fr: 'Type', type: T.SELECT, options: ['Fer à béton', 'Tube carré', 'Cornière', 'Tôle', 'Profilé', 'Treillis'] },
  { n: 60202, subN: 602, fr: 'Diamètre / Épaisseur', type: T.TEXT },
  { n: 60301, subN: 603, fr: 'Type', type: T.SELECT, options: ['Tôle ondulée', 'Tôle bac', 'Tôle plate', 'Faîtière', 'Tuile'] },
  { n: 60302, subN: 603, fr: 'Épaisseur', type: T.SELECT, options: ['25/100', '30/100', '35/100', '40/100'] },
  { n: 60401, subN: 604, fr: 'Type', type: T.SELECT, options: ['Câble', 'Disjoncteur', 'Interrupteur', 'Prise', 'Tableau électrique', 'Douille', 'Gaine'] },
  { n: 60501, subN: 605, fr: 'Type', type: T.SELECT, options: ['Tuyau PVC', 'Raccord', 'Robinet', 'Vanne', 'Coude', 'Réservoir WC', 'Évier'] },
  { n: 60601, subN: 606, fr: 'Type', type: T.SELECT, options: ['Peinture à eau', 'Peinture à huile', 'Vernis', 'Enduit', 'Apprêt', 'Diluant'] },
  { n: 60602, subN: 606, fr: 'Conditionnement', type: T.SELECT, options: ['1L', '5L', '10L', '20L', '25kg'] },
  { n: 60701, subN: 607, fr: 'Type', type: T.SELECT, options: ['Marteau', 'Tournevis', 'Pince', 'Clé', 'Scie', 'Mètre', 'Niveau', 'Truelle', 'Pelle'] },
  { n: 60801, subN: 608, fr: 'Type', type: T.SELECT, options: ['Perceuse', 'Meuleuse', 'Scie circulaire', 'Ponceuse', 'Compresseur', 'Poste à souder', 'Visseuse'] },
  { n: 60802, subN: 608, fr: 'Alimentation', type: T.SELECT, options: ['Filaire 220V', 'Batterie', 'Essence'] },
  { n: 60901, subN: 609, fr: 'Type', type: T.SELECT, options: ['Réservoir', 'Pompe de surface', 'Pompe immergée', 'Surpresseur', 'Citerne'] },
  { n: 60902, subN: 609, fr: 'Capacité', type: T.TEXT },
  { n: 61001, subN: 610, fr: 'Type', type: T.SELECT, options: ['Casque', 'Gants', 'Chaussures de sécurité', 'Lunettes', 'Masque', 'Gilet', 'Harnais'] },
  { n: 61101, subN: 611, fr: 'Type', type: T.SELECT, options: ['Vis', 'Clou', 'Boulon', 'Écrou', 'Cheville', 'Charnière', 'Serrure', 'Cadenas'] },

  // ── 7. Automobile & Moto ──────────────────────────────────────────────────
  // Automobile example (spec): brand-aware parts with vehicle compatibility.
  { n: 70101, subN: 701, fr: 'Type', type: T.SELECT, options: ['Batterie auto', 'Batterie moto', 'Batterie camion'] },
  { n: 70102, subN: 701, fr: 'Capacité', type: T.SELECT, options: ['35Ah', '45Ah', '60Ah', '70Ah', '100Ah', '150Ah'] },
  { n: 70201, subN: 702, fr: 'Type', type: T.SELECT, options: ['Pneu', 'Jante', 'Pneu + Jante'] },
  { n: 70202, subN: 702, fr: 'Dimension', type: T.TEXT },
  { n: 70301, subN: 703, fr: 'Type', type: T.SELECT, options: ['Huile moteur', 'Huile de boîte', 'Liquide de frein', 'Liquide de refroidissement', 'Graisse'] },
  { n: 70302, subN: 703, fr: 'Viscosité', type: T.SELECT, options: ['5W30', '5W40', '10W40', '15W40', '20W50'] },
  { n: 70303, subN: 703, fr: 'Volume', type: T.SELECT, options: ['1L', '4L', '5L', '20L'] },
  { n: 70401, subN: 704, fr: 'Type de pièce', type: T.SELECT, options: ['Filtre', 'Bougie', 'Courroie', 'Pompe', 'Joint', 'Radiateur', 'Démarreur', 'Alternateur'] },
  { n: 70402, subN: 704, fr: 'Marque véhicule', type: T.SELECT, options: ['Toyota', 'Mitsubishi', 'Nissan', 'Mercedes-Benz', 'Hyundai', 'Honda', 'Land Rover', 'Ford', 'Suzuki', 'Volkswagen'] },
  { n: 70403, subN: 704, fr: 'État', type: T.SELECT, options: ETAT },
  { n: 70501, subN: 705, fr: 'Type', type: T.SELECT, options: ['Plaquettes de frein', 'Disques de frein', 'Amortisseur', 'Ressort', 'Rotule', 'Triangle'] },
  { n: 70502, subN: 705, fr: 'Marque véhicule', type: T.TEXT },
  { n: 70601, subN: 706, fr: 'Type', type: T.SELECT, options: ['Démarreur', 'Alternateur', 'Faisceau', 'Ampoule', 'Fusible', 'Capteur', 'Relais'] },
  { n: 70701, subN: 707, fr: 'Type', type: T.SELECT, options: ['Tapis', 'Housse de siège', 'Autoradio', 'Caméra de recul', 'Chargeur', 'Support téléphone', 'Désodorisant'] },
  { n: 70801, subN: 708, fr: 'Type de pièce', type: T.SELECT, options: ['Pneu moto', 'Chaîne', 'Plaquette', 'Filtre', 'Bougie', 'Phare', 'Rétroviseur', 'Carénage'] },
  { n: 70802, subN: 708, fr: 'Cylindrée', type: T.SELECT, options: ['50cc', '100cc', '125cc', '150cc', '200cc', '250cc'] },
  { n: 70901, subN: 709, fr: 'Type', type: T.SELECT, options: ['Casque intégral', 'Casque jet', 'Gants', 'Veste', 'Genouillères', 'Bottes'] },
  { n: 70902, subN: 709, fr: 'Taille', type: T.SELECT, options: ['S', 'M', 'L', 'XL', 'XXL'] },
  { n: 71001, subN: 710, fr: 'Type', type: T.SELECT, options: ['Cire', 'Shampooing auto', 'Nettoyant jantes', 'Aspirateur', 'Microfibre', 'Polish'] },
  { n: 71101, subN: 711, fr: 'Type', type: T.SELECT, options: ['Triangle de signalisation', 'Extincteur', 'Gilet réfléchissant', 'Cric', 'Câbles de démarrage', 'Trousse de secours'] },
];

// ────────────────────────────────────────────────────────────────────────────
// BRAND LIBRARY (reusable, admin-managed). `subs` lists the subcategory numeric
// keys each brand is offered in. NOTE: the strict taxonomy has no "TV"
// subcategory, so TV-only brands (TCL, Skyworth) link to the closest fit
// (Électroménager) and remain available for a future TV subcategory.
// ────────────────────────────────────────────────────────────────────────────

export const STRICT_BRANDS: BrandDef[] = [
  // Phones / electronics
  { n: 1, fr: 'Samsung', subs: [201, 203, 209, 301, 302, 303, 304, 306, 307] },
  { n: 2, fr: 'Apple', subs: [201, 203, 205, 209] },
  { n: 3, fr: 'Tecno', subs: [201, 202, 206] },
  { n: 4, fr: 'Infinix', subs: [201, 202, 206] },
  { n: 5, fr: 'Itel', subs: [201, 202, 206] },
  { n: 6, fr: 'Xiaomi', subs: [201, 203, 206, 208, 209] },
  { n: 7, fr: 'Nokia', subs: [201, 202] },
  { n: 8, fr: 'Google', subs: [201] },
  { n: 9, fr: 'Huawei', subs: [201, 203, 208, 209] },
  { n: 10, fr: 'OnePlus', subs: [201] },
  { n: 11, fr: 'Oppo', subs: [201, 205] },
  { n: 12, fr: 'Realme', subs: [201, 206] },
  { n: 13, fr: 'HP', subs: [209, 210, 211] },
  { n: 14, fr: 'Dell', subs: [209, 210] },
  { n: 15, fr: 'Lenovo', subs: [203, 209, 210] },
  { n: 16, fr: 'Asus', subs: [209, 210, 208] },
  { n: 17, fr: 'Acer', subs: [209, 210] },
  { n: 18, fr: 'Canon', subs: [211] },
  { n: 19, fr: 'Epson', subs: [211] },
  { n: 20, fr: 'JBL', subs: [205] },
  { n: 21, fr: 'Sony', subs: [205] },
  { n: 22, fr: 'Anker', subs: [204, 206] },
  { n: 23, fr: 'TP-Link', subs: [208] },
  // Appliances (incl. TV brands kept for a future TV subcategory)
  { n: 24, fr: 'LG', subs: [301, 302, 304, 307] },
  { n: 25, fr: 'Hisense', subs: [301, 303, 307] },
  { n: 26, fr: 'TCL', subs: [307] },
  { n: 27, fr: 'Skyworth', subs: [307] },
  { n: 28, fr: 'Beko', subs: [301, 302, 304] },
  { n: 29, fr: 'Midea', subs: [303, 306, 307, 308] },
  { n: 30, fr: 'Binatone', subs: [305, 306, 308, 309] },
  { n: 31, fr: 'Nasco', subs: [301, 302, 304] },
  { n: 32, fr: 'Bruhm', subs: [301, 302, 304, 307] },
  { n: 33, fr: 'Elepaq', subs: [310] },
  { n: 34, fr: 'Honda', subs: [310, 708] },
  // Fashion / shoes
  { n: 35, fr: 'Nike', subs: [404, 405, 406] },
  { n: 36, fr: 'Adidas', subs: [404, 405, 406] },
  { n: 37, fr: 'Puma', subs: [404, 405] },
  { n: 38, fr: 'Reebok', subs: [404, 405] },
  { n: 39, fr: 'Bata', subs: [404, 405, 406] },
  { n: 40, fr: 'Vlisco', subs: [402] },
  // Beauty
  { n: 41, fr: "L'Oréal", subs: [501, 503, 505] },
  { n: 42, fr: 'Nivea', subs: [501, 502, 508] },
  { n: 43, fr: 'Dark and Lovely', subs: [503, 504] },
  { n: 44, fr: 'Maybelline', subs: [505] },
  // Tools / construction
  { n: 45, fr: 'Bosch', subs: [608, 607] },
  { n: 46, fr: 'Makita', subs: [608] },
  { n: 47, fr: 'DeWalt', subs: [608] },
  { n: 48, fr: 'Stanley', subs: [607, 611] },
  { n: 49, fr: 'Total', subs: [703] },
  { n: 50, fr: 'Castrol', subs: [703] },
  { n: 51, fr: 'Mobil', subs: [703] },
];
