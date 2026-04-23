import { PrismaClient, AttributeType, ProductCondition, ProductStatus, OrderStatus, PaymentMethod, PaymentStatus, TransactionType, TransactionProvider, PayoutStatus, ReviewStatus, BannerStatus, PromotionType, PromotionStatus, ContentPageStatus, NotificationBroadcastStatus } from '@prisma/client';

const prisma = new PrismaClient();

function generateProductSlug(frenchTitle: string, productId: string): string {
  const base = frenchTitle
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 80);
  const shortId = productId.replace(/-/g, '').substring(0, 6);
  return `${base}-${shortId}`;
}

async function main() {
  console.log('Seeding database...');

  // ============================================================
  // USERS & SELLER PROFILES
  // ============================================================

  // Admin user
  const admin = await prisma.user.upsert({
    where: { phone: '+243999000001' },
    update: {},
    create: {
      phone: '+243999000001',
      firstName: 'Admin',
      lastName: 'Teka',
      email: 'admin@teka.cd',
      role: 'ADMIN',
      status: 'ACTIVE',
      phoneVerified: true,
      emailVerified: true,
      locale: 'fr',
    },
  });
  console.log(`Admin user: ${admin.id}`);

  // Buyer user
  const buyer = await prisma.user.upsert({
    where: { phone: '+243999000002' },
    update: {},
    create: {
      phone: '+243999000002',
      firstName: 'Jean',
      lastName: 'Mulamba',
      role: 'BUYER',
      status: 'ACTIVE',
      phoneVerified: true,
      locale: 'fr',
    },
  });
  console.log(`Buyer user: ${buyer.id}`);

  // Seller user 1 — Marie
  const seller1 = await prisma.user.upsert({
    where: { phone: '+243999000003' },
    update: {},
    create: {
      phone: '+243999000003',
      firstName: 'Marie',
      lastName: 'Kabila',
      email: 'marie@shop.cd',
      role: 'SELLER',
      status: 'ACTIVE',
      phoneVerified: true,
      locale: 'fr',
    },
  });
  console.log(`Seller user 1 (Marie): ${seller1.id}`);

  // Seller user 2 — Patrick
  const seller2 = await prisma.user.upsert({
    where: { phone: '+243999000004' },
    update: {},
    create: {
      phone: '+243999000004',
      firstName: 'Patrick',
      lastName: 'Kalume',
      email: 'patrickk@test.com',
      role: 'SELLER',
      status: 'ACTIVE',
      phoneVerified: true,
      emailVerified: true,
      locale: 'fr',
    },
  });
  console.log(`Seller user 2 (Patrick): ${seller2.id}`);

  // Seller profile 1 — Boutique Marie
  await prisma.sellerProfile.upsert({
    where: { userId: seller1.id },
    update: {},
    create: {
      userId: seller1.id,
      businessName: 'Boutique Marie',
      businessType: 'individual',
      idNumber: 'CD-123456789',
      idType: 'national_id',
      phone: '+243999000003',
      location: 'Lubumbashi, Kampemba',
      description: 'Articles de mode et accessoires',
      applicationStatus: 'APPROVED',
      approvedAt: new Date(),
      approvedById: admin.id,
    },
  });

  // Seller profile 2 — Tech Shop Lubumbashi
  await prisma.sellerProfile.upsert({
    where: { userId: seller2.id },
    update: {},
    create: {
      userId: seller2.id,
      businessName: 'Tech Shop Lubumbashi',
      businessType: 'company',
      idNumber: 'CD-987654321',
      idType: 'rccm',
      phone: '+243999000004',
      location: 'Lubumbashi, Lubumbashi',
      description: 'Vente de smartphones, ordinateurs et accessoires informatiques',
      applicationStatus: 'APPROVED',
      approvedAt: new Date(),
      approvedById: admin.id,
    },
  });

  // ============================================================
  // CITIES & COMMUNES
  // ============================================================

  console.log('Seeding cities and communes...');

  const cityId = (n: number) => `01000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const communeId = (n: number) => `02000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

  const cities = [
    { n: 1, fr: 'Lubumbashi', en: 'Lubumbashi', province: 'Haut-Katanga', isActive: true },
    { n: 2, fr: 'Kolwezi', en: 'Kolwezi', province: 'Lualaba', isActive: true },
    { n: 3, fr: 'Kinshasa', en: 'Kinshasa', province: 'Kinshasa', isActive: false },
    { n: 4, fr: 'Likasi', en: 'Likasi', province: 'Haut-Katanga', isActive: false },
    { n: 5, fr: 'Goma', en: 'Goma', province: 'Nord-Kivu', isActive: false },
    { n: 6, fr: 'Bukavu', en: 'Bukavu', province: 'Sud-Kivu', isActive: false },
    { n: 7, fr: 'Kisangani', en: 'Kisangani', province: 'Tshopo', isActive: false },
    { n: 8, fr: 'Mbuji-Mayi', en: 'Mbuji-Mayi', province: 'Kasaï-Oriental', isActive: false },
  ];

  for (const city of cities) {
    await prisma.city.upsert({
      where: { id: cityId(city.n) },
      update: { isActive: city.isActive },
      create: {
        id: cityId(city.n),
        name: { fr: city.fr, en: city.en } as any,
        province: city.province,
        isActive: city.isActive,
        sortOrder: city.n,
      },
    });
  }

  const LUBUMBASHI_CITY_ID = cityId(1);
  const KOLWEZI_CITY_ID = cityId(2);

  const communes = [
    // Lubumbashi communes
    { n: 1, cityN: 1, fr: 'Lubumbashi', en: 'Lubumbashi' },
    { n: 2, cityN: 1, fr: 'Kampemba', en: 'Kampemba' },
    { n: 3, cityN: 1, fr: 'Kenya', en: 'Kenya' },
    { n: 4, cityN: 1, fr: 'Katuba', en: 'Katuba' },
    { n: 5, cityN: 1, fr: 'Ruashi', en: 'Ruashi' },
    { n: 6, cityN: 1, fr: 'Annexe', en: 'Annexe' },
    // Kolwezi communes
    { n: 7, cityN: 2, fr: 'Dilala', en: 'Dilala' },
    { n: 8, cityN: 2, fr: 'Manika', en: 'Manika' },
  ];

  for (const commune of communes) {
    await prisma.commune.upsert({
      where: { id: communeId(commune.n) },
      update: {},
      create: {
        id: communeId(commune.n),
        cityId: cityId(commune.cityN),
        name: { fr: commune.fr, en: commune.en } as any,
        sortOrder: commune.n,
      },
    });
  }

  console.log(`Seeded ${cities.length} cities + ${communes.length} communes`);

  // Update seller profiles with cityId
  await prisma.sellerProfile.updateMany({
    where: { userId: seller1.id },
    data: { cityId: LUBUMBASHI_CITY_ID },
  });
  await prisma.sellerProfile.updateMany({
    where: { userId: seller2.id },
    data: { cityId: LUBUMBASHI_CITY_ID },
  });

  // ============================================================
  // ADDRESSES
  // ============================================================

  // Address for buyer
  await prisma.address.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      userId: buyer.id,
      label: 'Maison',
      province: 'Haut-Katanga',
      town: 'Lubumbashi',
      neighborhood: 'Kampemba',
      cityId: LUBUMBASHI_CITY_ID,
      communeId: communeId(2), // Kampemba
      avenue: 'Avenue Kasavubu, n\u00b042',
      reference: 'En face de la station Total',
      isDefault: true,
    },
  });

  // Address for seller 1
  await prisma.address.upsert({
    where: { id: '00000000-0000-0000-0000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      userId: seller1.id,
      label: 'Boutique',
      province: 'Haut-Katanga',
      town: 'Lubumbashi',
      neighborhood: 'Kenya',
      cityId: LUBUMBASHI_CITY_ID,
      communeId: communeId(3), // Kenya
      avenue: 'Avenue Mobutu, n\u00b015',
      reference: '\u00c0 c\u00f4t\u00e9 du march\u00e9 Kenya',
      isDefault: true,
    },
  });

  // Address for seller 2
  await prisma.address.upsert({
    where: { id: '00000000-0000-0000-0000-000000000003' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000003',
      userId: seller2.id,
      label: 'Magasin',
      province: 'Haut-Katanga',
      town: 'Lubumbashi',
      neighborhood: 'Lubumbashi',
      cityId: LUBUMBASHI_CITY_ID,
      communeId: communeId(1), // Lubumbashi
      avenue: 'Avenue Lumumba, n\u00b078',
      reference: 'En face de la Poste',
      isDefault: true,
    },
  });

  // ============================================================
  // CATEGORIES (15 main + subcategories)
  // ============================================================

  console.log('Seeding categories...');

  // Helper: create or update category by a deterministic ID
  // We use deterministic UUIDs so re-running the seed is idempotent
  const catId = (n: number) => `10000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

  const mainCategories = [
    { n: 1, emoji: '\ud83d\udcf1', fr: 'T\u00e9l\u00e9phonie', en: 'Phones & Tablets' },
    { n: 2, emoji: '\ud83d\udcbb', fr: 'Informatique', en: 'Computers' },
    { n: 3, emoji: '\u26a1', fr: '\u00c9lectronique', en: 'Electronics' },
    { n: 4, emoji: '\ud83d\udc57', fr: 'Mode Femme', en: "Women's Fashion" },
    { n: 5, emoji: '\ud83d\udc54', fr: 'Mode Homme', en: "Men's Fashion" },
    { n: 6, emoji: '\ud83c\udfe0', fr: 'Maison & D\u00e9coration', en: 'Home & Decor' },
    { n: 7, emoji: '\ud83d\udc84', fr: 'Beaut\u00e9 & Sant\u00e9', en: 'Beauty & Health' },
    { n: 8, emoji: '\ud83c\udf4e', fr: 'Alimentation', en: 'Food & Groceries' },
    { n: 9, emoji: '\u26bd', fr: 'Sports & Loisirs', en: 'Sports & Leisure' },
    { n: 10, emoji: '\ud83d\ude97', fr: 'Auto-Moto', en: 'Automotive' },
    { n: 11, emoji: '\ud83c\udfae', fr: 'Jeux & Divertissement', en: 'Games & Entertainment' },
    { n: 12, emoji: '\ud83d\udc76', fr: 'B\u00e9b\u00e9s & Enfants', en: 'Babies & Kids' },
    { n: 13, emoji: '\ud83d\udcda', fr: 'Livres & Papeterie', en: 'Books & Stationery' },
    { n: 14, emoji: '\ud83d\udd27', fr: 'Bricolage & Jardinage', en: 'DIY & Garden' },
    { n: 15, emoji: '\ud83d\udce6', fr: 'Autres', en: 'Others' },
  ];

  const createdMainCats: Record<number, string> = {};

  for (const cat of mainCategories) {
    const id = catId(cat.n);
    await prisma.category.upsert({
      where: { id },
      update: {},
      create: {
        id,
        name: { fr: cat.fr, en: cat.en } as any,
        emoji: cat.emoji,
        sortOrder: cat.n,
        isActive: true,
      },
    });
    createdMainCats[cat.n] = id;
  }

  // Subcategories: starting IDs at 100+
  const subcategories = [
    // 1. Telephonie
    { n: 101, parent: 1, fr: 'Smartphones', en: 'Smartphones' },
    { n: 102, parent: 1, fr: 'Tablettes', en: 'Tablets' },
    { n: 103, parent: 1, fr: 'Accessoires T\u00e9l\u00e9phone', en: 'Phone Accessories' },
    { n: 104, parent: 1, fr: 'T\u00e9l\u00e9phones Basiques', en: 'Feature Phones' },
    // 2. Informatique
    { n: 201, parent: 2, fr: 'Ordinateurs Portables', en: 'Laptops' },
    { n: 202, parent: 2, fr: 'Ordinateurs de Bureau', en: 'Desktop Computers' },
    { n: 203, parent: 2, fr: 'Accessoires Informatique', en: 'Computer Accessories' },
    { n: 204, parent: 2, fr: 'Imprimantes & Scanners', en: 'Printers & Scanners' },
    // 3. Electronique
    { n: 301, parent: 3, fr: 'T\u00e9l\u00e9viseurs', en: 'Televisions' },
    { n: 302, parent: 3, fr: 'Audio & Hi-Fi', en: 'Audio & Hi-Fi' },
    { n: 303, parent: 3, fr: '\u00c9lectrom\u00e9nager', en: 'Home Appliances' },
    // 4. Mode Femme
    { n: 401, parent: 4, fr: 'Robes & Jupes', en: 'Dresses & Skirts' },
    { n: 402, parent: 4, fr: 'Chaussures Femme', en: "Women's Shoes" },
    { n: 403, parent: 4, fr: 'Sacs \u00e0 Main', en: 'Handbags' },
    { n: 404, parent: 4, fr: 'Bijoux & Accessoires', en: 'Jewelry & Accessories' },
    // 5. Mode Homme
    { n: 501, parent: 5, fr: 'Chemises & T-shirts', en: 'Shirts & T-shirts' },
    { n: 502, parent: 5, fr: 'Pantalons & Jeans', en: 'Pants & Jeans' },
    { n: 503, parent: 5, fr: 'Chaussures Homme', en: "Men's Shoes" },
    // 6. Maison & Decoration
    { n: 601, parent: 6, fr: 'Meubles', en: 'Furniture' },
    { n: 602, parent: 6, fr: 'Literie', en: 'Bedding' },
    { n: 603, parent: 6, fr: 'Cuisine & Vaisselle', en: 'Kitchen & Dinnerware' },
    // 7. Beaute & Sante
    { n: 701, parent: 7, fr: 'Soins du Visage', en: 'Face Care' },
    { n: 702, parent: 7, fr: 'Soins Capillaires', en: 'Hair Care' },
    { n: 703, parent: 7, fr: 'Parfums', en: 'Perfumes' },
    // 8. Alimentation
    { n: 801, parent: 8, fr: 'Boissons', en: 'Beverages' },
    { n: 802, parent: 8, fr: '\u00c9picerie', en: 'Groceries' },
    { n: 803, parent: 8, fr: 'Snacks & Confiserie', en: 'Snacks & Confectionery' },
    // 9. Sports & Loisirs
    { n: 901, parent: 9, fr: 'V\u00eatements de Sport', en: 'Sportswear' },
    { n: 902, parent: 9, fr: '\u00c9quipements de Sport', en: 'Sports Equipment' },
    { n: 903, parent: 9, fr: 'Chaussures de Sport', en: 'Sports Shoes' },
    // 10. Auto-Moto
    { n: 1001, parent: 10, fr: 'Pi\u00e8ces Auto', en: 'Car Parts' },
    { n: 1002, parent: 10, fr: 'Accessoires Auto', en: 'Car Accessories' },
    { n: 1003, parent: 10, fr: 'Motos & V\u00e9los', en: 'Motorcycles & Bicycles' },
    // 11. Jeux & Divertissement
    { n: 1101, parent: 11, fr: 'Consoles & Jeux Vid\u00e9o', en: 'Consoles & Video Games' },
    { n: 1102, parent: 11, fr: 'Jouets', en: 'Toys' },
    // 12. Bebes & Enfants
    { n: 1201, parent: 12, fr: 'V\u00eatements Enfants', en: "Children's Clothing" },
    { n: 1202, parent: 12, fr: 'Pu\u00e9riculture', en: 'Baby Care' },
    { n: 1203, parent: 12, fr: 'Jouets Enfants', en: "Children's Toys" },
    // 13. Livres & Papeterie
    { n: 1301, parent: 13, fr: 'Livres', en: 'Books' },
    { n: 1302, parent: 13, fr: 'Fournitures Scolaires', en: 'School Supplies' },
    { n: 1303, parent: 13, fr: 'Fournitures de Bureau', en: 'Office Supplies' },
    // 14. Bricolage & Jardinage
    { n: 1401, parent: 14, fr: 'Outils', en: 'Tools' },
    { n: 1402, parent: 14, fr: 'Peinture & D\u00e9co', en: 'Paint & Decor' },
    { n: 1403, parent: 14, fr: 'Jardinage', en: 'Gardening' },
    // 15. Autres
    { n: 1501, parent: 15, fr: 'Divers', en: 'Miscellaneous' },
    { n: 1502, parent: 15, fr: 'Services', en: 'Services' },
  ];

  const createdSubCats: Record<number, string> = {};

  for (const sub of subcategories) {
    const id = catId(sub.n);
    const parentId = createdMainCats[sub.parent];
    await prisma.category.upsert({
      where: { id },
      update: {},
      create: {
        id,
        name: { fr: sub.fr, en: sub.en } as any,
        parentCategoryId: parentId,
        sortOrder: sub.n % 100,
        isActive: true,
      },
    });
    createdSubCats[sub.n] = id;
  }

  console.log(`Seeded ${mainCategories.length} main categories + ${subcategories.length} subcategories`);

  // ============================================================
  // PRODUCT ATTRIBUTES (per category)
  // ============================================================

  console.log('Seeding product attributes...');

  const attrId = (n: number) => `20000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

  interface AttrDef {
    n: number;
    categoryId: string;
    fr: string;
    en: string;
    type: AttributeType;
    options?: string[];
    isRequired?: boolean;
  }

  const attributes: AttrDef[] = [
    // Telephonie (main cat 1)
    { n: 1, categoryId: createdMainCats[1], fr: 'Marque', en: 'Brand', type: AttributeType.SELECT, options: ['Samsung', 'Apple', 'Tecno', 'Infinix', 'Xiaomi', 'Huawei', 'Nokia', 'Oppo'], isRequired: true },
    { n: 2, categoryId: createdMainCats[1], fr: 'M\u00e9moire', en: 'Storage', type: AttributeType.SELECT, options: ['32Go', '64Go', '128Go', '256Go', '512Go'] },
    { n: 3, categoryId: createdMainCats[1], fr: 'Couleur', en: 'Color', type: AttributeType.TEXT },
    { n: 4, categoryId: createdMainCats[1], fr: 'RAM', en: 'RAM', type: AttributeType.SELECT, options: ['2Go', '3Go', '4Go', '6Go', '8Go', '12Go'] },
    // Informatique (main cat 2)
    { n: 10, categoryId: createdMainCats[2], fr: 'Marque', en: 'Brand', type: AttributeType.SELECT, options: ['HP', 'Dell', 'Lenovo', 'Apple', 'Asus', 'Acer', 'MSI'], isRequired: true },
    { n: 11, categoryId: createdMainCats[2], fr: 'RAM', en: 'RAM', type: AttributeType.SELECT, options: ['4Go', '8Go', '16Go', '32Go'] },
    { n: 12, categoryId: createdMainCats[2], fr: 'Stockage', en: 'Storage', type: AttributeType.SELECT, options: ['128Go', '256Go', '512Go', '1To'] },
    { n: 13, categoryId: createdMainCats[2], fr: 'Processeur', en: 'Processor', type: AttributeType.TEXT },
    // Mode Femme (main cat 4)
    { n: 20, categoryId: createdMainCats[4], fr: 'Taille', en: 'Size', type: AttributeType.SELECT, options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
    { n: 21, categoryId: createdMainCats[4], fr: 'Couleur', en: 'Color', type: AttributeType.TEXT },
    { n: 22, categoryId: createdMainCats[4], fr: 'Mati\u00e8re', en: 'Material', type: AttributeType.TEXT },
    // Mode Homme (main cat 5)
    { n: 30, categoryId: createdMainCats[5], fr: 'Taille', en: 'Size', type: AttributeType.SELECT, options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
    { n: 31, categoryId: createdMainCats[5], fr: 'Couleur', en: 'Color', type: AttributeType.TEXT },
    { n: 32, categoryId: createdMainCats[5], fr: 'Mati\u00e8re', en: 'Material', type: AttributeType.TEXT },
    // Electronique (main cat 3)
    { n: 40, categoryId: createdMainCats[3], fr: 'Marque', en: 'Brand', type: AttributeType.TEXT },
    { n: 41, categoryId: createdMainCats[3], fr: 'Puissance', en: 'Power', type: AttributeType.TEXT },
  ];

  const createdAttrs: Record<number, string> = {};

  for (const attr of attributes) {
    const id = attrId(attr.n);
    await prisma.productAttribute.upsert({
      where: { id },
      update: {},
      create: {
        id,
        categoryId: attr.categoryId,
        name: { fr: attr.fr, en: attr.en } as any,
        type: attr.type,
        options: attr.options ? (attr.options as any) : undefined,
        isRequired: attr.isRequired ?? false,
        sortOrder: attr.n,
      },
    });
    createdAttrs[attr.n] = id;
  }

  console.log(`Seeded ${attributes.length} product attributes`);

  // ============================================================
  // NEW 8 MAIN CATEGORIES (deactivate old ones, create new)
  // ============================================================

  console.log('Seeding new category structure...');

  // Soft-deactivate old 15 main categories (products keep their FK, just won't appear in active browse)
  for (const cat of mainCategories) {
    await prisma.category.update({
      where: { id: catId(cat.n) },
      data: { isActive: false },
    }).catch(() => {}); // Skip if not found
  }
  for (const sub of subcategories) {
    await prisma.category.update({
      where: { id: catId(sub.n) },
      data: { isActive: false },
    }).catch(() => {}); // Skip if not found
  }

  // New category ID range: 11000000-...
  const newCatId = (n: number) => `11000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const newAttrId = (n: number) => `12000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

  const newMainCategories = [
    { n: 1, emoji: '🍎', fr: 'Alimentation & Épicerie', en: 'Food & Groceries' },
    { n: 2, emoji: '📱', fr: 'Téléphones & Électronique', en: 'Phones & Electronics' },
    { n: 3, emoji: '👗', fr: 'Mode & Habillement', en: 'Fashion & Apparel' },
    { n: 4, emoji: '🏠', fr: 'Maison & Intérieur', en: 'Home & Living' },
    { n: 5, emoji: '🚗', fr: 'Auto & Moto', en: 'Auto & Moto' },
    { n: 6, emoji: '💊', fr: 'Santé & Beauté', en: 'Health & Beauty' },
    { n: 7, emoji: '🔨', fr: 'Construction & Outillage', en: 'Construction & Tools' },
    { n: 8, emoji: '👶', fr: 'Bébé & Enfants', en: 'Baby & Kids' },
  ];

  const newCreatedMainCats: Record<number, string> = {};
  for (const cat of newMainCategories) {
    const id = newCatId(cat.n);
    await prisma.category.upsert({
      where: { id },
      update: { isActive: true },
      create: {
        id,
        name: { fr: cat.fr, en: cat.en } as any,
        emoji: cat.emoji,
        sortOrder: cat.n,
        isActive: true,
      },
    });
    newCreatedMainCats[cat.n] = id;
  }

  // New subcategories
  const newSubcategories = [
    // 1. Food & Groceries
    { n: 101, parent: 1, fr: 'Boissons', en: 'Beverages' },
    { n: 102, parent: 1, fr: 'Épicerie & Condiments', en: 'Groceries & Condiments' },
    { n: 103, parent: 1, fr: 'Fruits & Légumes', en: 'Fruits & Vegetables' },
    { n: 104, parent: 1, fr: 'Snacks & Confiserie', en: 'Snacks & Confectionery' },
    { n: 105, parent: 1, fr: 'Produits Laitiers', en: 'Dairy Products' },
    // 2. Phones & Electronics
    { n: 201, parent: 2, fr: 'Smartphones', en: 'Smartphones' },
    { n: 202, parent: 2, fr: 'Tablettes', en: 'Tablets' },
    { n: 203, parent: 2, fr: 'Accessoires Téléphone', en: 'Phone Accessories' },
    { n: 204, parent: 2, fr: 'Ordinateurs Portables', en: 'Laptops' },
    { n: 205, parent: 2, fr: 'Ordinateurs de Bureau', en: 'Desktop Computers' },
    { n: 206, parent: 2, fr: 'Accessoires Informatique', en: 'Computer Accessories' },
    { n: 207, parent: 2, fr: 'Téléviseurs & Écrans', en: 'TVs & Monitors' },
    { n: 208, parent: 2, fr: 'Audio & Hi-Fi', en: 'Audio & Hi-Fi' },
    { n: 209, parent: 2, fr: 'Électroménager', en: 'Home Appliances' },
    { n: 210, parent: 2, fr: 'Consoles & Jeux Vidéo', en: 'Consoles & Video Games' },
    // 3. Fashion & Apparel
    { n: 301, parent: 3, fr: 'Vêtements Femme', en: "Women's Clothing" },
    { n: 302, parent: 3, fr: 'Vêtements Homme', en: "Men's Clothing" },
    { n: 303, parent: 3, fr: 'Chaussures Femme', en: "Women's Shoes" },
    { n: 304, parent: 3, fr: 'Chaussures Homme', en: "Men's Shoes" },
    { n: 305, parent: 3, fr: 'Sacs & Accessoires', en: 'Bags & Accessories' },
    { n: 306, parent: 3, fr: 'Bijoux & Montres', en: 'Jewelry & Watches' },
    { n: 307, parent: 3, fr: 'Tissus & Pagnes', en: 'Fabrics & Wax Prints' },
    // 4. Home & Living
    { n: 401, parent: 4, fr: 'Meubles', en: 'Furniture' },
    { n: 402, parent: 4, fr: 'Literie & Linge de Maison', en: 'Bedding & Home Linen' },
    { n: 403, parent: 4, fr: 'Cuisine & Vaisselle', en: 'Kitchen & Dinnerware' },
    { n: 404, parent: 4, fr: 'Décoration', en: 'Decoration' },
    { n: 405, parent: 4, fr: 'Éclairage', en: 'Lighting' },
    // 5. Auto & Moto
    { n: 501, parent: 5, fr: 'Pièces Auto', en: 'Car Parts' },
    { n: 502, parent: 5, fr: 'Accessoires Auto', en: 'Car Accessories' },
    { n: 503, parent: 5, fr: 'Motos & Vélos', en: 'Motorcycles & Bicycles' },
    { n: 504, parent: 5, fr: 'Pneus & Jantes', en: 'Tires & Rims' },
    { n: 505, parent: 5, fr: 'Huiles & Lubrifiants', en: 'Oils & Lubricants' },
    // 6. Health & Beauty
    { n: 601, parent: 6, fr: 'Soins du Visage', en: 'Face Care' },
    { n: 602, parent: 6, fr: 'Soins Capillaires', en: 'Hair Care' },
    { n: 603, parent: 6, fr: 'Parfums & Déodorants', en: 'Perfumes & Deodorants' },
    { n: 604, parent: 6, fr: 'Maquillage', en: 'Makeup' },
    { n: 605, parent: 6, fr: 'Hygiène & Santé', en: 'Hygiene & Health' },
    // 7. Construction & Tools
    { n: 701, parent: 7, fr: 'Outils à Main', en: 'Hand Tools' },
    { n: 702, parent: 7, fr: 'Outils Électriques', en: 'Power Tools' },
    { n: 703, parent: 7, fr: 'Matériaux de Construction', en: 'Building Materials' },
    { n: 704, parent: 7, fr: 'Peinture & Finitions', en: 'Paint & Finishes' },
    { n: 705, parent: 7, fr: 'Plomberie & Électricité', en: 'Plumbing & Electrical' },
    // 8. Baby & Kids
    { n: 801, parent: 8, fr: 'Vêtements Bébé', en: 'Baby Clothing' },
    { n: 802, parent: 8, fr: 'Vêtements Enfants', en: "Children's Clothing" },
    { n: 803, parent: 8, fr: 'Puériculture', en: 'Baby Care' },
    { n: 804, parent: 8, fr: 'Jouets & Jeux', en: 'Toys & Games' },
    { n: 805, parent: 8, fr: 'Fournitures Scolaires', en: 'School Supplies' },
  ];

  const newCreatedSubCats: Record<number, string> = {};
  for (const sub of newSubcategories) {
    const id = newCatId(sub.n);
    const parentId = newCreatedMainCats[sub.parent];
    await prisma.category.upsert({
      where: { id },
      update: { isActive: true },
      create: {
        id,
        name: { fr: sub.fr, en: sub.en } as any,
        parentCategoryId: parentId,
        sortOrder: sub.n % 100,
        isActive: true,
      },
    });
    newCreatedSubCats[sub.n] = id;
  }

  console.log(`Seeded ${newMainCategories.length} new main categories + ${newSubcategories.length} subcategories`);

  // ============================================================
  // NEW PRODUCT ATTRIBUTES (rich libraries per subcategory)
  // ============================================================

  console.log('Seeding new product attributes with rich options...');

  interface NewAttrDef {
    n: number;
    categoryId: string;
    fr: string;
    en: string;
    type: AttributeType;
    options?: string[];
    isRequired?: boolean;
  }

  const newAttributes: NewAttrDef[] = [
    // === Phones & Electronics ===
    // Smartphones (201)
    { n: 1, categoryId: newCreatedSubCats[201], fr: 'Marque', en: 'Brand', type: AttributeType.SELECT, options: ['Samsung', 'Apple', 'Tecno', 'Infinix', 'Xiaomi', 'Huawei', 'Nokia', 'Oppo', 'Realme', 'Vivo', 'OnePlus', 'Google', 'Motorola', 'Itel'], isRequired: true },
    { n: 2, categoryId: newCreatedSubCats[201], fr: 'Mémoire interne', en: 'Internal Storage', type: AttributeType.SELECT, options: ['16Go', '32Go', '64Go', '128Go', '256Go', '512Go', '1To'], isRequired: true },
    { n: 3, categoryId: newCreatedSubCats[201], fr: 'RAM', en: 'RAM', type: AttributeType.SELECT, options: ['1Go', '2Go', '3Go', '4Go', '6Go', '8Go', '12Go', '16Go'] },
    { n: 4, categoryId: newCreatedSubCats[201], fr: 'Couleur', en: 'Color', type: AttributeType.TEXT },
    { n: 5, categoryId: newCreatedSubCats[201], fr: 'Taille écran', en: 'Screen Size', type: AttributeType.SELECT, options: ['5.0"', '5.5"', '6.0"', '6.1"', '6.4"', '6.5"', '6.6"', '6.7"', '6.8"'] },

    // Tablets (202)
    { n: 10, categoryId: newCreatedSubCats[202], fr: 'Marque', en: 'Brand', type: AttributeType.SELECT, options: ['Samsung', 'Apple', 'Huawei', 'Lenovo', 'Xiaomi', 'Amazon'], isRequired: true },
    { n: 11, categoryId: newCreatedSubCats[202], fr: 'Mémoire interne', en: 'Internal Storage', type: AttributeType.SELECT, options: ['32Go', '64Go', '128Go', '256Go', '512Go'] },
    { n: 12, categoryId: newCreatedSubCats[202], fr: 'Taille écran', en: 'Screen Size', type: AttributeType.SELECT, options: ['7"', '8"', '10.1"', '10.9"', '11"', '12.4"', '12.9"'] },

    // Laptops (204)
    { n: 20, categoryId: newCreatedSubCats[204], fr: 'Marque', en: 'Brand', type: AttributeType.SELECT, options: ['HP', 'Dell', 'Lenovo', 'Apple', 'Asus', 'Acer', 'MSI', 'Toshiba', 'Microsoft'], isRequired: true },
    { n: 21, categoryId: newCreatedSubCats[204], fr: 'Processeur', en: 'Processor', type: AttributeType.SELECT, options: ['Intel Core i3', 'Intel Core i5', 'Intel Core i7', 'Intel Core i9', 'AMD Ryzen 3', 'AMD Ryzen 5', 'AMD Ryzen 7', 'Apple M1', 'Apple M2', 'Apple M3'] },
    { n: 22, categoryId: newCreatedSubCats[204], fr: 'RAM', en: 'RAM', type: AttributeType.SELECT, options: ['4Go', '8Go', '16Go', '32Go', '64Go'], isRequired: true },
    { n: 23, categoryId: newCreatedSubCats[204], fr: 'Stockage', en: 'Storage', type: AttributeType.SELECT, options: ['128Go SSD', '256Go SSD', '512Go SSD', '1To SSD', '1To HDD', '2To HDD'] },
    { n: 24, categoryId: newCreatedSubCats[204], fr: 'Taille écran', en: 'Screen Size', type: AttributeType.SELECT, options: ['13.3"', '14"', '15.6"', '16"', '17.3"'] },

    // TVs & Monitors (207)
    { n: 30, categoryId: newCreatedSubCats[207], fr: 'Marque', en: 'Brand', type: AttributeType.SELECT, options: ['Samsung', 'LG', 'Sony', 'TCL', 'Hisense', 'Philips', 'Skyworth'], isRequired: true },
    { n: 31, categoryId: newCreatedSubCats[207], fr: 'Taille écran', en: 'Screen Size', type: AttributeType.SELECT, options: ['24"', '32"', '40"', '43"', '50"', '55"', '65"', '75"'] },
    { n: 32, categoryId: newCreatedSubCats[207], fr: 'Résolution', en: 'Resolution', type: AttributeType.SELECT, options: ['HD (720p)', 'Full HD (1080p)', '4K UHD', '8K'] },
    { n: 33, categoryId: newCreatedSubCats[207], fr: 'Smart TV', en: 'Smart TV', type: AttributeType.SELECT, options: ['Oui', 'Non'] },

    // === Fashion & Apparel ===
    // Women's Clothing (301)
    { n: 40, categoryId: newCreatedSubCats[301], fr: 'Taille', en: 'Size', type: AttributeType.SELECT, options: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'], isRequired: true },
    { n: 41, categoryId: newCreatedSubCats[301], fr: 'Couleur', en: 'Color', type: AttributeType.TEXT },
    { n: 42, categoryId: newCreatedSubCats[301], fr: 'Matière', en: 'Material', type: AttributeType.SELECT, options: ['Coton', 'Polyester', 'Soie', 'Lin', 'Wax', 'Dentelle', 'Jean', 'Cuir', 'Laine'] },

    // Men's Clothing (302)
    { n: 45, categoryId: newCreatedSubCats[302], fr: 'Taille', en: 'Size', type: AttributeType.SELECT, options: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'], isRequired: true },
    { n: 46, categoryId: newCreatedSubCats[302], fr: 'Couleur', en: 'Color', type: AttributeType.TEXT },
    { n: 47, categoryId: newCreatedSubCats[302], fr: 'Matière', en: 'Material', type: AttributeType.SELECT, options: ['Coton', 'Polyester', 'Lin', 'Jean', 'Cuir', 'Laine', 'Soie'] },

    // Women's Shoes (303)
    { n: 50, categoryId: newCreatedSubCats[303], fr: 'Pointure', en: 'Size', type: AttributeType.SELECT, options: ['35', '36', '37', '38', '39', '40', '41', '42'], isRequired: true },
    { n: 51, categoryId: newCreatedSubCats[303], fr: 'Couleur', en: 'Color', type: AttributeType.TEXT },
    { n: 52, categoryId: newCreatedSubCats[303], fr: 'Matière', en: 'Material', type: AttributeType.SELECT, options: ['Cuir', 'Cuir synthétique', 'Tissu', 'Toile', 'Caoutchouc'] },
    { n: 53, categoryId: newCreatedSubCats[303], fr: 'Marque', en: 'Brand', type: AttributeType.TEXT },

    // Men's Shoes (304)
    { n: 55, categoryId: newCreatedSubCats[304], fr: 'Pointure', en: 'Size', type: AttributeType.SELECT, options: ['39', '40', '41', '42', '43', '44', '45', '46', '47'], isRequired: true },
    { n: 56, categoryId: newCreatedSubCats[304], fr: 'Couleur', en: 'Color', type: AttributeType.TEXT },
    { n: 57, categoryId: newCreatedSubCats[304], fr: 'Matière', en: 'Material', type: AttributeType.SELECT, options: ['Cuir', 'Cuir synthétique', 'Tissu', 'Toile', 'Caoutchouc'] },
    { n: 58, categoryId: newCreatedSubCats[304], fr: 'Marque', en: 'Brand', type: AttributeType.TEXT },

    // Fabrics & Wax (307)
    { n: 60, categoryId: newCreatedSubCats[307], fr: 'Type de tissu', en: 'Fabric Type', type: AttributeType.SELECT, options: ['Wax Hollandais', 'Wax Africain', 'Super Wax', 'Bazin', 'Soie', 'Dentelle', 'Satin', 'Kanga', 'Kitenge'] },
    { n: 61, categoryId: newCreatedSubCats[307], fr: 'Longueur (yards)', en: 'Length (yards)', type: AttributeType.SELECT, options: ['3 yards', '6 yards', '12 yards'] },
    { n: 62, categoryId: newCreatedSubCats[307], fr: 'Marque', en: 'Brand', type: AttributeType.SELECT, options: ['Vlisco', 'Julius Holland', 'GTP', 'Woodin', 'Hitarget', 'ABC Wax', 'Autre'] },

    // === Auto & Moto ===
    // Car Parts (501)
    { n: 70, categoryId: newCreatedSubCats[501], fr: 'Marque véhicule', en: 'Vehicle Brand', type: AttributeType.SELECT, options: ['Toyota', 'Mitsubishi', 'Nissan', 'Mercedes-Benz', 'BMW', 'Honda', 'Hyundai', 'Land Rover', 'Ford', 'Suzuki', 'Volkswagen', 'Peugeot', 'Renault'], isRequired: true },
    { n: 71, categoryId: newCreatedSubCats[501], fr: 'Type de pièce', en: 'Part Type', type: AttributeType.SELECT, options: ['Moteur', 'Freins', 'Suspension', 'Transmission', 'Électrique', 'Carrosserie', 'Échappement', 'Direction', 'Filtre', 'Courroie'] },
    { n: 72, categoryId: newCreatedSubCats[501], fr: 'État', en: 'Condition', type: AttributeType.SELECT, options: ['Neuf', 'Occasion - Bon état', 'Occasion - État moyen', 'Reconditionné'] },

    // Motorcycles & Bicycles (503)
    { n: 75, categoryId: newCreatedSubCats[503], fr: 'Type', en: 'Type', type: AttributeType.SELECT, options: ['Moto', 'Scooter', 'Vélo', 'Vélo électrique', 'Tricycle'] },
    { n: 76, categoryId: newCreatedSubCats[503], fr: 'Marque', en: 'Brand', type: AttributeType.SELECT, options: ['TVS', 'Haojue', 'Boxer', 'Honda', 'Yamaha', 'Suzuki', 'Hero', 'Bajaj', 'Autre'] },
    { n: 77, categoryId: newCreatedSubCats[503], fr: 'Cylindrée', en: 'Engine Size', type: AttributeType.SELECT, options: ['50cc', '100cc', '125cc', '150cc', '200cc', '250cc', '400cc+'] },

    // === Health & Beauty ===
    // Face Care (601)
    { n: 80, categoryId: newCreatedSubCats[601], fr: 'Type de produit', en: 'Product Type', type: AttributeType.SELECT, options: ['Crème hydratante', 'Nettoyant', 'Sérum', 'Masque', 'Tonique', 'Exfoliant', 'Huile', 'Écran solaire'] },
    { n: 81, categoryId: newCreatedSubCats[601], fr: 'Type de peau', en: 'Skin Type', type: AttributeType.SELECT, options: ['Tous types', 'Peau grasse', 'Peau sèche', 'Peau mixte', 'Peau sensible'] },
    { n: 82, categoryId: newCreatedSubCats[601], fr: 'Marque', en: 'Brand', type: AttributeType.TEXT },

    // Perfumes (603)
    { n: 85, categoryId: newCreatedSubCats[603], fr: 'Genre', en: 'Gender', type: AttributeType.SELECT, options: ['Homme', 'Femme', 'Unisexe'] },
    { n: 86, categoryId: newCreatedSubCats[603], fr: 'Volume', en: 'Volume', type: AttributeType.SELECT, options: ['30ml', '50ml', '75ml', '100ml', '125ml', '200ml'] },
    { n: 87, categoryId: newCreatedSubCats[603], fr: 'Marque', en: 'Brand', type: AttributeType.TEXT },

    // === Construction & Tools ===
    // Hand Tools (701)
    { n: 90, categoryId: newCreatedSubCats[701], fr: 'Type d\'outil', en: 'Tool Type', type: AttributeType.SELECT, options: ['Marteau', 'Tournevis', 'Pince', 'Clé', 'Scie', 'Mètre', 'Niveau', 'Cutter', 'Autre'] },
    { n: 91, categoryId: newCreatedSubCats[701], fr: 'Marque', en: 'Brand', type: AttributeType.TEXT },

    // Power Tools (702)
    { n: 95, categoryId: newCreatedSubCats[702], fr: 'Type', en: 'Type', type: AttributeType.SELECT, options: ['Perceuse', 'Meuleuse', 'Scie circulaire', 'Scie sauteuse', 'Ponceuse', 'Compresseur', 'Groupe électrogène', 'Soudeur'] },
    { n: 96, categoryId: newCreatedSubCats[702], fr: 'Alimentation', en: 'Power Source', type: AttributeType.SELECT, options: ['Filaire 220V', 'Batterie', 'Essence', 'Diesel'] },
    { n: 97, categoryId: newCreatedSubCats[702], fr: 'Marque', en: 'Brand', type: AttributeType.SELECT, options: ['Bosch', 'Makita', 'DeWalt', 'Black & Decker', 'Stanley', 'Einhell', 'Autre'] },

    // === Baby & Kids ===
    // Baby Clothing (801)
    { n: 100, categoryId: newCreatedSubCats[801], fr: 'Âge', en: 'Age', type: AttributeType.SELECT, options: ['0-3 mois', '3-6 mois', '6-12 mois', '12-18 mois', '18-24 mois', '2-3 ans'], isRequired: true },
    { n: 101, categoryId: newCreatedSubCats[801], fr: 'Genre', en: 'Gender', type: AttributeType.SELECT, options: ['Garçon', 'Fille', 'Unisexe'] },
    { n: 102, categoryId: newCreatedSubCats[801], fr: 'Couleur', en: 'Color', type: AttributeType.TEXT },

    // Children's Clothing (802)
    { n: 105, categoryId: newCreatedSubCats[802], fr: 'Âge', en: 'Age', type: AttributeType.SELECT, options: ['2-3 ans', '3-4 ans', '4-5 ans', '5-6 ans', '6-8 ans', '8-10 ans', '10-12 ans', '12-14 ans'], isRequired: true },
    { n: 106, categoryId: newCreatedSubCats[802], fr: 'Genre', en: 'Gender', type: AttributeType.SELECT, options: ['Garçon', 'Fille', 'Unisexe'] },
    { n: 107, categoryId: newCreatedSubCats[802], fr: 'Couleur', en: 'Color', type: AttributeType.TEXT },

    // Home & Living — Kitchen (403)
    { n: 110, categoryId: newCreatedSubCats[403], fr: 'Matière', en: 'Material', type: AttributeType.SELECT, options: ['Inox', 'Aluminium', 'Fonte', 'Céramique', 'Plastique', 'Bois', 'Verre'] },
    { n: 111, categoryId: newCreatedSubCats[403], fr: 'Marque', en: 'Brand', type: AttributeType.TEXT },

    // Home & Living — Furniture (401)
    { n: 115, categoryId: newCreatedSubCats[401], fr: 'Type', en: 'Type', type: AttributeType.SELECT, options: ['Canapé', 'Table', 'Chaise', 'Armoire', 'Lit', 'Bureau', 'Étagère', 'Commode', 'Table basse'] },
    { n: 116, categoryId: newCreatedSubCats[401], fr: 'Matière', en: 'Material', type: AttributeType.SELECT, options: ['Bois massif', 'MDF', 'Métal', 'Plastique', 'Rotin', 'Cuir', 'Tissu'] },

    // Phone Accessories (203)
    { n: 120, categoryId: newCreatedSubCats[203], fr: 'Type', en: 'Type', type: AttributeType.SELECT, options: ['Coque', 'Chargeur', 'Câble', 'Écouteurs', 'Power Bank', 'Verre trempé', 'Support', 'Autre'] },
    { n: 121, categoryId: newCreatedSubCats[203], fr: 'Compatible avec', en: 'Compatible With', type: AttributeType.TEXT },

    // Audio & Hi-Fi (208)
    { n: 125, categoryId: newCreatedSubCats[208], fr: 'Type', en: 'Type', type: AttributeType.SELECT, options: ['Enceinte Bluetooth', 'Casque', 'Écouteurs', 'Barre de son', 'Système Hi-Fi', 'Microphone'] },
    { n: 126, categoryId: newCreatedSubCats[208], fr: 'Marque', en: 'Brand', type: AttributeType.SELECT, options: ['JBL', 'Sony', 'Samsung', 'Bose', 'Apple', 'Huawei', 'Anker', 'Autre'] },

    // Bags & Accessories (305)
    { n: 130, categoryId: newCreatedSubCats[305], fr: 'Type', en: 'Type', type: AttributeType.SELECT, options: ['Sac à main', 'Sac à dos', 'Sacoche', 'Pochette', 'Valise', 'Ceinture', 'Portefeuille'] },
    { n: 131, categoryId: newCreatedSubCats[305], fr: 'Matière', en: 'Material', type: AttributeType.SELECT, options: ['Cuir', 'Cuir synthétique', 'Tissu', 'Toile', 'Nylon'] },
    { n: 132, categoryId: newCreatedSubCats[305], fr: 'Couleur', en: 'Color', type: AttributeType.TEXT },

    // Food — Beverages (101)
    { n: 140, categoryId: newCreatedSubCats[101], fr: 'Type', en: 'Type', type: AttributeType.SELECT, options: ['Eau', 'Jus', 'Soda', 'Bière', 'Vin', 'Spiritueux', 'Thé', 'Café'] },
    { n: 141, categoryId: newCreatedSubCats[101], fr: 'Volume', en: 'Volume', type: AttributeType.TEXT },

    // Toys & Games (804)
    { n: 145, categoryId: newCreatedSubCats[804], fr: 'Âge recommandé', en: 'Recommended Age', type: AttributeType.SELECT, options: ['0-2 ans', '3-5 ans', '6-8 ans', '9-12 ans', '12+ ans'] },
    { n: 146, categoryId: newCreatedSubCats[804], fr: 'Type', en: 'Type', type: AttributeType.SELECT, options: ['Jouet éducatif', 'Poupée', 'Voiture', 'Puzzle', 'Jeu de société', 'Peluche', 'Lego', 'Autre'] },
  ];

  for (const attr of newAttributes) {
    const id = newAttrId(attr.n);
    await prisma.productAttribute.upsert({
      where: { id },
      update: {},
      create: {
        id,
        categoryId: attr.categoryId,
        name: { fr: attr.fr, en: attr.en } as any,
        type: attr.type,
        options: attr.options ? (attr.options as any) : undefined,
        isRequired: attr.isRequired ?? false,
        sortOrder: attr.n,
      },
    });
  }

  console.log(`Seeded ${newAttributes.length} new product attributes with rich option libraries`);

  // ============================================================
  // PRODUCTS (20+)
  // ============================================================

  console.log('Seeding products...');

  const prodId = (n: number) => `30000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const imgId = (n: number) => `40000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const specId = (n: number) => `50000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

  // Cloudinary placeholder base URLs
  const cloudImg = (name: string) => `https://res.cloudinary.com/demo/image/upload/${name}.jpg`;
  const cloudThumb = (name: string) => `https://res.cloudinary.com/demo/image/upload/w_300,h_300,c_fill/${name}.jpg`;

  interface ProductDef {
    n: number;
    titleFr: string;
    titleEn: string;
    descFr: string;
    descEn: string;
    categoryN: number; // subcategory number (or main if no sub)
    sellerId: string;
    priceCDF: bigint;
    priceUSD?: bigint;
    quantity: number;
    condition: ProductCondition;
    status: ProductStatus;
    rejectionReason?: string;
    images: { n: number; name: string }[];
    specs?: { n: number; attrN: number; value: string }[];
  }

  const products: ProductDef[] = [
    // --- ACTIVE products (12) ---
    {
      n: 1,
      titleFr: 'Samsung Galaxy A14 - 64Go',
      titleEn: 'Samsung Galaxy A14 - 64GB',
      descFr: 'Smartphone Samsung Galaxy A14 avec 4Go de RAM et 64Go de stockage. \u00c9cran 6.6 pouces, batterie 5000mAh. Id\u00e9al pour une utilisation quotidienne.',
      descEn: 'Samsung Galaxy A14 smartphone with 4GB RAM and 64GB storage. 6.6 inch screen, 5000mAh battery. Ideal for daily use.',
      categoryN: 101,
      sellerId: seller2.id,
      priceCDF: BigInt(35000000), // 350,000 CDF (centimes)
      priceUSD: BigInt(12500),    // $125.00
      quantity: 15,
      condition: ProductCondition.NEW,
      status: ProductStatus.ACTIVE,
      images: [
        { n: 1, name: 'sample' },
        { n: 2, name: 'cld-sample' },
        { n: 3, name: 'cld-sample-2' },
      ],
      specs: [
        { n: 1, attrN: 1, value: 'Samsung' },
        { n: 2, attrN: 2, value: '64Go' },
        { n: 3, attrN: 3, value: 'Noir' },
        { n: 4, attrN: 4, value: '4Go' },
      ],
    },
    {
      n: 2,
      titleFr: 'Tecno Spark 10 Pro - 128Go',
      titleEn: 'Tecno Spark 10 Pro - 128GB',
      descFr: 'Tecno Spark 10 Pro avec cam\u00e9ra 50MP, 8Go de RAM et 128Go de stockage. Design \u00e9l\u00e9gant et performant.',
      descEn: 'Tecno Spark 10 Pro with 50MP camera, 8GB RAM and 128GB storage. Elegant and performant design.',
      categoryN: 101,
      sellerId: seller2.id,
      priceCDF: BigInt(42000000), // 420,000 CDF
      priceUSD: BigInt(15000),    // $150.00
      quantity: 8,
      condition: ProductCondition.NEW,
      status: ProductStatus.ACTIVE,
      images: [
        { n: 5, name: 'cld-sample-3' },
        { n: 6, name: 'cld-sample-4' },
      ],
      specs: [
        { n: 5, attrN: 1, value: 'Tecno' },
        { n: 6, attrN: 2, value: '128Go' },
        { n: 7, attrN: 3, value: 'Bleu' },
        { n: 8, attrN: 4, value: '8Go' },
      ],
    },
    {
      n: 3,
      titleFr: 'Ordinateur Portable HP 250 G9 - Core i5',
      titleEn: 'HP 250 G9 Laptop - Core i5',
      descFr: 'HP 250 G9 avec processeur Intel Core i5, 8Go RAM, SSD 256Go. Parfait pour le travail et les \u00e9tudes.',
      descEn: 'HP 250 G9 with Intel Core i5 processor, 8GB RAM, 256GB SSD. Perfect for work and studies.',
      categoryN: 201,
      sellerId: seller2.id,
      priceCDF: BigInt(150000000), // 1,500,000 CDF
      priceUSD: BigInt(55000),     // $550.00
      quantity: 5,
      condition: ProductCondition.NEW,
      status: ProductStatus.ACTIVE,
      images: [
        { n: 7, name: 'cld-sample-5' },
        { n: 8, name: 'sample' },
      ],
      specs: [
        { n: 9, attrN: 10, value: 'HP' },
        { n: 10, attrN: 11, value: '8Go' },
        { n: 11, attrN: 12, value: '256Go' },
        { n: 12, attrN: 13, value: 'Intel Core i5-1235U' },
      ],
    },
    {
      n: 4,
      titleFr: 'Robe Wax Africaine - Mod\u00e8le Kampala',
      titleEn: 'African Wax Dress - Kampala Model',
      descFr: 'Magnifique robe en tissu wax africain, coupe \u00e9l\u00e9gante. Confectionn\u00e9e \u00e0 Lubumbashi par des couturi\u00e8res locales.',
      descEn: 'Beautiful African wax fabric dress, elegant cut. Made in Lubumbashi by local seamstresses.',
      categoryN: 401,
      sellerId: seller1.id,
      priceCDF: BigInt(4500000), // 45,000 CDF
      priceUSD: BigInt(1600),    // $16.00
      quantity: 20,
      condition: ProductCondition.NEW,
      status: ProductStatus.ACTIVE,
      images: [
        { n: 9, name: 'cld-sample' },
        { n: 10, name: 'cld-sample-2' },
      ],
      specs: [
        { n: 13, attrN: 20, value: 'M' },
        { n: 14, attrN: 21, value: 'Multicolore' },
        { n: 15, attrN: 22, value: 'Wax 100% coton' },
      ],
    },
    {
      n: 5,
      titleFr: 'Chemise Homme en Lin - Blanche',
      titleEn: 'Men\'s Linen Shirt - White',
      descFr: 'Chemise l\u00e9g\u00e8re en lin pour homme, id\u00e9ale pour le climat tropical. Coupe classique, confortable.',
      descEn: 'Lightweight linen shirt for men, ideal for tropical climate. Classic fit, comfortable.',
      categoryN: 501,
      sellerId: seller1.id,
      priceCDF: BigInt(3500000), // 35,000 CDF
      priceUSD: BigInt(1200),    // $12.00
      quantity: 30,
      condition: ProductCondition.NEW,
      status: ProductStatus.ACTIVE,
      images: [
        { n: 11, name: 'cld-sample-3' },
      ],
      specs: [
        { n: 16, attrN: 30, value: 'L' },
        { n: 17, attrN: 31, value: 'Blanc' },
        { n: 18, attrN: 32, value: 'Lin' },
      ],
    },
    {
      n: 6,
      titleFr: 'T\u00e9l\u00e9viseur Samsung 43 Pouces - Smart TV',
      titleEn: 'Samsung 43 Inch Smart TV',
      descFr: 'T\u00e9l\u00e9viseur Samsung 43 pouces Full HD, Smart TV avec Wi-Fi int\u00e9gr\u00e9. Applications YouTube, Netflix.',
      descEn: 'Samsung 43 inch Full HD TV, Smart TV with built-in Wi-Fi. YouTube, Netflix apps.',
      categoryN: 301,
      sellerId: seller2.id,
      priceCDF: BigInt(85000000), // 850,000 CDF
      priceUSD: BigInt(30000),    // $300.00
      quantity: 3,
      condition: ProductCondition.NEW,
      status: ProductStatus.ACTIVE,
      images: [
        { n: 12, name: 'cld-sample-4' },
        { n: 13, name: 'cld-sample-5' },
      ],
      specs: [
        { n: 19, attrN: 40, value: 'Samsung' },
        { n: 20, attrN: 41, value: '75W' },
      ],
    },
    {
      n: 7,
      titleFr: 'Sac \u00e0 Main en Cuir - Marron',
      titleEn: 'Leather Handbag - Brown',
      descFr: 'Sac \u00e0 main en cuir v\u00e9ritable, design \u00e9l\u00e9gant. Plusieurs compartiments, fermeture \u00e9clair.',
      descEn: 'Genuine leather handbag, elegant design. Multiple compartments, zipper closure.',
      categoryN: 403,
      sellerId: seller1.id,
      priceCDF: BigInt(6000000), // 60,000 CDF
      priceUSD: BigInt(2200),    // $22.00
      quantity: 12,
      condition: ProductCondition.NEW,
      status: ProductStatus.ACTIVE,
      images: [
        { n: 14, name: 'sample' },
        { n: 15, name: 'cld-sample' },
        { n: 16, name: 'cld-sample-2' },
      ],
    },
    {
      n: 8,
      titleFr: 'Infinix Hot 30 - 128Go (Occasion)',
      titleEn: 'Infinix Hot 30 - 128GB (Used)',
      descFr: 'Infinix Hot 30 en tr\u00e8s bon \u00e9tat. 128Go de stockage, 8Go de RAM. Vendu avec chargeur.',
      descEn: 'Infinix Hot 30 in very good condition. 128GB storage, 8GB RAM. Sold with charger.',
      categoryN: 101,
      sellerId: seller2.id,
      priceCDF: BigInt(25000000), // 250,000 CDF
      priceUSD: BigInt(9000),     // $90.00
      quantity: 2,
      condition: ProductCondition.USED,
      status: ProductStatus.ACTIVE,
      images: [
        { n: 17, name: 'cld-sample-3' },
      ],
      specs: [
        { n: 21, attrN: 1, value: 'Infinix' },
        { n: 22, attrN: 2, value: '128Go' },
        { n: 23, attrN: 3, value: 'Vert' },
        { n: 24, attrN: 4, value: '8Go' },
      ],
    },
    {
      n: 9,
      titleFr: 'Casserole Inox 5L - Cuisine',
      titleEn: 'Stainless Steel Pot 5L - Kitchen',
      descFr: 'Casserole en acier inoxydable de 5 litres avec couvercle. Qualit\u00e9 sup\u00e9rieure, fond \u00e9pais.',
      descEn: 'Stainless steel 5-liter pot with lid. Superior quality, thick bottom.',
      categoryN: 603,
      sellerId: seller1.id,
      priceCDF: BigInt(2500000), // 25,000 CDF
      priceUSD: BigInt(900),     // $9.00
      quantity: 25,
      condition: ProductCondition.NEW,
      status: ProductStatus.ACTIVE,
      images: [
        { n: 18, name: 'cld-sample-4' },
      ],
    },
    {
      n: 10,
      titleFr: 'Ballon de Football - Taille 5',
      titleEn: 'Football - Size 5',
      descFr: 'Ballon de football taille officielle 5. Cousu machine, rev\u00eatement synth\u00e9tique durable.',
      descEn: 'Official size 5 football. Machine stitched, durable synthetic cover.',
      categoryN: 902,
      sellerId: seller1.id,
      priceCDF: BigInt(1500000), // 15,000 CDF
      priceUSD: BigInt(550),     // $5.50
      quantity: 40,
      condition: ProductCondition.NEW,
      status: ProductStatus.ACTIVE,
      images: [
        { n: 19, name: 'cld-sample-5' },
        { n: 20, name: 'sample' },
      ],
    },
    {
      n: 11,
      titleFr: 'Huile Corporelle Karit\u00e9 - 250ml',
      titleEn: 'Shea Body Oil - 250ml',
      descFr: 'Huile corporelle \u00e0 base de beurre de karit\u00e9 naturel. Hydrate et nourrit la peau. Fabriqu\u00e9 au Congo.',
      descEn: 'Body oil made from natural shea butter. Moisturizes and nourishes skin. Made in Congo.',
      categoryN: 701,
      sellerId: seller1.id,
      priceCDF: BigInt(800000), // 8,000 CDF
      priceUSD: BigInt(300),    // $3.00
      quantity: 50,
      condition: ProductCondition.NEW,
      status: ProductStatus.ACTIVE,
      images: [
        { n: 21, name: 'cld-sample' },
      ],
    },
    {
      n: 12,
      titleFr: 'Souris Sans Fil Logitech M185',
      titleEn: 'Logitech M185 Wireless Mouse',
      descFr: 'Souris sans fil Logitech M185, r\u00e9cepteur USB nano. Port\u00e9e 10m, autonomie 12 mois.',
      descEn: 'Logitech M185 wireless mouse, USB nano receiver. 10m range, 12-month battery life.',
      categoryN: 203,
      sellerId: seller2.id,
      priceCDF: BigInt(2000000), // 20,000 CDF
      priceUSD: BigInt(700),     // $7.00
      quantity: 18,
      condition: ProductCondition.NEW,
      status: ProductStatus.ACTIVE,
      images: [
        { n: 22, name: 'cld-sample-2' },
        { n: 23, name: 'cld-sample-3' },
      ],
    },
    // --- DRAFT products (3) ---
    {
      n: 13,
      titleFr: 'Chaussures Nike Air Force 1 (Brouillon)',
      titleEn: 'Nike Air Force 1 Shoes (Draft)',
      descFr: 'Chaussures Nike Air Force 1, pointure 42-45. Neuves, dans bo\u00eete originale.',
      descEn: 'Nike Air Force 1 shoes, size 42-45. New, in original box.',
      categoryN: 503,
      sellerId: seller1.id,
      priceCDF: BigInt(18000000), // 180,000 CDF
      priceUSD: BigInt(6500),     // $65.00
      quantity: 6,
      condition: ProductCondition.NEW,
      status: ProductStatus.DRAFT,
      images: [],
    },
    {
      n: 14,
      titleFr: 'Imprimante HP DeskJet 2710 (Brouillon)',
      titleEn: 'HP DeskJet 2710 Printer (Draft)',
      descFr: 'Imprimante multifonction HP DeskJet 2710. Impression, copie, scan. Wi-Fi.',
      descEn: 'HP DeskJet 2710 all-in-one printer. Print, copy, scan. Wi-Fi.',
      categoryN: 204,
      sellerId: seller2.id,
      priceCDF: BigInt(25000000), // 250,000 CDF
      priceUSD: BigInt(9000),     // $90.00
      quantity: 4,
      condition: ProductCondition.NEW,
      status: ProductStatus.DRAFT,
      images: [],
    },
    {
      n: 15,
      titleFr: 'Lot de 3 Cahiers A4 - 200 Pages',
      titleEn: 'Set of 3 A4 Notebooks - 200 Pages',
      descFr: 'Lot de 3 cahiers format A4, 200 pages chacun. Couverture rigide, papier de qualit\u00e9.',
      descEn: 'Set of 3 A4 notebooks, 200 pages each. Hardcover, quality paper.',
      categoryN: 1302,
      sellerId: seller1.id,
      priceCDF: BigInt(500000), // 5,000 CDF
      priceUSD: BigInt(200),    // $2.00
      quantity: 100,
      condition: ProductCondition.NEW,
      status: ProductStatus.DRAFT,
      images: [],
    },
    // --- PENDING_REVIEW products (3) ---
    {
      n: 16,
      titleFr: 'Enceinte Bluetooth JBL Flip 5',
      titleEn: 'JBL Flip 5 Bluetooth Speaker',
      descFr: 'Enceinte portable Bluetooth JBL Flip 5. \u00c9tanche IPX7, 12h d\'autonomie. Son puissant.',
      descEn: 'JBL Flip 5 portable Bluetooth speaker. IPX7 waterproof, 12h battery. Powerful sound.',
      categoryN: 302,
      sellerId: seller2.id,
      priceCDF: BigInt(22000000), // 220,000 CDF
      priceUSD: BigInt(8000),     // $80.00
      quantity: 7,
      condition: ProductCondition.NEW,
      status: ProductStatus.PENDING_REVIEW,
      images: [
        { n: 24, name: 'cld-sample-4' },
      ],
      specs: [
        { n: 25, attrN: 40, value: 'JBL' },
        { n: 26, attrN: 41, value: '20W' },
      ],
    },
    {
      n: 17,
      titleFr: 'Ensemble Pagne 6 Yards - Vlisco',
      titleEn: 'Vlisco 6 Yards Fabric Set',
      descFr: 'V\u00e9ritable pagne Vlisco 6 yards. Motif exclusif, couleurs vives. Qualit\u00e9 hollandaise.',
      descEn: 'Genuine Vlisco 6 yards fabric. Exclusive pattern, vibrant colors. Dutch quality.',
      categoryN: 401,
      sellerId: seller1.id,
      priceCDF: BigInt(12000000), // 120,000 CDF
      priceUSD: BigInt(4300),     // $43.00
      quantity: 10,
      condition: ProductCondition.NEW,
      status: ProductStatus.PENDING_REVIEW,
      images: [
        { n: 25, name: 'cld-sample-5' },
        { n: 26, name: 'sample' },
      ],
      specs: [
        { n: 27, attrN: 21, value: 'Orange/Bleu' },
        { n: 28, attrN: 22, value: 'Coton Wax' },
      ],
    },
    {
      n: 18,
      titleFr: 'Batterie Externe 20000mAh - Power Bank',
      titleEn: '20000mAh Power Bank',
      descFr: 'Batterie externe 20000mAh avec double port USB. Charge rapide. Indispensable \u00e0 Lubumbashi!',
      descEn: '20000mAh power bank with dual USB ports. Fast charging. Essential in Lubumbashi!',
      categoryN: 103,
      sellerId: seller2.id,
      priceCDF: BigInt(5000000), // 50,000 CDF
      priceUSD: BigInt(1800),    // $18.00
      quantity: 22,
      condition: ProductCondition.NEW,
      status: ProductStatus.PENDING_REVIEW,
      images: [
        { n: 27, name: 'cld-sample' },
      ],
    },
    // --- REJECTED product (1) ---
    {
      n: 19,
      titleFr: 'iPhone 15 Pro Max - 256Go',
      titleEn: 'iPhone 15 Pro Max - 256GB',
      descFr: 'iPhone 15 Pro Max neuf sous blister. 256Go, couleur titane naturel.',
      descEn: 'Brand new sealed iPhone 15 Pro Max. 256GB, natural titanium color.',
      categoryN: 101,
      sellerId: seller2.id,
      priceCDF: BigInt(500000000), // 5,000,000 CDF
      priceUSD: BigInt(180000),    // $1,800.00
      quantity: 1,
      condition: ProductCondition.NEW,
      status: ProductStatus.REJECTED,
      rejectionReason: 'Prix anormalement bas pour ce mod\u00e8le. Veuillez fournir une preuve d\'achat ou de provenance.',
      images: [
        { n: 28, name: 'cld-sample-2' },
      ],
      specs: [
        { n: 29, attrN: 1, value: 'Apple' },
        { n: 30, attrN: 2, value: '256Go' },
        { n: 31, attrN: 3, value: 'Titane Naturel' },
        { n: 32, attrN: 4, value: '8Go' },
      ],
    },
    // --- ARCHIVED product (1) ---
    {
      n: 20,
      titleFr: 'Lenovo IdeaPad 3 - Core i3 (Occasion)',
      titleEn: 'Lenovo IdeaPad 3 - Core i3 (Used)',
      descFr: 'Ordinateur portable Lenovo IdeaPad 3. Core i3, 4Go RAM, 256Go SSD. En bon \u00e9tat g\u00e9n\u00e9ral.',
      descEn: 'Lenovo IdeaPad 3 laptop. Core i3, 4GB RAM, 256GB SSD. In good general condition.',
      categoryN: 201,
      sellerId: seller2.id,
      priceCDF: BigInt(55000000), // 550,000 CDF
      priceUSD: BigInt(20000),    // $200.00
      quantity: 0,
      condition: ProductCondition.USED,
      status: ProductStatus.ARCHIVED,
      images: [
        { n: 29, name: 'cld-sample-3' },
      ],
      specs: [
        { n: 33, attrN: 10, value: 'Lenovo' },
        { n: 34, attrN: 11, value: '4Go' },
        { n: 35, attrN: 12, value: '256Go' },
        { n: 36, attrN: 13, value: 'Intel Core i3-1115G4' },
      ],
    },
  ];

  for (const prod of products) {
    const id = prodId(prod.n);
    const categoryId = createdSubCats[prod.categoryN] ?? createdMainCats[prod.categoryN];

    if (!categoryId) {
      console.warn(`Skipping product ${prod.n}: category ${prod.categoryN} not found`);
      continue;
    }

    // Upsert the product
    const slug = generateProductSlug(prod.titleFr, id);
    await prisma.product.upsert({
      where: { id },
      update: { slug },
      create: {
        id,
        slug,
        title: { fr: prod.titleFr, en: prod.titleEn } as any,
        description: { fr: prod.descFr, en: prod.descEn } as any,
        categoryId,
        sellerId: prod.sellerId,
        cityId: LUBUMBASHI_CITY_ID,
        priceCDF: prod.priceCDF,
        priceUSD: prod.priceUSD,
        quantity: prod.quantity,
        condition: prod.condition,
        status: prod.status,
        rejectionReason: prod.rejectionReason ?? null,
      },
    });

    // Upsert images
    for (let i = 0; i < prod.images.length; i++) {
      const img = prod.images[i];
      const iid = imgId(img.n);
      await prisma.productImage.upsert({
        where: { id: iid },
        update: {},
        create: {
          id: iid,
          productId: id,
          cloudinaryId: `demo/${img.name}`,
          url: cloudImg(img.name),
          thumbnailUrl: cloudThumb(img.name),
          displayOrder: i,
        },
      });
    }

    // Upsert specifications
    if (prod.specs) {
      for (const spec of prod.specs) {
        const sid = specId(spec.n);
        const attributeId = createdAttrs[spec.attrN];
        if (!attributeId) {
          console.warn(`Skipping spec ${spec.n}: attribute ${spec.attrN} not found`);
          continue;
        }
        await prisma.productSpecification.upsert({
          where: { productId_attributeId: { productId: id, attributeId } },
          update: {},
          create: {
            id: sid,
            productId: id,
            attributeId,
            value: spec.value,
          },
        });
      }
    }
  }

  console.log(`Seeded ${products.length} products with images and specifications`);

  // ============================================================
  // PHASE 4: DELIVERY ZONES, CART, ORDERS
  // ============================================================

  await seedPhase4Data(buyer.id, seller1.id, seller2.id, admin.id, prodId, cloudThumb);

  // ============================================================
  // PHASE 5: COMMISSIONS, TRANSACTIONS, EARNINGS, PAYOUTS
  // ============================================================

  await seedPhase5Data(seller1.id, seller2.id, catId);

  // ============================================================
  // PHASE 6: REVIEWS, WISHLISTS, CONVERSATIONS, MESSAGES
  // ============================================================

  await seedPhase6Data(buyer.id, seller1.id, seller2.id, prodId);

  // ============================================================
  // PHASE 7: BANNERS, PROMOTIONS, CONTENT, SETTINGS, BROADCASTS
  // ============================================================

  await seedPhase7Data(admin.id, seller1.id, prodId, catId);

  // ============================================================
  console.log('Seeding completed!');
}

// ============================================================
// PHASE 4 SEED: Delivery Zones, Cart, Orders
// ============================================================

async function seedPhase4Data(
  buyerId: string,
  seller1Id: string,
  seller2Id: string,
  adminId: string,
  prodId: (n: number) => string,
  cloudThumb: (name: string) => string,
) {
  console.log('Seeding Phase 4 data...');

  // Helper for deterministic UUIDs
  const dzId = (n: number) => `60000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const cartItemId = (n: number) => `70000000-0000-0000-0000-00000000${String(n).padStart(4, '0')}`;
  const orderId = (n: number) => `70000000-0000-0000-0000-0000000001${String(n).padStart(2, '0')}`;
  const orderItemId = (n: number) => `80000000-0000-0000-0000-0000000001${String(n).padStart(2, '0')}`;
  const statusLogId = (n: number) => `90000000-0000-0000-0000-0000000001${String(n).padStart(2, '0')}`;

  // Buyer's default address
  const buyerAddressId = '00000000-0000-0000-0000-000000000001';

  // Checkout group IDs (shared between orders from same "checkout")
  const checkoutGroup1 = 'c0000000-0000-0000-0000-000000000001'; // Orders 1 + 5 (earlier purchases)
  const checkoutGroup2 = 'c0000000-0000-0000-0000-000000000002'; // Order 2 (standalone)
  const checkoutGroup3 = 'c0000000-0000-0000-0000-000000000003'; // Orders 3 + 6 (recent checkout)
  const checkoutGroup4 = 'c0000000-0000-0000-0000-000000000004'; // Order 4 (standalone)

  // ----------------------------------------------------------
  // 1. DELIVERY ZONES (12 zones)
  // ----------------------------------------------------------

  console.log('  Seeding delivery zones...');

  const deliveryZones = [
    { n: 1, fromTown: 'Lubumbashi', toTown: 'Lubumbashi', feeCDF: BigInt(300000), feeUSD: BigInt(120) },
    { n: 2, fromTown: 'Lubumbashi', toTown: 'Likasi', feeCDF: BigInt(800000), feeUSD: BigInt(320) },
    { n: 3, fromTown: 'Lubumbashi', toTown: 'Kolwezi', feeCDF: BigInt(1500000), feeUSD: BigInt(600) },
    { n: 4, fromTown: 'Likasi', toTown: 'Likasi', feeCDF: BigInt(300000), feeUSD: BigInt(120) },
    { n: 5, fromTown: 'Likasi', toTown: 'Lubumbashi', feeCDF: BigInt(800000), feeUSD: BigInt(320) },
    { n: 6, fromTown: 'Likasi', toTown: 'Kolwezi', feeCDF: BigInt(1200000), feeUSD: BigInt(480) },
    { n: 7, fromTown: 'Kolwezi', toTown: 'Kolwezi', feeCDF: BigInt(300000), feeUSD: BigInt(120) },
    { n: 8, fromTown: 'Kolwezi', toTown: 'Lubumbashi', feeCDF: BigInt(1500000), feeUSD: BigInt(600) },
    { n: 9, fromTown: 'Kolwezi', toTown: 'Likasi', feeCDF: BigInt(1200000), feeUSD: BigInt(480) },
    { n: 10, fromTown: 'Lubumbashi', toTown: 'Kipushi', feeCDF: BigInt(500000), feeUSD: BigInt(200) },
    { n: 11, fromTown: 'Lubumbashi', toTown: 'Kasumbalesa', feeCDF: BigInt(600000), feeUSD: BigInt(240) },
    { n: 12, fromTown: 'Likasi', toTown: 'Kambove', feeCDF: BigInt(400000), feeUSD: BigInt(160) },
  ];

  for (const zone of deliveryZones) {
    await prisma.deliveryZone.upsert({
      where: { fromTown_toTown: { fromTown: zone.fromTown, toTown: zone.toTown } },
      update: {},
      create: {
        id: dzId(zone.n),
        fromTown: zone.fromTown,
        toTown: zone.toTown,
        feeCDF: zone.feeCDF,
        feeUSD: zone.feeUSD,
        isActive: true,
      },
    });
  }

  console.log(`  Seeded ${deliveryZones.length} delivery zones`);

  // ----------------------------------------------------------
  // 2. CART & CART ITEMS for buyer
  // ----------------------------------------------------------

  console.log('  Seeding cart for buyer...');

  const cartId = '70000000-0000-0000-0000-000000000001';

  // Upsert the cart
  await prisma.cart.upsert({
    where: { userId: buyerId },
    update: {},
    create: {
      id: cartId,
      userId: buyerId,
    },
  });

  // Cart items: 3 items from 2 different sellers
  // Product 2 (Tecno Spark 10 Pro) — seller2 (Patrick)
  // Product 4 (Robe Wax Africaine) — seller1 (Marie)
  // Product 12 (Souris Logitech M185) — seller2 (Patrick)
  const cartItems = [
    { n: 1, productId: prodId(2), quantity: 1 },  // Tecno Spark 10 Pro — Patrick
    { n: 2, productId: prodId(4), quantity: 2 },   // Robe Wax Africaine — Marie
    { n: 3, productId: prodId(12), quantity: 1 },  // Souris Logitech — Patrick
  ];

  for (const item of cartItems) {
    await prisma.cartItem.upsert({
      where: { cartId_productId: { cartId, productId: item.productId } },
      update: {},
      create: {
        id: cartItemId(item.n),
        cartId,
        productId: item.productId,
        quantity: item.quantity,
      },
    });
  }

  console.log(`  Seeded cart with ${cartItems.length} items`);

  // ----------------------------------------------------------
  // 3. ORDERS (6 orders in various statuses)
  // ----------------------------------------------------------

  console.log('  Seeding orders...');

  // Delivery fee for Lubumbashi → Lubumbashi (local)
  const localDeliveryFeeCDF = BigInt(300000);  // 3,000 FC
  const localDeliveryFeeUSD = BigInt(120);     // $1.20

  // ---- Order 1: DELIVERED — seller Marie, 2 items, COD ----
  // Items: Product 4 (Robe Wax - 45,000 CDF) x1 + Product 9 (Casserole - 25,000 CDF) x1
  const order1SubtotalCDF = BigInt(4500000) + BigInt(2500000); // 70,000 CDF in centimes
  const order1SubtotalUSD = BigInt(1600) + BigInt(900);
  const order1TotalCDF = order1SubtotalCDF + localDeliveryFeeCDF;
  const order1TotalUSD = order1SubtotalUSD + localDeliveryFeeUSD;

  await prisma.order.upsert({
    where: { orderNumber: 'TK-20260215-A1B2' },
    update: {},
    create: {
      id: orderId(1),
      orderNumber: 'TK-20260215-A1B2',
      checkoutGroupId: checkoutGroup1,
      buyerId,
      sellerId: seller1Id,
      status: OrderStatus.DELIVERED,
      paymentMethod: PaymentMethod.COD,
      paymentStatus: PaymentStatus.COMPLETED,
      deliveryAddressId: buyerAddressId,
      deliveryFeeCDF: localDeliveryFeeCDF,
      deliveryFeeUSD: localDeliveryFeeUSD,
      subtotalCDF: order1SubtotalCDF,
      subtotalUSD: order1SubtotalUSD,
      totalCDF: order1TotalCDF,
      totalUSD: order1TotalUSD,
      createdAt: new Date('2026-02-15T09:30:00Z'),
    },
  });

  // Order 1 items
  await prisma.orderItem.upsert({
    where: { id: orderItemId(1) },
    update: {},
    create: {
      id: orderItemId(1),
      orderId: orderId(1),
      productId: prodId(4),
      quantity: 1,
      unitPriceCDF: BigInt(4500000),
      unitPriceUSD: BigInt(1600),
      totalCDF: BigInt(4500000),
      totalUSD: BigInt(1600),
      productTitle: { fr: 'Robe Wax Africaine - Modèle Kampala', en: 'African Wax Dress - Kampala Model' } as any,
      productImage: cloudThumb('cld-sample'),
    },
  });

  await prisma.orderItem.upsert({
    where: { id: orderItemId(2) },
    update: {},
    create: {
      id: orderItemId(2),
      orderId: orderId(1),
      productId: prodId(9),
      quantity: 1,
      unitPriceCDF: BigInt(2500000),
      unitPriceUSD: BigInt(900),
      totalCDF: BigInt(2500000),
      totalUSD: BigInt(900),
      productTitle: { fr: 'Casserole Inox 5L - Cuisine', en: 'Stainless Steel Pot 5L - Kitchen' } as any,
      productImage: cloudThumb('cld-sample-4'),
    },
  });

  // Order 1 status logs (DELIVERED progression)
  const order1Dates = [
    new Date('2026-02-15T09:30:00Z'),
    new Date('2026-02-15T10:15:00Z'),
    new Date('2026-02-15T14:00:00Z'),
    new Date('2026-02-16T08:00:00Z'),
    new Date('2026-02-16T15:30:00Z'),
  ];

  await prisma.orderStatusLog.upsert({
    where: { id: statusLogId(1) },
    update: {},
    create: {
      id: statusLogId(1),
      orderId: orderId(1),
      fromStatus: null,
      toStatus: OrderStatus.PENDING,
      note: 'Commande passée par le client',
      createdAt: order1Dates[0],
    },
  });
  await prisma.orderStatusLog.upsert({
    where: { id: statusLogId(2) },
    update: {},
    create: {
      id: statusLogId(2),
      orderId: orderId(1),
      fromStatus: OrderStatus.PENDING,
      toStatus: OrderStatus.CONFIRMED,
      changedBy: seller1Id,
      note: 'Commande confirmée par le vendeur',
      createdAt: order1Dates[1],
    },
  });
  await prisma.orderStatusLog.upsert({
    where: { id: statusLogId(3) },
    update: {},
    create: {
      id: statusLogId(3),
      orderId: orderId(1),
      fromStatus: OrderStatus.CONFIRMED,
      toStatus: OrderStatus.PROCESSING,
      changedBy: seller1Id,
      note: 'Commande en cours de préparation',
      createdAt: order1Dates[2],
    },
  });
  await prisma.orderStatusLog.upsert({
    where: { id: statusLogId(4) },
    update: {},
    create: {
      id: statusLogId(4),
      orderId: orderId(1),
      fromStatus: OrderStatus.PROCESSING,
      toStatus: OrderStatus.SHIPPED,
      changedBy: seller1Id,
      note: 'Colis expédié — en route vers Kampemba',
      createdAt: order1Dates[3],
    },
  });
  await prisma.orderStatusLog.upsert({
    where: { id: statusLogId(5) },
    update: {},
    create: {
      id: statusLogId(5),
      orderId: orderId(1),
      fromStatus: OrderStatus.SHIPPED,
      toStatus: OrderStatus.DELIVERED,
      note: 'Colis livré — paiement reçu à la livraison',
      createdAt: order1Dates[4],
    },
  });

  // ---- Order 2: PENDING — seller Patrick, 1 item, MOBILE_MONEY ----
  // Item: Product 1 (Samsung Galaxy A14 - 350,000 CDF) x1
  const order2SubtotalCDF = BigInt(35000000);
  const order2SubtotalUSD = BigInt(12500);
  const order2TotalCDF = order2SubtotalCDF + localDeliveryFeeCDF;
  const order2TotalUSD = order2SubtotalUSD + localDeliveryFeeUSD;

  await prisma.order.upsert({
    where: { orderNumber: 'TK-20260225-C3D4' },
    update: {},
    create: {
      id: orderId(2),
      orderNumber: 'TK-20260225-C3D4',
      checkoutGroupId: checkoutGroup2,
      buyerId,
      sellerId: seller2Id,
      status: OrderStatus.PENDING,
      paymentMethod: PaymentMethod.MOBILE_MONEY,
      paymentStatus: PaymentStatus.PENDING,
      deliveryAddressId: buyerAddressId,
      deliveryFeeCDF: localDeliveryFeeCDF,
      deliveryFeeUSD: localDeliveryFeeUSD,
      subtotalCDF: order2SubtotalCDF,
      subtotalUSD: order2SubtotalUSD,
      totalCDF: order2TotalCDF,
      totalUSD: order2TotalUSD,
      buyerNote: 'Appelez-moi avant la livraison, s\'il vous plaît.',
      createdAt: new Date('2026-02-25T16:45:00Z'),
    },
  });

  await prisma.orderItem.upsert({
    where: { id: orderItemId(3) },
    update: {},
    create: {
      id: orderItemId(3),
      orderId: orderId(2),
      productId: prodId(1),
      quantity: 1,
      unitPriceCDF: BigInt(35000000),
      unitPriceUSD: BigInt(12500),
      totalCDF: BigInt(35000000),
      totalUSD: BigInt(12500),
      productTitle: { fr: 'Samsung Galaxy A14 - 64Go', en: 'Samsung Galaxy A14 - 64GB' } as any,
      productImage: cloudThumb('sample'),
    },
  });

  // Order 2 status log (PENDING only)
  await prisma.orderStatusLog.upsert({
    where: { id: statusLogId(6) },
    update: {},
    create: {
      id: statusLogId(6),
      orderId: orderId(2),
      fromStatus: null,
      toStatus: OrderStatus.PENDING,
      note: 'Commande passée — en attente de paiement Mobile Money',
      createdAt: new Date('2026-02-25T16:45:00Z'),
    },
  });

  // ---- Order 3: CONFIRMED — seller Marie, 1 item, COD ----
  // Item: Product 7 (Sac à Main en Cuir - 60,000 CDF) x1
  const order3SubtotalCDF = BigInt(6000000);
  const order3SubtotalUSD = BigInt(2200);
  const order3TotalCDF = order3SubtotalCDF + localDeliveryFeeCDF;
  const order3TotalUSD = order3SubtotalUSD + localDeliveryFeeUSD;

  await prisma.order.upsert({
    where: { orderNumber: 'TK-20260226-E5F6' },
    update: {},
    create: {
      id: orderId(3),
      orderNumber: 'TK-20260226-E5F6',
      checkoutGroupId: checkoutGroup3,
      buyerId,
      sellerId: seller1Id,
      status: OrderStatus.CONFIRMED,
      paymentMethod: PaymentMethod.COD,
      paymentStatus: PaymentStatus.PENDING,
      deliveryAddressId: buyerAddressId,
      deliveryFeeCDF: localDeliveryFeeCDF,
      deliveryFeeUSD: localDeliveryFeeUSD,
      subtotalCDF: order3SubtotalCDF,
      subtotalUSD: order3SubtotalUSD,
      totalCDF: order3TotalCDF,
      totalUSD: order3TotalUSD,
      createdAt: new Date('2026-02-26T08:00:00Z'),
    },
  });

  await prisma.orderItem.upsert({
    where: { id: orderItemId(4) },
    update: {},
    create: {
      id: orderItemId(4),
      orderId: orderId(3),
      productId: prodId(7),
      quantity: 1,
      unitPriceCDF: BigInt(6000000),
      unitPriceUSD: BigInt(2200),
      totalCDF: BigInt(6000000),
      totalUSD: BigInt(2200),
      productTitle: { fr: 'Sac à Main en Cuir - Marron', en: 'Leather Handbag - Brown' } as any,
      productImage: cloudThumb('sample'),
    },
  });

  // Order 3 status logs (PENDING → CONFIRMED)
  await prisma.orderStatusLog.upsert({
    where: { id: statusLogId(7) },
    update: {},
    create: {
      id: statusLogId(7),
      orderId: orderId(3),
      fromStatus: null,
      toStatus: OrderStatus.PENDING,
      note: 'Commande passée par le client',
      createdAt: new Date('2026-02-26T08:00:00Z'),
    },
  });
  await prisma.orderStatusLog.upsert({
    where: { id: statusLogId(8) },
    update: {},
    create: {
      id: statusLogId(8),
      orderId: orderId(3),
      fromStatus: OrderStatus.PENDING,
      toStatus: OrderStatus.CONFIRMED,
      changedBy: seller1Id,
      note: 'Commande acceptée par le vendeur',
      createdAt: new Date('2026-02-26T09:30:00Z'),
    },
  });

  // ---- Order 4: SHIPPED — seller Patrick, 3 items, COD ----
  // Items: Product 2 (Tecno Spark - 420,000 CDF) x1 + Product 12 (Souris Logitech - 20,000 CDF) x2 + Product 6 (TV Samsung - 850,000 CDF) x1
  const order4Item1CDF = BigInt(42000000);
  const order4Item1USD = BigInt(15000);
  const order4Item2CDF = BigInt(2000000) * BigInt(2); // 2 souris
  const order4Item2USD = BigInt(700) * BigInt(2);
  const order4Item3CDF = BigInt(85000000);
  const order4Item3USD = BigInt(30000);
  const order4SubtotalCDF = order4Item1CDF + order4Item2CDF + order4Item3CDF;
  const order4SubtotalUSD = order4Item1USD + order4Item2USD + order4Item3USD;
  const order4TotalCDF = order4SubtotalCDF + localDeliveryFeeCDF;
  const order4TotalUSD = order4SubtotalUSD + localDeliveryFeeUSD;

  await prisma.order.upsert({
    where: { orderNumber: 'TK-20260226-G7H8' },
    update: {},
    create: {
      id: orderId(4),
      orderNumber: 'TK-20260226-G7H8',
      checkoutGroupId: checkoutGroup4,
      buyerId,
      sellerId: seller2Id,
      status: OrderStatus.SHIPPED,
      paymentMethod: PaymentMethod.COD,
      paymentStatus: PaymentStatus.PENDING,
      deliveryAddressId: buyerAddressId,
      deliveryFeeCDF: localDeliveryFeeCDF,
      deliveryFeeUSD: localDeliveryFeeUSD,
      subtotalCDF: order4SubtotalCDF,
      subtotalUSD: order4SubtotalUSD,
      totalCDF: order4TotalCDF,
      totalUSD: order4TotalUSD,
      buyerNote: 'Livraison avant 18h si possible.',
      createdAt: new Date('2026-02-26T10:00:00Z'),
    },
  });

  await prisma.orderItem.upsert({
    where: { id: orderItemId(5) },
    update: {},
    create: {
      id: orderItemId(5),
      orderId: orderId(4),
      productId: prodId(2),
      quantity: 1,
      unitPriceCDF: BigInt(42000000),
      unitPriceUSD: BigInt(15000),
      totalCDF: BigInt(42000000),
      totalUSD: BigInt(15000),
      productTitle: { fr: 'Tecno Spark 10 Pro - 128Go', en: 'Tecno Spark 10 Pro - 128GB' } as any,
      productImage: cloudThumb('cld-sample-3'),
    },
  });

  await prisma.orderItem.upsert({
    where: { id: orderItemId(6) },
    update: {},
    create: {
      id: orderItemId(6),
      orderId: orderId(4),
      productId: prodId(12),
      quantity: 2,
      unitPriceCDF: BigInt(2000000),
      unitPriceUSD: BigInt(700),
      totalCDF: order4Item2CDF,
      totalUSD: order4Item2USD,
      productTitle: { fr: 'Souris Sans Fil Logitech M185', en: 'Logitech M185 Wireless Mouse' } as any,
      productImage: cloudThumb('cld-sample-2'),
    },
  });

  await prisma.orderItem.upsert({
    where: { id: orderItemId(7) },
    update: {},
    create: {
      id: orderItemId(7),
      orderId: orderId(4),
      productId: prodId(6),
      quantity: 1,
      unitPriceCDF: BigInt(85000000),
      unitPriceUSD: BigInt(30000),
      totalCDF: BigInt(85000000),
      totalUSD: BigInt(30000),
      productTitle: { fr: 'Téléviseur Samsung 43 Pouces - Smart TV', en: 'Samsung 43 Inch Smart TV' } as any,
      productImage: cloudThumb('cld-sample-4'),
    },
  });

  // Order 4 status logs (PENDING → CONFIRMED → PROCESSING → SHIPPED)
  await prisma.orderStatusLog.upsert({
    where: { id: statusLogId(9) },
    update: {},
    create: {
      id: statusLogId(9),
      orderId: orderId(4),
      fromStatus: null,
      toStatus: OrderStatus.PENDING,
      note: 'Commande passée par le client',
      createdAt: new Date('2026-02-26T10:00:00Z'),
    },
  });
  await prisma.orderStatusLog.upsert({
    where: { id: statusLogId(10) },
    update: {},
    create: {
      id: statusLogId(10),
      orderId: orderId(4),
      fromStatus: OrderStatus.PENDING,
      toStatus: OrderStatus.CONFIRMED,
      changedBy: seller2Id,
      note: 'Commande confirmée par Tech Shop Lubumbashi',
      createdAt: new Date('2026-02-26T10:45:00Z'),
    },
  });
  await prisma.orderStatusLog.upsert({
    where: { id: statusLogId(11) },
    update: {},
    create: {
      id: statusLogId(11),
      orderId: orderId(4),
      fromStatus: OrderStatus.CONFIRMED,
      toStatus: OrderStatus.PROCESSING,
      changedBy: seller2Id,
      note: 'Préparation du colis en cours',
      createdAt: new Date('2026-02-26T13:00:00Z'),
    },
  });
  await prisma.orderStatusLog.upsert({
    where: { id: statusLogId(12) },
    update: {},
    create: {
      id: statusLogId(12),
      orderId: orderId(4),
      fromStatus: OrderStatus.PROCESSING,
      toStatus: OrderStatus.SHIPPED,
      changedBy: seller2Id,
      note: 'Colis remis au livreur — direction Kampemba',
      createdAt: new Date('2026-02-26T16:00:00Z'),
    },
  });

  // ---- Order 5: CANCELLED — seller Marie, 1 item, MOBILE_MONEY ----
  // Item: Product 11 (Huile Karité - 8,000 CDF) x3
  const order5SubtotalCDF = BigInt(800000) * BigInt(3);
  const order5SubtotalUSD = BigInt(300) * BigInt(3);
  const order5TotalCDF = order5SubtotalCDF + localDeliveryFeeCDF;
  const order5TotalUSD = order5SubtotalUSD + localDeliveryFeeUSD;

  await prisma.order.upsert({
    where: { orderNumber: 'TK-20260220-I9J0' },
    update: {},
    create: {
      id: orderId(5),
      orderNumber: 'TK-20260220-I9J0',
      checkoutGroupId: checkoutGroup1,
      buyerId,
      sellerId: seller1Id,
      status: OrderStatus.CANCELLED,
      paymentMethod: PaymentMethod.MOBILE_MONEY,
      paymentStatus: PaymentStatus.REFUNDED,
      deliveryAddressId: buyerAddressId,
      deliveryFeeCDF: localDeliveryFeeCDF,
      deliveryFeeUSD: localDeliveryFeeUSD,
      subtotalCDF: order5SubtotalCDF,
      subtotalUSD: order5SubtotalUSD,
      totalCDF: order5TotalCDF,
      totalUSD: order5TotalUSD,
      cancellationReason: 'Produit en rupture de stock chez le vendeur',
      cancelledBy: seller1Id,
      createdAt: new Date('2026-02-20T11:00:00Z'),
    },
  });

  await prisma.orderItem.upsert({
    where: { id: orderItemId(8) },
    update: {},
    create: {
      id: orderItemId(8),
      orderId: orderId(5),
      productId: prodId(11),
      quantity: 3,
      unitPriceCDF: BigInt(800000),
      unitPriceUSD: BigInt(300),
      totalCDF: order5SubtotalCDF,
      totalUSD: order5SubtotalUSD,
      productTitle: { fr: 'Huile Corporelle Karité - 250ml', en: 'Shea Body Oil - 250ml' } as any,
      productImage: cloudThumb('cld-sample'),
    },
  });

  // Order 5 status logs (PENDING → CONFIRMED → CANCELLED)
  await prisma.orderStatusLog.upsert({
    where: { id: statusLogId(13) },
    update: {},
    create: {
      id: statusLogId(13),
      orderId: orderId(5),
      fromStatus: null,
      toStatus: OrderStatus.PENDING,
      note: 'Commande passée par le client',
      createdAt: new Date('2026-02-20T11:00:00Z'),
    },
  });
  await prisma.orderStatusLog.upsert({
    where: { id: statusLogId(14) },
    update: {},
    create: {
      id: statusLogId(14),
      orderId: orderId(5),
      fromStatus: OrderStatus.PENDING,
      toStatus: OrderStatus.CONFIRMED,
      changedBy: seller1Id,
      note: 'Commande confirmée',
      createdAt: new Date('2026-02-20T12:00:00Z'),
    },
  });
  await prisma.orderStatusLog.upsert({
    where: { id: statusLogId(15) },
    update: {},
    create: {
      id: statusLogId(15),
      orderId: orderId(5),
      fromStatus: OrderStatus.CONFIRMED,
      toStatus: OrderStatus.CANCELLED,
      changedBy: seller1Id,
      note: 'Annulée par le vendeur — produit en rupture de stock',
      createdAt: new Date('2026-02-20T14:30:00Z'),
    },
  });

  // ---- Order 6: PROCESSING — seller Marie, 2 items, COD ----
  // Items: Product 5 (Chemise Lin - 35,000 CDF) x2 + Product 10 (Ballon Football - 15,000 CDF) x1
  const order6Item1CDF = BigInt(3500000) * BigInt(2);
  const order6Item1USD = BigInt(1200) * BigInt(2);
  const order6Item2CDF = BigInt(1500000);
  const order6Item2USD = BigInt(550);
  const order6SubtotalCDF = order6Item1CDF + order6Item2CDF;
  const order6SubtotalUSD = order6Item1USD + order6Item2USD;
  const order6TotalCDF = order6SubtotalCDF + localDeliveryFeeCDF;
  const order6TotalUSD = order6SubtotalUSD + localDeliveryFeeUSD;

  await prisma.order.upsert({
    where: { orderNumber: 'TK-20260227-K1L2' },
    update: {},
    create: {
      id: orderId(6),
      orderNumber: 'TK-20260227-K1L2',
      checkoutGroupId: checkoutGroup3,
      buyerId,
      sellerId: seller1Id,
      status: OrderStatus.PROCESSING,
      paymentMethod: PaymentMethod.COD,
      paymentStatus: PaymentStatus.PENDING,
      deliveryAddressId: buyerAddressId,
      deliveryFeeCDF: localDeliveryFeeCDF,
      deliveryFeeUSD: localDeliveryFeeUSD,
      subtotalCDF: order6SubtotalCDF,
      subtotalUSD: order6SubtotalUSD,
      totalCDF: order6TotalCDF,
      totalUSD: order6TotalUSD,
      createdAt: new Date('2026-02-27T07:00:00Z'),
    },
  });

  await prisma.orderItem.upsert({
    where: { id: orderItemId(9) },
    update: {},
    create: {
      id: orderItemId(9),
      orderId: orderId(6),
      productId: prodId(5),
      quantity: 2,
      unitPriceCDF: BigInt(3500000),
      unitPriceUSD: BigInt(1200),
      totalCDF: order6Item1CDF,
      totalUSD: order6Item1USD,
      productTitle: { fr: 'Chemise Homme en Lin - Blanche', en: "Men's Linen Shirt - White" } as any,
      productImage: cloudThumb('cld-sample-3'),
    },
  });

  await prisma.orderItem.upsert({
    where: { id: orderItemId(10) },
    update: {},
    create: {
      id: orderItemId(10),
      orderId: orderId(6),
      productId: prodId(10),
      quantity: 1,
      unitPriceCDF: BigInt(1500000),
      unitPriceUSD: BigInt(550),
      totalCDF: BigInt(1500000),
      totalUSD: BigInt(550),
      productTitle: { fr: 'Ballon de Football - Taille 5', en: 'Football - Size 5' } as any,
      productImage: cloudThumb('cld-sample-5'),
    },
  });

  // Order 6 status logs (PENDING → CONFIRMED → PROCESSING)
  await prisma.orderStatusLog.upsert({
    where: { id: statusLogId(16) },
    update: {},
    create: {
      id: statusLogId(16),
      orderId: orderId(6),
      fromStatus: null,
      toStatus: OrderStatus.PENDING,
      note: 'Commande passée par le client',
      createdAt: new Date('2026-02-27T07:00:00Z'),
    },
  });
  await prisma.orderStatusLog.upsert({
    where: { id: statusLogId(17) },
    update: {},
    create: {
      id: statusLogId(17),
      orderId: orderId(6),
      fromStatus: OrderStatus.PENDING,
      toStatus: OrderStatus.CONFIRMED,
      changedBy: seller1Id,
      note: 'Commande acceptée par Boutique Marie',
      createdAt: new Date('2026-02-27T07:45:00Z'),
    },
  });
  await prisma.orderStatusLog.upsert({
    where: { id: statusLogId(18) },
    update: {},
    create: {
      id: statusLogId(18),
      orderId: orderId(6),
      fromStatus: OrderStatus.CONFIRMED,
      toStatus: OrderStatus.PROCESSING,
      changedBy: seller1Id,
      note: 'Préparation de la commande en cours',
      createdAt: new Date('2026-02-27T09:00:00Z'),
    },
  });

  console.log('  Seeded 6 orders with items and status logs');
  console.log('Phase 4 seeding completed!');
}

// ============================================================
// PHASE 5 SEED: Commission Settings, Transactions, Seller Earnings, Payouts
// ============================================================

async function seedPhase5Data(
  seller1Id: string,
  seller2Id: string,
  catId: (n: number) => string,
) {
  console.log('Seeding Phase 5 data...');

  // Helper for deterministic UUIDs (same orderId pattern as phase 4)
  const orderId = (n: number) => `70000000-0000-0000-0000-0000000001${String(n).padStart(2, '0')}`;

  // ----------------------------------------------------------
  // 1. COMMISSION SETTINGS
  // ----------------------------------------------------------

  console.log('  Seeding commission settings...');

  // Global default: 10%
  await prisma.commissionSetting.upsert({
    where: { id: 'a0000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: 'a0000000-0000-0000-0000-000000000001',
      categoryId: null,
      rate: 0.1000,
      isActive: true,
    },
  });

  // Category override for Électronique (main category 3): 8%
  const electroniqueCategoryId = catId(3);

  await prisma.commissionSetting.upsert({
    where: { id: 'a0000000-0000-0000-0000-000000000002' },
    update: {},
    create: {
      id: 'a0000000-0000-0000-0000-000000000002',
      categoryId: electroniqueCategoryId,
      rate: 0.0800,
      isActive: true,
    },
  });

  console.log('  Seeded 2 commission settings');

  // ----------------------------------------------------------
  // 2. TRANSACTIONS
  // ----------------------------------------------------------

  console.log('  Seeding transactions...');

  // Order 1 (DELIVERED, COD) → Transaction COMPLETED, provider COD
  // Order 1 totalCDF = subtotal(7000000) + delivery(300000) = 7300000
  await prisma.transaction.upsert({
    where: { id: 'b0000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: 'b0000000-0000-0000-0000-000000000001',
      orderId: orderId(1),
      type: TransactionType.PAYMENT,
      provider: TransactionProvider.COD,
      amountCDF: BigInt(7300000),
      amountUSD: BigInt(2620),
      currency: 'CDF',
      status: PaymentStatus.COMPLETED,
      externalReference: null,
      idempotencyKey: 'txn-order1-cod-001',
      metadata: { note: 'Paiement reçu à la livraison' } as any,
      createdAt: new Date('2026-02-16T15:30:00Z'),
    },
  });

  // Order 2 (PENDING, MOBILE_MONEY) → Transaction PENDING, provider FLEXPAY
  // Order 2 totalCDF = 35000000 + 300000 = 35300000
  await prisma.transaction.upsert({
    where: { id: 'b0000000-0000-0000-0000-000000000002' },
    update: {},
    create: {
      id: 'b0000000-0000-0000-0000-000000000002',
      orderId: orderId(2),
      type: TransactionType.PAYMENT,
      provider: TransactionProvider.FLEXPAY,
      amountCDF: BigInt(35300000),
      amountUSD: BigInt(12620),
      currency: 'CDF',
      status: PaymentStatus.PENDING,
      externalReference: 'FPX-20260225-A001',
      idempotencyKey: 'txn-order2-flexpay-001',
      metadata: { provider: 'M-Pesa', phone: '+243970000002' } as any,
      createdAt: new Date('2026-02-25T16:46:00Z'),
    },
  });

  // Order 3 (CONFIRMED, MOBILE_MONEY) → Transaction PENDING, provider FLEXPAY
  // Order 3 totalCDF = 6000000 + 300000 = 6300000
  await prisma.transaction.upsert({
    where: { id: 'b0000000-0000-0000-0000-000000000003' },
    update: {},
    create: {
      id: 'b0000000-0000-0000-0000-000000000003',
      orderId: orderId(3),
      type: TransactionType.PAYMENT,
      provider: TransactionProvider.FLEXPAY,
      amountCDF: BigInt(6300000),
      amountUSD: BigInt(2320),
      currency: 'CDF',
      status: PaymentStatus.PENDING,
      externalReference: 'FPX-20260226-B002',
      idempotencyKey: 'txn-order3-flexpay-001',
      metadata: { provider: 'Airtel Money', phone: '+243970000002' } as any,
      createdAt: new Date('2026-02-26T08:01:00Z'),
    },
  });

  // Order 5 (CANCELLED, MOBILE_MONEY) → Transaction FAILED, provider FLEXPAY
  // Order 5 totalCDF = 2400000 + 300000 = 2700000
  await prisma.transaction.upsert({
    where: { id: 'b0000000-0000-0000-0000-000000000004' },
    update: {},
    create: {
      id: 'b0000000-0000-0000-0000-000000000004',
      orderId: orderId(5),
      type: TransactionType.PAYMENT,
      provider: TransactionProvider.FLEXPAY,
      amountCDF: BigInt(2700000),
      amountUSD: BigInt(1020),
      currency: 'CDF',
      status: PaymentStatus.FAILED,
      externalReference: 'FPX-20260220-C003',
      idempotencyKey: 'txn-order5-flexpay-001',
      metadata: { provider: 'M-Pesa', phone: '+243970000002' } as any,
      failureReason: 'Solde insuffisant sur le compte Mobile Money',
      createdAt: new Date('2026-02-20T11:01:00Z'),
    },
  });

  console.log('  Seeded 4 transactions');

  // ----------------------------------------------------------
  // 3. SELLER EARNINGS (only for delivered + paid orders)
  // ----------------------------------------------------------

  console.log('  Seeding seller earnings...');

  // Get Marie's seller profile
  const marieProfile = await prisma.sellerProfile.findUnique({
    where: { userId: seller1Id },
  });

  if (!marieProfile) {
    throw new Error('Marie seller profile not found — ensure Phase 2 seed ran first');
  }

  // Order 1 (DELIVERED + COD COMPLETED): Earning for seller Marie
  // grossAmountCDF = subtotalCDF of order 1 = 7000000 (centimes)
  const order1GrossCDF = BigInt(7000000);
  const order1CommissionRate = 0.1000; // 10% global default
  const order1CommissionCDF = BigInt(700000); // 7000000 * 0.10
  const order1NetCDF = order1GrossCDF - order1CommissionCDF; // 6300000

  await prisma.sellerEarning.upsert({
    where: { orderId: orderId(1) },
    update: {},
    create: {
      id: 'c0000000-0000-0000-0000-000000000001',
      sellerProfileId: marieProfile.id,
      orderId: orderId(1),
      grossAmountCDF: order1GrossCDF,
      commissionRate: order1CommissionRate,
      commissionCDF: order1CommissionCDF,
      netAmountCDF: order1NetCDF,
      isPaid: false,
    },
  });

  console.log('  Seeded 1 seller earning');

  // ----------------------------------------------------------
  // 4. PAYOUTS
  // ----------------------------------------------------------

  console.log('  Seeding payouts...');

  // Payout REQUESTED by seller Marie
  await prisma.payout.upsert({
    where: { id: 'd0000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: 'd0000000-0000-0000-0000-000000000001',
      sellerProfileId: marieProfile.id,
      amountCDF: order1NetCDF, // 6300000
      currency: 'CDF',
      status: PayoutStatus.REQUESTED,
      payoutMethod: 'M_PESA',
      payoutPhone: '+243970000001',
      requestedAt: new Date('2026-02-27T10:00:00Z'),
    },
  });

  console.log('  Seeded 1 payout');

  // ----------------------------------------------------------
  // 5. UPDATE SELLER PROFILE WALLET BALANCE
  // ----------------------------------------------------------

  console.log('  Updating seller wallet balances...');

  // Marie has 1 earning with netAmountCDF = 6300000
  await prisma.sellerProfile.update({
    where: { id: marieProfile.id },
    data: {
      walletBalanceCDF: order1NetCDF,
    },
  });

  console.log('  Updated wallet balance for Marie');
  console.log('Phase 5 seeding completed!');
}

// ============================================================
// PHASE 6 SEED: Reviews, Wishlists, Conversations, Messages
// ============================================================

async function seedPhase6Data(
  buyerId: string,
  seller1Id: string,
  seller2Id: string,
  prodId: (n: number) => string,
) {
  console.log('Seeding Phase 6 data...');

  const reviewId = (n: number) => `e0000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const wishlistId = (n: number) => `e1000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const conversationId = (n: number) => `e2000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const messageId = (n: number) => `e3000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const orderId = (n: number) => `70000000-0000-0000-0000-0000000001${String(n).padStart(2, '0')}`;

  // ----------------------------------------------------------
  // 1. REVIEWS (on delivered Order 1, products 4 and 9, seller Marie)
  // ----------------------------------------------------------
  console.log('  Seeding reviews...');

  const reviews = [
    {
      n: 1,
      productId: prodId(4),
      orderId: orderId(1),
      rating: 5,
      text: 'Magnifique robe wax ! La qualité du tissu est excellente et les couleurs sont superbes. Livraison rapide. Je recommande vivement.',
    },
    {
      n: 2,
      productId: prodId(9),
      orderId: orderId(1),
      rating: 4,
      text: 'Bonne casserole, solide et bien finie. Un peu plus lourde que prévu mais la qualité est au rendez-vous.',
    },
  ];

  for (const review of reviews) {
    await prisma.review.upsert({
      where: { buyerId_productId: { buyerId, productId: review.productId } },
      update: {},
      create: {
        id: reviewId(review.n),
        productId: review.productId,
        buyerId,
        orderId: review.orderId,
        rating: review.rating,
        text: review.text,
        status: ReviewStatus.ACTIVE,
        createdAt: new Date('2026-02-18T10:00:00Z'),
      },
    });
  }

  // Update product avgRating and totalReviews
  await prisma.product.update({
    where: { id: prodId(4) },
    data: { avgRating: 5.0, totalReviews: 1 },
  });
  await prisma.product.update({
    where: { id: prodId(9) },
    data: { avgRating: 4.0, totalReviews: 1 },
  });

  // Update seller profile avgRating (Marie: avg of 5+4 = 4.5, 2 reviews)
  const marieProfile = await prisma.sellerProfile.findUnique({ where: { userId: seller1Id } });
  if (marieProfile) {
    await prisma.sellerProfile.update({
      where: { id: marieProfile.id },
      data: { avgRating: 4.5, totalReviews: 2 },
    });
  }

  console.log(`  Seeded ${reviews.length} reviews`);

  // ----------------------------------------------------------
  // 2. WISHLISTS (buyer saves 3 products)
  // ----------------------------------------------------------
  console.log('  Seeding wishlists...');

  const wishlists = [
    { n: 1, productId: prodId(1) },  // Samsung Galaxy A14
    { n: 2, productId: prodId(3) },  // JBL Flip 5
    { n: 3, productId: prodId(7) },  // Table Basse Salon
  ];

  for (const wl of wishlists) {
    await prisma.wishlist.upsert({
      where: { userId_productId: { userId: buyerId, productId: wl.productId } },
      update: {},
      create: {
        id: wishlistId(wl.n),
        userId: buyerId,
        productId: wl.productId,
        createdAt: new Date('2026-02-20T14:00:00Z'),
      },
    });
  }

  console.log(`  Seeded ${wishlists.length} wishlist items`);

  // ----------------------------------------------------------
  // 3. CONVERSATIONS + MESSAGES
  // ----------------------------------------------------------
  console.log('  Seeding conversations...');

  // Conversation 1: buyer ↔ seller1 (Marie)
  await prisma.conversation.upsert({
    where: { buyerId_sellerId: { buyerId, sellerId: seller1Id } },
    update: {},
    create: {
      id: conversationId(1),
      buyerId,
      sellerId: seller1Id,
      lastMessageAt: new Date('2026-02-22T11:15:00Z'),
      createdAt: new Date('2026-02-22T10:30:00Z'),
    },
  });

  // Conversation 2: buyer ↔ seller2 (Patrick)
  await prisma.conversation.upsert({
    where: { buyerId_sellerId: { buyerId, sellerId: seller2Id } },
    update: {},
    create: {
      id: conversationId(2),
      buyerId,
      sellerId: seller2Id,
      lastMessageAt: new Date('2026-02-23T16:45:00Z'),
      createdAt: new Date('2026-02-23T15:00:00Z'),
    },
  });

  console.log('  Seeded 2 conversations');

  // Messages for conversation 1
  console.log('  Seeding messages...');

  const messages = [
    // Conversation 1: buyer ↔ Marie
    { n: 1, convN: 1, senderId: buyerId, content: 'Bonjour, est-ce que la robe wax modèle Kampala est toujours disponible en taille M ?', readAt: new Date('2026-02-22T10:35:00Z'), createdAt: new Date('2026-02-22T10:30:00Z') },
    { n: 2, convN: 1, senderId: seller1Id, content: 'Bonjour ! Oui, la taille M est disponible. Voulez-vous que je vous la mette de côté ?', readAt: new Date('2026-02-22T11:00:00Z'), createdAt: new Date('2026-02-22T10:45:00Z') },
    { n: 3, convN: 1, senderId: buyerId, content: 'Oui s\'il vous plaît ! Je vais passer commande tout de suite. Merci !', readAt: null, createdAt: new Date('2026-02-22T11:15:00Z') },
    // Conversation 2: buyer ↔ Patrick
    { n: 4, convN: 2, senderId: buyerId, content: 'Bonjour, le Samsung Galaxy A14 que vous vendez est-il neuf avec garantie ?', readAt: new Date('2026-02-23T15:10:00Z'), createdAt: new Date('2026-02-23T15:00:00Z') },
    { n: 5, convN: 2, senderId: seller2Id, content: 'Bonjour Jean ! Oui, c\'est un téléphone neuf avec 6 mois de garantie. On peut le livrer à Lubumbashi sous 24h.', readAt: new Date('2026-02-23T16:00:00Z'), createdAt: new Date('2026-02-23T15:30:00Z') },
    { n: 6, convN: 2, senderId: buyerId, content: 'Parfait, je vais commander. Est-ce que vous acceptez le paiement Mobile Money ?', readAt: null, createdAt: new Date('2026-02-23T16:45:00Z') },
  ];

  for (const msg of messages) {
    await prisma.message.upsert({
      where: { id: messageId(msg.n) },
      update: {},
      create: {
        id: messageId(msg.n),
        conversationId: conversationId(msg.convN),
        senderId: msg.senderId,
        content: msg.content,
        readAt: msg.readAt,
        createdAt: msg.createdAt,
      },
    });
  }

  console.log(`  Seeded ${messages.length} messages`);
  console.log('Phase 6 seeding completed!');
}

// ============================================================
// PHASE 7 SEED: Banners, Promotions, Content, Settings, Broadcasts
// ============================================================

async function seedPhase7Data(
  adminId: string,
  seller1Id: string,
  prodId: (n: number) => string,
  catId: (n: number) => string,
) {
  console.log('Seeding Phase 7 data...');

  const bannerId = (n: number) => `f0000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const promotionId = (n: number) => `f1000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const contentId = (n: number) => `f2000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const settingId = (n: number) => `f3000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const broadcastId = (n: number) => `f4000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

  // ----------------------------------------------------------
  // 1. BANNERS
  // ----------------------------------------------------------
  console.log('  Seeding banners...');

  const banners = [
    {
      n: 1,
      title: { fr: 'Bienvenue sur Teka RDC', en: 'Welcome to Teka RDC' },
      subtitle: { fr: 'Votre marketplace en ligne pour le Congo', en: 'Your online marketplace for Congo' },
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/teka/banners/hero-welcome.jpg',
      linkType: 'url',
      linkTarget: '/categories',
      status: BannerStatus.ACTIVE,
      sortOrder: 0,
      startsAt: new Date('2026-02-01T00:00:00Z'),
      endsAt: new Date('2026-12-31T23:59:59Z'),
    },
    {
      n: 2,
      title: { fr: 'Soldes de Mars', en: 'March Sale' },
      subtitle: { fr: 'Jusqu\'à -30% sur l\'électronique', en: 'Up to 30% off electronics' },
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/teka/banners/march-sale.jpg',
      linkType: 'category',
      linkTarget: catId(1),
      status: BannerStatus.SCHEDULED,
      sortOrder: 1,
      startsAt: new Date('2026-03-01T00:00:00Z'),
      endsAt: new Date('2026-03-31T23:59:59Z'),
    },
    {
      n: 3,
      title: { fr: 'Fête de l\'indépendance', en: 'Independence Day' },
      subtitle: { fr: 'Promotions spéciales pour le 30 juin', en: 'Special deals for June 30' },
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/teka/banners/independence.jpg',
      linkType: null,
      linkTarget: null,
      status: BannerStatus.EXPIRED,
      sortOrder: 2,
      startsAt: new Date('2025-06-25T00:00:00Z'),
      endsAt: new Date('2025-07-05T23:59:59Z'),
    },
  ];

  for (const banner of banners) {
    await prisma.banner.upsert({
      where: { id: bannerId(banner.n) },
      update: {},
      create: {
        id: bannerId(banner.n),
        title: banner.title,
        subtitle: banner.subtitle,
        imageUrl: banner.imageUrl,
        linkType: banner.linkType,
        linkTarget: banner.linkTarget,
        status: banner.status,
        sortOrder: banner.sortOrder,
        startsAt: banner.startsAt,
        endsAt: banner.endsAt,
        createdById: adminId,
      },
    });
  }

  console.log(`  Seeded ${banners.length} banners`);

  // ----------------------------------------------------------
  // 2. PROMOTIONS
  // ----------------------------------------------------------
  console.log('  Seeding promotions...');

  // Active platform promotion: 10% off Electronics
  await prisma.promotion.upsert({
    where: { id: promotionId(1) },
    update: {},
    create: {
      id: promotionId(1),
      type: PromotionType.PROMOTION,
      title: { fr: 'Promo Électronique', en: 'Electronics Promo' },
      description: { fr: '10% de réduction sur tous les produits électroniques', en: '10% off all electronics' },
      discountPercent: 10,
      status: PromotionStatus.ACTIVE,
      startsAt: new Date('2026-02-15T00:00:00Z'),
      endsAt: new Date('2026-03-15T23:59:59Z'),
      categoryId: catId(1),
      createdById: adminId,
      approvedById: adminId,
      approvedAt: new Date('2026-02-14T10:00:00Z'),
    },
  });

  // Active flash deal on a specific product
  await prisma.promotion.upsert({
    where: { id: promotionId(2) },
    update: {},
    create: {
      id: promotionId(2),
      type: PromotionType.FLASH_DEAL,
      title: { fr: 'Vente Flash Samsung', en: 'Samsung Flash Sale' },
      description: { fr: 'Samsung Galaxy A14 à prix réduit !', en: 'Samsung Galaxy A14 at reduced price!' },
      discountPercent: 15,
      status: PromotionStatus.ACTIVE,
      startsAt: new Date('2026-02-26T08:00:00Z'),
      endsAt: new Date('2026-03-05T23:59:59Z'),
      productId: prodId(1),
      createdById: adminId,
      approvedById: adminId,
      approvedAt: new Date('2026-02-25T16:00:00Z'),
    },
  });

  // Seller-submitted pending promotion
  await prisma.promotion.upsert({
    where: { id: promotionId(3) },
    update: {},
    create: {
      id: promotionId(3),
      type: PromotionType.PROMOTION,
      title: { fr: 'Soldes Boutique Marie', en: 'Boutique Marie Sale' },
      description: { fr: 'Réduction sur les robes wax', en: 'Discount on wax dresses' },
      discountPercent: 20,
      status: PromotionStatus.PENDING_APPROVAL,
      startsAt: new Date('2026-03-01T00:00:00Z'),
      endsAt: new Date('2026-03-15T23:59:59Z'),
      productId: prodId(4),
      createdById: seller1Id,
    },
  });

  console.log('  Seeded 3 promotions');

  // ----------------------------------------------------------
  // 3. CONTENT PAGES
  // ----------------------------------------------------------
  console.log('  Seeding content pages...');

  const contentPages = [
    {
      n: 1,
      slug: 'faq',
      title: { fr: 'Foire aux questions', en: 'Frequently Asked Questions' },
      content: {
        fr: '## Comment passer une commande ?\n\nParcourez nos produits, ajoutez au panier et suivez le processus de commande.\n\n## Quels sont les modes de paiement ?\n\nNous acceptons Mobile Money (M-Pesa, Airtel Money, Orange Money) et le paiement à la livraison.\n\n## Quel est le délai de livraison ?\n\nLa livraison se fait généralement sous 24 à 72 heures selon votre localisation.\n\n## Comment contacter le service client ?\n\nVous pouvez nous joindre via WhatsApp au +243 999 000 000 ou par email à support@teka.cd.',
        en: '## How to place an order?\n\nBrowse our products, add to cart and follow the checkout process.\n\n## What are the payment methods?\n\nWe accept Mobile Money (M-Pesa, Airtel Money, Orange Money) and Cash on Delivery.\n\n## What is the delivery time?\n\nDelivery is usually within 24 to 72 hours depending on your location.\n\n## How to contact customer service?\n\nYou can reach us via WhatsApp at +243 999 000 000 or by email at support@teka.cd.',
      },
      status: ContentPageStatus.PUBLISHED,
      sortOrder: 1,
    },
    {
      n: 2,
      slug: 'terms',
      title: { fr: 'Conditions générales d\'utilisation', en: 'Terms and Conditions' },
      content: {
        fr: '## 1. Acceptation des conditions\n\nEn utilisant la plateforme Teka RDC, vous acceptez les présentes conditions générales d\'utilisation.\n\n## 2. Inscription\n\nL\'inscription est ouverte à toute personne physique majeure résidant en République Démocratique du Congo.\n\n## 3. Commandes et paiements\n\nToute commande passée sur la plateforme constitue un contrat de vente entre l\'acheteur et le vendeur. Teka RDC agit en tant qu\'intermédiaire.\n\n## 4. Livraison\n\nLes délais de livraison sont indicatifs et peuvent varier selon la zone de livraison.\n\n## 5. Retours et remboursements\n\nLes retours sont acceptés dans un délai de 7 jours après réception du produit.',
        en: '## 1. Acceptance of Terms\n\nBy using the Teka RDC platform, you agree to these terms and conditions.\n\n## 2. Registration\n\nRegistration is open to any adult individual residing in the Democratic Republic of Congo.\n\n## 3. Orders and Payments\n\nAny order placed on the platform constitutes a sales contract between the buyer and the seller. Teka RDC acts as an intermediary.\n\n## 4. Delivery\n\nDelivery times are indicative and may vary depending on the delivery area.\n\n## 5. Returns and Refunds\n\nReturns are accepted within 7 days of receiving the product.',
      },
      status: ContentPageStatus.PUBLISHED,
      sortOrder: 2,
    },
    {
      n: 3,
      slug: 'privacy',
      title: { fr: 'Politique de confidentialité', en: 'Privacy Policy' },
      content: {
        fr: '## Collecte des données\n\nNous collectons uniquement les données nécessaires au bon fonctionnement de la plateforme : numéro de téléphone, nom, adresses de livraison.\n\n## Utilisation des données\n\nVos données sont utilisées pour traiter vos commandes, améliorer nos services et vous envoyer des notifications importantes.\n\n## Protection des données\n\nNous mettons en œuvre des mesures de sécurité appropriées pour protéger vos données personnelles.\n\n## Vos droits\n\nVous avez le droit d\'accéder, modifier ou supprimer vos données personnelles à tout moment.',
        en: '## Data Collection\n\nWe only collect data necessary for the proper functioning of the platform: phone number, name, delivery addresses.\n\n## Data Usage\n\nYour data is used to process your orders, improve our services and send you important notifications.\n\n## Data Protection\n\nWe implement appropriate security measures to protect your personal data.\n\n## Your Rights\n\nYou have the right to access, modify or delete your personal data at any time.',
      },
      status: ContentPageStatus.PUBLISHED,
      sortOrder: 3,
    },
    {
      n: 4,
      slug: 'help',
      title: { fr: 'Centre d\'aide', en: 'Help Center' },
      content: {
        fr: '## Besoin d\'aide ?\n\nNotre équipe est disponible pour vous aider du lundi au samedi, de 8h à 18h.\n\n### WhatsApp\n+243 999 000 000\n\n### Email\nsupport@teka.cd\n\n### Adresse\nAvenue Lumumba, Lubumbashi, Haut-Katanga, RDC',
        en: '## Need Help?\n\nOur team is available to help you Monday to Saturday, 8am to 6pm.\n\n### WhatsApp\n+243 999 000 000\n\n### Email\nsupport@teka.cd\n\n### Address\nAvenue Lumumba, Lubumbashi, Haut-Katanga, DRC',
      },
      status: ContentPageStatus.PUBLISHED,
      sortOrder: 4,
    },
    {
      n: 5,
      slug: 'about',
      title: { fr: 'À propos de Teka RDC', en: 'About Teka RDC' },
      content: {
        fr: 'Teka RDC est une plateforme de commerce en ligne dédiée à la République Démocratique du Congo. Notre mission est de connecter acheteurs et vendeurs à travers les provinces du Haut-Katanga et du Lualaba.',
        en: 'Teka RDC is an online commerce platform dedicated to the Democratic Republic of Congo. Our mission is to connect buyers and sellers across the Haut-Katanga and Lualaba provinces.',
      },
      status: ContentPageStatus.PUBLISHED,
      sortOrder: 5,
    },
    {
      n: 6,
      slug: 'contact',
      title: { fr: 'Contactez-nous', en: 'Contact Us' },
      content: {
        fr: '## Contactez Teka RDC\n\nNous sommes là pour vous aider !\n\n**WhatsApp :** +243 999 000 000\n\n**Email :** support@teka.cd\n\n**Adresse :** Lubumbashi, Haut-Katanga, RD Congo\n\n**Horaires :** Lundi - Samedi, 8h00 - 18h00\n\nPour toute question sur vos commandes, livraisons ou votre compte, n\'hésitez pas à nous contacter.',
        en: '## Contact Teka RDC\n\nWe are here to help!\n\n**WhatsApp:** +243 999 000 000\n\n**Email:** support@teka.cd\n\n**Address:** Lubumbashi, Haut-Katanga, DR Congo\n\n**Hours:** Monday - Saturday, 8:00 AM - 6:00 PM\n\nFor any questions about your orders, deliveries, or account, don\'t hesitate to contact us.',
      },
      status: ContentPageStatus.PUBLISHED,
      sortOrder: 6,
    },
    {
      n: 7,
      slug: 'how-to-buy',
      title: { fr: 'Comment acheter', en: 'How to Buy' },
      content: {
        fr: '## Comment acheter sur Teka RDC\n\n### 1. Choisissez votre ville\nSélectionnez Lubumbashi ou Kolwezi pour voir les produits disponibles près de chez vous.\n\n### 2. Parcourez les produits\nNaviguez par catégorie ou utilisez la barre de recherche.\n\n### 3. Ajoutez au panier\nCliquez sur \"Ajouter au panier\" sur les produits qui vous intéressent.\n\n### 4. Passez commande\nEntrez votre adresse de livraison et choisissez votre mode de paiement :\n- **Mobile Money** (M-Pesa, Airtel Money, Orange Money)\n- **Paiement à la livraison** (espèces)\n\n### 5. Recevez votre commande\nVotre commande sera livrée dans un délai de 24 à 72 heures.',
        en: '## How to Buy on Teka RDC\n\n### 1. Choose your city\nSelect Lubumbashi or Kolwezi to see products available near you.\n\n### 2. Browse products\nNavigate by category or use the search bar.\n\n### 3. Add to cart\nClick "Add to cart" on products you\'re interested in.\n\n### 4. Place your order\nEnter your delivery address and choose your payment method:\n- **Mobile Money** (M-Pesa, Airtel Money, Orange Money)\n- **Cash on Delivery**\n\n### 5. Receive your order\nYour order will be delivered within 24 to 72 hours.',
      },
      status: ContentPageStatus.PUBLISHED,
      sortOrder: 7,
    },
    {
      n: 8,
      slug: 'how-to-sell',
      title: { fr: 'Comment vendre', en: 'How to Sell' },
      content: {
        fr: '## Comment vendre sur Teka RDC\n\n### 1. Créez votre compte vendeur\nInscrivez-vous avec votre numéro de téléphone et soumettez votre demande vendeur avec vos informations commerciales.\n\n### 2. Attendez l\'approbation\nNotre équipe vérifie votre profil sous 24-48 heures.\n\n### 3. Ajoutez vos produits\nPubliez vos produits avec photos, descriptions en français et prix en francs congolais (CDF).\n\n### 4. Gérez vos commandes\nRecevez les commandes, confirmez-les et organisez la livraison.\n\n### 5. Recevez vos paiements\nVos revenus sont crédités sur votre portefeuille Teka. Demandez un virement vers votre compte Mobile Money à tout moment.\n\n**Commission :** Teka prélève une commission de 10% sur chaque vente.',
        en: '## How to Sell on Teka RDC\n\n### 1. Create your seller account\nSign up with your phone number and submit your seller application with your business information.\n\n### 2. Wait for approval\nOur team reviews your profile within 24-48 hours.\n\n### 3. Add your products\nList your products with photos, French descriptions, and prices in Congolese francs (CDF).\n\n### 4. Manage your orders\nReceive orders, confirm them, and arrange delivery.\n\n### 5. Get paid\nYour earnings are credited to your Teka wallet. Request a payout to your Mobile Money account anytime.\n\n**Commission:** Teka takes a 10% commission on each sale.',
      },
      status: ContentPageStatus.PUBLISHED,
      sortOrder: 8,
    },
  ];

  for (const page of contentPages) {
    await prisma.contentPage.upsert({
      where: { slug: page.slug },
      update: {},
      create: {
        id: contentId(page.n),
        slug: page.slug,
        title: page.title,
        content: page.content,
        status: page.status,
        sortOrder: page.sortOrder,
        updatedById: adminId,
      },
    });
  }

  console.log(`  Seeded ${contentPages.length} content pages`);

  // ----------------------------------------------------------
  // 4. SYSTEM SETTINGS
  // ----------------------------------------------------------
  console.log('  Seeding system settings...');

  const settings = [
    { n: 1, key: 'MAINTENANCE_MODE', value: 'false', type: 'boolean', label: { fr: 'Mode maintenance', en: 'Maintenance Mode' } },
    { n: 2, key: 'ENABLE_FLASH_DEALS', value: 'true', type: 'boolean', label: { fr: 'Activer les ventes flash', en: 'Enable Flash Deals' } },
    { n: 3, key: 'ENABLE_SELLER_PROMOTIONS', value: 'true', type: 'boolean', label: { fr: 'Activer les promotions vendeur', en: 'Enable Seller Promotions' } },
    { n: 4, key: 'ENABLE_REVIEWS', value: 'true', type: 'boolean', label: { fr: 'Activer les avis', en: 'Enable Reviews' } },
    { n: 5, key: 'ENABLE_MESSAGING', value: 'true', type: 'boolean', label: { fr: 'Activer la messagerie', en: 'Enable Messaging' } },
    { n: 6, key: 'MAX_BANNER_COUNT', value: '5', type: 'number', label: { fr: 'Nombre max de bannières', en: 'Max Banner Count' } },
    { n: 7, key: 'DEFAULT_DELIVERY_FEE_CDF', value: '500000', type: 'number', label: { fr: 'Frais de livraison par défaut (centimes CDF)', en: 'Default Delivery Fee (CDF centimes)' } },
    { n: 8, key: 'PLATFORM_ANNOUNCEMENT', value: '', type: 'string', label: { fr: 'Annonce plateforme', en: 'Platform Announcement' } },
  ];

  for (const setting of settings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: {
        id: settingId(setting.n),
        key: setting.key,
        value: setting.value,
        type: setting.type,
        label: setting.label,
        updatedById: adminId,
      },
    });
  }

  console.log(`  Seeded ${settings.length} system settings`);

  // ----------------------------------------------------------
  // 5. NOTIFICATION BROADCASTS
  // ----------------------------------------------------------
  console.log('  Seeding notification broadcasts...');

  await prisma.notificationBroadcast.upsert({
    where: { id: broadcastId(1) },
    update: {},
    create: {
      id: broadcastId(1),
      title: 'Lancement Teka RDC',
      message: 'Bienvenue sur Teka RDC ! Votre marketplace en ligne pour le Congo. Découvrez nos produits sur teka.cd',
      segment: 'ALL_USERS',
      status: NotificationBroadcastStatus.SENT,
      recipientCount: 3,
      sentCount: 3,
      failedCount: 0,
      sentAt: new Date('2026-02-01T10:00:00Z'),
      createdById: adminId,
    },
  });

  await prisma.notificationBroadcast.upsert({
    where: { id: broadcastId(2) },
    update: {},
    create: {
      id: broadcastId(2),
      title: 'Promo Mars',
      message: 'Ne manquez pas nos soldes de mars ! Jusqu\'à -30% sur l\'électronique. Visitez teka.cd',
      segment: 'ALL_BUYERS',
      status: NotificationBroadcastStatus.DRAFT,
      recipientCount: 0,
      sentCount: 0,
      failedCount: 0,
      createdById: adminId,
    },
  });

  console.log('  Seeded 2 notification broadcasts');
  console.log('Phase 7 seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
