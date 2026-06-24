/**
 * Three-level marketplace taxonomy + dynamic-attribute templates + brand
 * library (Catalog Architecture Refactor, 2026-06-24).
 *
 *   Catégorie  →  Sous-catégorie  →  Type de produit   (max depth = 3)
 *
 * Single source of truth for the catalog structure. `seed.ts` consumes these
 * tables to upsert the category tree (3 levels, all `Category` rows in the
 * self-referential tree), per-product-type ProductAttribute templates, and the
 * reusable Brand library (with brand↔product-type links). Pure data — no Prisma
 * access here.
 *
 * Rules:
 *  - Exactly THREE levels. Product types are `Category` nodes whose parent is a
 *    subcategory (we reuse the existing self-tree — there is no ProductType
 *    table). A Product links to the leaf (a product-type node).
 *  - Condition is the `ProductCondition` enum (NEW | USED) — NOT an attribute.
 *    Brand is the first-class `Brand` entity — NOT an attribute. So neither
 *    appears in the attribute templates below.
 *  - Deterministic UUIDs so re-seeding is idempotent. Ranges:
 *      categories + subcategories  13000000-…  (cat = n, sub = parent*100 + i)
 *      product types               16000000-…  (n = subN*100 + slot)
 *      attributes                  14000000-…  (n = typeN*100 + slot)
 *      brands                      15000000-…  (n = 1..N)
 *  - Names / options are French (the only locale).
 */
import { AttributeType } from '@prisma/client';

const { TEXT, SELECT, MULTISELECT, BOOLEAN } = AttributeType;

export interface AttrTpl {
  fr: string;
  type: AttributeType;
  options?: string[];
  isRequired?: boolean;
}

export interface ProductTypeDef {
  /** Stable numeric key: subN*100 + slot. */
  n: number;
  fr: string;
  /** Attribute templates for this product type (order = display order). */
  attrs?: AttrTpl[];
}

export interface SubcategoryDef {
  /** Stable numeric key: parent*100 + index. */
  n: number;
  fr: string;
  types: ProductTypeDef[];
}

export interface CategoryDef {
  /** Stable numeric key 1..7. */
  n: number;
  emoji: string;
  fr: string;
  subs: SubcategoryDef[];
}

export interface BrandDef {
  /** Stable numeric key 1..N. */
  n: number;
  fr: string;
  /** Product-type numeric keys this brand is offered in (empty = link to all). */
  types: number[];
}

// ────────────────────────────────────────────────────────────────────────────
// REUSABLE ATTRIBUTE TEMPLATES
// ────────────────────────────────────────────────────────────────────────────
const WARRANTY: AttrTpl = { fr: 'Garantie', type: SELECT, options: ['Aucune', '3 mois', '6 mois', '1 an', '2 ans'] };
const COLOR: AttrTpl = { fr: 'Couleur', type: TEXT };
const MATERIAL: AttrTpl = { fr: 'Matière', type: TEXT };
const WEIGHT: AttrTpl = { fr: 'Poids', type: TEXT };
const VOLUME: AttrTpl = { fr: 'Volume', type: TEXT };
const EXPIRY: AttrTpl = { fr: "Date d'expiration", type: TEXT };
const CAPACITY: AttrTpl = { fr: 'Capacité', type: TEXT };
const POWER: AttrTpl = { fr: 'Puissance', type: TEXT };

const RAM: AttrTpl = { fr: 'RAM', type: SELECT, options: ['2Go', '3Go', '4Go', '6Go', '8Go', '12Go', '16Go'] };
const STORAGE: AttrTpl = { fr: 'Stockage', type: SELECT, options: ['16Go', '32Go', '64Go', '128Go', '256Go', '512Go', '1To'] };
const SIZE_CLO: AttrTpl = { fr: 'Taille', type: SELECT, options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] };
const SIZE_SHOE: AttrTpl = { fr: 'Pointure', type: SELECT, options: ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46'] };
const AGE_KID: AttrTpl = { fr: 'Âge', type: SELECT, options: ['0-6 mois', '6-12 mois', '1-2 ans', '2-4 ans', '4-6 ans', '6-8 ans', '8-10 ans', '10-12 ans'] };

const PHONE: AttrTpl[] = [{ fr: 'Modèle', type: TEXT }, RAM, STORAGE, COLOR, WARRANTY];
const FEATUREPHONE: AttrTpl[] = [{ fr: 'Modèle', type: TEXT }, COLOR, WARRANTY];
const LAPTOP: AttrTpl[] = [{ fr: 'Processeur', type: TEXT }, RAM, { fr: 'Stockage SSD', type: SELECT, options: ['128Go', '256Go', '512Go', '1To', '2To'] }, { fr: 'Taille écran', type: TEXT }, { fr: "Système d'exploitation", type: SELECT, options: ['Windows', 'macOS', 'Linux', 'ChromeOS'] }, WARRANTY];
const DESKTOP: AttrTpl[] = [{ fr: 'Processeur', type: TEXT }, RAM, { fr: 'Stockage', type: TEXT }, WARRANTY];
const MONITOR: AttrTpl[] = [{ fr: 'Taille écran', type: SELECT, options: ['19"', '22"', '24"', '27"', '32"'] }, { fr: 'Résolution', type: SELECT, options: ['HD', 'Full HD', '2K', '4K'] }, WARRANTY];
const PRINTER: AttrTpl[] = [{ fr: 'Type', type: SELECT, options: ["Jet d'encre", 'Laser'] }, { fr: 'Fonctions', type: MULTISELECT, options: ['Impression', 'Scan', 'Copie', 'Fax'] }, WARRANTY];
const TV: AttrTpl[] = [{ fr: 'Taille écran', type: SELECT, options: ['24"', '32"', '43"', '50"', '55"', '65"', '75"'] }, { fr: 'Résolution', type: SELECT, options: ['HD', 'Full HD', '4K', '8K'] }, { fr: 'Smart TV', type: BOOLEAN }, WARRANTY];
const AUDIO: AttrTpl[] = [POWER, { fr: 'Connectivité', type: MULTISELECT, options: ['Bluetooth', 'WiFi', 'Filaire', 'USB'] }, WARRANTY];
const CONSOLE: AttrTpl[] = [{ fr: 'Modèle', type: TEXT }, { fr: 'Stockage', type: TEXT }, WARRANTY];
const CAMERA: AttrTpl[] = [{ fr: 'Résolution', type: TEXT }, { fr: 'Connectivité', type: MULTISELECT, options: ['WiFi', 'Filaire', 'Bluetooth'] }, WARRANTY];
const NETWORK: AttrTpl[] = [{ fr: 'Norme WiFi', type: SELECT, options: ['WiFi 4', 'WiFi 5', 'WiFi 6'] }, { fr: 'Débit', type: TEXT }, WARRANTY];
const WEARABLE: AttrTpl[] = [{ fr: 'Compatibilité', type: SELECT, options: ['Android', 'iOS', 'Les deux'] }, COLOR, WARRANTY];
const PHONE_ACC: AttrTpl[] = [COLOR, { fr: 'Compatibilité', type: TEXT }];
const KITCHEN_APP: AttrTpl[] = [CAPACITY, POWER, WARRANTY];
const FRIDGE: AttrTpl[] = [{ fr: 'Capacité (litres)', type: TEXT }, { fr: 'Type', type: SELECT, options: ['1 porte', '2 portes', 'Side-by-side'] }, WARRANTY];
const WASHER: AttrTpl[] = [{ fr: 'Capacité (kg)', type: TEXT }, { fr: 'Type', type: SELECT, options: ['Top', 'Frontale'] }, WARRANTY];
const AC: AttrTpl[] = [{ fr: 'Puissance (BTU)', type: SELECT, options: ['9000', '12000', '18000', '24000'] }, WARRANTY];
const FAN: AttrTpl[] = [{ fr: 'Type', type: SELECT, options: ['Sur pied', 'Table', 'Plafond', 'Mural'] }, WARRANTY];
const APP_GENERIC: AttrTpl[] = [POWER, WARRANTY];
const CLOTHING: AttrTpl[] = [SIZE_CLO, COLOR, MATERIAL];
const KIDSWEAR: AttrTpl[] = [AGE_KID, COLOR, MATERIAL];
const SHOES: AttrTpl[] = [SIZE_SHOE, COLOR, MATERIAL];
const BAG: AttrTpl[] = [COLOR, MATERIAL];
const WATCH: AttrTpl[] = [COLOR, { fr: 'Matière du bracelet', type: TEXT }, WARRANTY];
const JEWELRY: AttrTpl[] = [{ fr: 'Matière', type: SELECT, options: ['Or', 'Argent', 'Plaqué or', 'Acier', 'Fantaisie'] }, COLOR];
const FOOD: AttrTpl[] = [WEIGHT, EXPIRY];
const BEVERAGE: AttrTpl[] = [VOLUME, EXPIRY];
const CONSUMABLE: AttrTpl[] = [VOLUME, EXPIRY];
const DIAPER: AttrTpl[] = [{ fr: 'Taille', type: TEXT }, WEIGHT];
const MAKEUP: AttrTpl[] = [{ fr: 'Teinte', type: TEXT }, EXPIRY];
const SKINCARE: AttrTpl[] = [{ fr: 'Type de peau', type: SELECT, options: ['Normale', 'Sèche', 'Grasse', 'Mixte', 'Sensible'] }, VOLUME, EXPIRY];
const PERFUME: AttrTpl[] = [VOLUME, { fr: 'Genre', type: SELECT, options: ['Homme', 'Femme', 'Mixte'] }];
const COOKWARE: AttrTpl[] = [MATERIAL, CAPACITY];
const TABLEWARE: AttrTpl[] = [MATERIAL, { fr: 'Quantité', type: TEXT }];
const FURNITURE: AttrTpl[] = [MATERIAL, COLOR, { fr: 'Dimensions', type: TEXT }];
const LIGHTING: AttrTpl[] = [{ fr: 'Type', type: SELECT, options: ['LED', 'Halogène', 'Incandescente', 'Solaire'] }, POWER];
const BEDDING: AttrTpl[] = [{ fr: 'Dimensions', type: SELECT, options: ['1 personne', '2 personnes', 'Queen', 'King'] }, MATERIAL, COLOR];
const BATHROOM: AttrTpl[] = [MATERIAL, COLOR];

// ────────────────────────────────────────────────────────────────────────────
// CATEGORY TREE (7 categories, fixed display order)
// ────────────────────────────────────────────────────────────────────────────
const t = (n: number, fr: string, attrs?: AttrTpl[]): ProductTypeDef => ({ n, fr, attrs });

export const STRICT_CATEGORIES: CategoryDef[] = [
  {
    n: 1, emoji: '🛒', fr: 'Supermarché', subs: [
      { n: 101, fr: 'Alimentation', types: [t(10101, 'Riz', FOOD), t(10102, 'Farine', FOOD), t(10103, 'Sucre', FOOD), t(10104, 'Pâtes', FOOD), t(10105, 'Céréales', FOOD), t(10106, 'Conserves', FOOD), t(10107, 'Huiles', BEVERAGE), t(10108, 'Condiments', FOOD), t(10109, 'Biscuits', FOOD), t(10110, 'Snacks', FOOD)] },
      { n: 102, fr: 'Boissons', types: [t(10201, 'Eau', BEVERAGE), t(10202, 'Jus', BEVERAGE), t(10203, 'Sodas', BEVERAGE), t(10204, 'Café', FOOD), t(10205, 'Thé', FOOD), t(10206, 'Boissons énergétiques', BEVERAGE)] },
      { n: 103, fr: 'Hygiène Personnelle', types: [t(10301, 'Savons', CONSUMABLE), t(10302, 'Shampoings', CONSUMABLE), t(10303, 'Dentifrices', CONSUMABLE), t(10304, 'Déodorants', CONSUMABLE)] },
      { n: 104, fr: 'Entretien Maison', types: [t(10401, 'Lessive', CONSUMABLE), t(10402, 'Détergents', CONSUMABLE), t(10403, 'Javel', CONSUMABLE), t(10404, 'Nettoyants', CONSUMABLE), t(10405, 'Désinfectants', CONSUMABLE)] },
      { n: 105, fr: 'Bébé', types: [t(10501, 'Couches', DIAPER), t(10502, 'Lingettes', CONSUMABLE), t(10503, 'Lait infantile', FOOD), t(10504, 'Biberons', [COLOR])] },
    ],
  },
  {
    n: 2, emoji: '📱', fr: 'Téléphones & Accessoires', subs: [
      { n: 201, fr: 'Smartphones', types: [t(20101, 'Android', PHONE), t(20102, 'iPhone', PHONE)] },
      { n: 202, fr: 'Téléphones Classiques', types: [t(20201, 'Téléphones à touches', FEATUREPHONE)] },
      { n: 203, fr: 'Tablettes', types: [t(20301, 'Android', PHONE), t(20302, 'iPad', PHONE)] },
      { n: 204, fr: 'Accessoires', types: [t(20401, 'Chargeurs', PHONE_ACC), t(20402, 'Écouteurs', PHONE_ACC), t(20403, 'Casques', PHONE_ACC), t(20404, 'Power Banks', [CAPACITY, COLOR]), t(20405, 'Coques', PHONE_ACC), t(20406, 'Protections écran', PHONE_ACC), t(20407, 'Câbles', PHONE_ACC)] },
      { n: 205, fr: 'Objets Connectés', types: [t(20501, 'Montres connectées', WEARABLE), t(20502, 'Bracelets connectés', WEARABLE)] },
    ],
  },
  {
    n: 3, emoji: '🔌', fr: 'Électronique', subs: [
      { n: 301, fr: 'TV & Audio', types: [t(30101, 'Téléviseurs', TV), t(30102, 'Barres de son', AUDIO), t(30103, 'Haut-parleurs', AUDIO), t(30104, 'Home cinéma', AUDIO)] },
      { n: 302, fr: 'Informatique', types: [t(30201, 'Ordinateurs portables', LAPTOP), t(30202, 'Ordinateurs de bureau', DESKTOP), t(30203, 'Moniteurs', MONITOR), t(30204, 'Imprimantes', PRINTER)] },
      { n: 303, fr: 'Gaming', types: [t(30301, 'PlayStation', CONSOLE), t(30302, 'Xbox', CONSOLE), t(30303, 'Nintendo', CONSOLE), t(30304, 'Accessoires Gaming', [COLOR, { fr: 'Compatibilité', type: TEXT }])] },
      { n: 304, fr: 'Caméras', types: [t(30401, 'Caméras IP', CAMERA), t(30402, 'Caméras surveillance', CAMERA), t(30403, 'Caméras sportives', CAMERA)] },
      { n: 305, fr: 'Réseau & Internet', types: [t(30501, 'Routeurs', NETWORK), t(30502, 'Modems', NETWORK), t(30503, 'Répéteurs WiFi', NETWORK)] },
    ],
  },
  {
    n: 4, emoji: '🧺', fr: 'Électroménager', subs: [
      { n: 401, fr: 'Cuisine', types: [t(40101, 'Mixeurs', KITCHEN_APP), t(40102, 'Blenders', KITCHEN_APP), t(40103, 'Micro-ondes', KITCHEN_APP), t(40104, 'Bouilloires', KITCHEN_APP), t(40105, 'Fours', KITCHEN_APP)] },
      { n: 402, fr: 'Réfrigération', types: [t(40201, 'Réfrigérateurs', FRIDGE), t(40202, 'Congélateurs', FRIDGE)] },
      { n: 403, fr: 'Lavage', types: [t(40301, 'Machines à laver', WASHER), t(40302, 'Sèche-linge', WASHER)] },
      { n: 404, fr: 'Climatisation', types: [t(40401, 'Climatiseurs', AC), t(40402, 'Ventilateurs', FAN)] },
      { n: 405, fr: 'Entretien Maison', types: [t(40501, 'Fers à repasser', APP_GENERIC), t(40502, 'Aspirateurs', APP_GENERIC)] },
    ],
  },
  {
    n: 5, emoji: '👗', fr: 'Mode', subs: [
      { n: 501, fr: 'Homme', types: [t(50101, 'T-shirts', CLOTHING), t(50102, 'Chemises', CLOTHING), t(50103, 'Pantalons', CLOTHING), t(50104, 'Jeans', CLOTHING), t(50105, 'Vestes & Manteaux', CLOTHING), t(50106, 'Costumes', CLOTHING), t(50107, 'Sous-vêtements', CLOTHING), t(50108, 'Survêtements', CLOTHING)] },
      { n: 502, fr: 'Femme', types: [t(50201, 'Robes', CLOTHING), t(50202, 'Tops & T-shirts', CLOTHING), t(50203, 'Pantalons', CLOTHING), t(50204, 'Jupes', CLOTHING), t(50205, 'Vestes & Manteaux', CLOTHING), t(50206, 'Lingerie', CLOTHING), t(50207, 'Ensembles', CLOTHING)] },
      { n: 503, fr: 'Enfants', types: [t(50301, 'Vêtements garçon', KIDSWEAR), t(50302, 'Vêtements fille', KIDSWEAR), t(50303, 'Vêtements bébé', KIDSWEAR)] },
      { n: 504, fr: 'Chaussures', types: [t(50401, 'Baskets', SHOES), t(50402, 'Sandales', SHOES), t(50403, 'Chaussures de ville', SHOES), t(50404, 'Bottes', SHOES), t(50405, 'Talons', SHOES)] },
      { n: 505, fr: 'Accessoires', types: [t(50501, 'Sacs', BAG), t(50502, 'Ceintures', [COLOR, MATERIAL]), t(50503, 'Montres', WATCH), t(50504, 'Lunettes de soleil', [COLOR]), t(50505, 'Bijoux', JEWELRY), t(50506, 'Chapeaux', [COLOR, MATERIAL])] },
    ],
  },
  {
    n: 6, emoji: '💄', fr: 'Beauté & Santé', subs: [
      { n: 601, fr: 'Beauté', types: [t(60101, 'Maquillage', MAKEUP), t(60102, 'Soins du visage', SKINCARE), t(60103, 'Soins capillaires', CONSUMABLE), t(60104, 'Vernis & Ongles', MAKEUP)] },
      { n: 602, fr: 'Soins Personnels', types: [t(60201, 'Gels douche & Savons', CONSUMABLE), t(60202, 'Déodorants', CONSUMABLE), t(60203, 'Soins du corps', SKINCARE), t(60204, 'Rasage & Épilation', [VOLUME])] },
      { n: 603, fr: 'Parfums', types: [t(60301, 'Parfums Homme', PERFUME), t(60302, 'Parfums Femme', PERFUME), t(60303, 'Coffrets parfums', PERFUME)] },
      { n: 604, fr: 'Santé', types: [t(60401, 'Premiers secours', [EXPIRY]), t(60402, 'Vitamines & Compléments', [EXPIRY]), t(60403, 'Matériel médical', [WARRANTY])] },
      { n: 605, fr: 'Bien-être', types: [t(60501, 'Massage & Relaxation', [WARRANTY]), t(60502, 'Soins minceur', [VOLUME, EXPIRY])] },
    ],
  },
  {
    n: 7, emoji: '🏠', fr: 'Maison & Cuisine', subs: [
      { n: 701, fr: 'Cuisine & Vaisselle', types: [t(70101, 'Marmites', COOKWARE), t(70102, 'Poêles', COOKWARE), t(70103, 'Assiettes', TABLEWARE), t(70104, 'Verres', TABLEWARE), t(70105, 'Couverts', TABLEWARE), t(70106, 'Thermos', [CAPACITY, COLOR]), t(70107, 'Boîtes alimentaires', [CAPACITY, MATERIAL])] },
      { n: 702, fr: 'Mobilier & Rangement', types: [t(70201, 'Tables', FURNITURE), t(70202, 'Chaises', FURNITURE), t(70203, 'Armoires', FURNITURE), t(70204, 'Étagères', FURNITURE), t(70205, 'Boîtes de rangement', [MATERIAL, CAPACITY])] },
      { n: 703, fr: 'Décoration & Éclairage', types: [t(70301, 'Lampes', LIGHTING), t(70302, 'Ampoules', LIGHTING), t(70303, 'Horloges', [COLOR, MATERIAL]), t(70304, 'Tableaux', [{ fr: 'Dimensions', type: TEXT }]), t(70305, 'Décoration murale', [COLOR, MATERIAL])] },
      { n: 704, fr: 'Linge de Maison', types: [t(70401, 'Draps', BEDDING), t(70402, 'Couvertures', BEDDING), t(70403, 'Oreillers', [MATERIAL, COLOR]), t(70404, 'Rideaux', [MATERIAL, COLOR]), t(70405, 'Serviettes', [MATERIAL, COLOR])] },
      { n: 705, fr: 'Salle de Bain', types: [t(70501, 'Rideaux de douche', BATHROOM), t(70502, 'Tapis de bain', BATHROOM), t(70503, 'Porte-savons', BATHROOM), t(70504, 'Accessoires salle de bain', BATHROOM)] },
    ],
  },
];

// ────────────────────────────────────────────────────────────────────────────
// BRAND LIBRARY (brand → product-type numeric keys). "Autre" (n: 1) links to
// EVERY product type (empty `types` = link-to-all, handled in seed.ts).
// ────────────────────────────────────────────────────────────────────────────
export const STRICT_BRANDS: BrandDef[] = [
  { n: 1, fr: 'Autre', types: [] },
  // Phones / tablets
  { n: 2, fr: 'Samsung', types: [20101, 20301, 30101, 30102, 30103, 40201, 40301, 40401, 20501] },
  { n: 3, fr: 'Apple', types: [20102, 20302, 30201, 20402, 20501] },
  { n: 4, fr: 'Tecno', types: [20101, 20201, 20301] },
  { n: 5, fr: 'Infinix', types: [20101, 20301] },
  { n: 6, fr: 'Itel', types: [20101, 20201] },
  { n: 7, fr: 'Xiaomi', types: [20101, 20301, 30101, 20501, 30501] },
  { n: 8, fr: 'Huawei', types: [20101, 20301, 30501, 30502] },
  { n: 9, fr: 'Oppo', types: [20101] },
  { n: 10, fr: 'Realme', types: [20101] },
  { n: 11, fr: 'Vivo', types: [20101] },
  { n: 12, fr: 'Nokia', types: [20101, 20201] },
  { n: 13, fr: 'Google', types: [20101, 20301] },
  // Computing
  { n: 14, fr: 'HP', types: [30201, 30202, 30203, 30204] },
  { n: 15, fr: 'Dell', types: [30201, 30202, 30203] },
  { n: 16, fr: 'Lenovo', types: [30201, 30202, 20301] },
  { n: 17, fr: 'Asus', types: [30201, 30202, 30203, 30501] },
  { n: 18, fr: 'Acer', types: [30201, 30202, 30203] },
  { n: 19, fr: 'Canon', types: [30204, 30401, 30403] },
  { n: 20, fr: 'Epson', types: [30204] },
  // TV / audio / gaming / camera
  { n: 21, fr: 'Sony', types: [30101, 30102, 30103, 30104, 30301, 30403, 20402] },
  { n: 22, fr: 'LG', types: [30101, 40201, 40301, 40401] },
  { n: 23, fr: 'Hisense', types: [30101, 40201, 40401] },
  { n: 24, fr: 'TCL', types: [30101, 40401] },
  { n: 25, fr: 'JBL', types: [30102, 30103, 20402, 20403] },
  { n: 26, fr: 'Microsoft', types: [30302, 30201] },
  { n: 27, fr: 'Nintendo', types: [30303] },
  { n: 28, fr: 'TP-Link', types: [30501, 30502, 30503] },
  // Appliances
  { n: 29, fr: 'Geepas', types: [40101, 40102, 40103, 40104, 40105, 40402, 40501, 40502, 70106] },
  { n: 30, fr: 'Mika', types: [40101, 40103, 40105, 40201, 40301, 40402] },
  { n: 31, fr: 'Nasco', types: [30101, 40201, 40301, 40401, 40402] },
  { n: 32, fr: 'Binatone', types: [40101, 40102, 40104, 40402, 40501] },
  { n: 33, fr: 'Nunix', types: [40101, 40102, 40104, 40105, 70106] },
  // Fashion
  { n: 34, fr: 'Nike', types: [50101, 50102, 50103, 50108, 50401, 50202, 50203] },
  { n: 35, fr: 'Adidas', types: [50101, 50103, 50108, 50401, 50202] },
  { n: 36, fr: 'Puma', types: [50101, 50108, 50401] },
  { n: 37, fr: "Levi's", types: [50104, 50103, 50203] },
  { n: 38, fr: 'Lacoste', types: [50101, 50102, 50401, 60301, 60302] },
  { n: 39, fr: 'Bata', types: [50401, 50402, 50403, 50404, 50405] },
  // Beauty / personal care
  { n: 40, fr: 'Nivea', types: [60102, 60201, 60202, 60203, 10301] },
  { n: 41, fr: 'Dove', types: [60201, 60202, 10301, 10302] },
  { n: 42, fr: "L'Oréal", types: [60101, 60102, 60103, 10302] },
  { n: 43, fr: 'Garnier', types: [60102, 60103, 10302] },
  { n: 44, fr: 'Colgate', types: [10303] },
  // Supermarket
  { n: 45, fr: 'Omo', types: [10401] },
  { n: 46, fr: 'Ariel', types: [10401, 10402] },
  { n: 47, fr: 'Nestlé', types: [10503, 10204, 10105] },
  { n: 48, fr: 'Pampers', types: [10501, 10502] },
  { n: 49, fr: 'Huggies', types: [10501, 10502] },
];
