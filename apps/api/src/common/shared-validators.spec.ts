import * as shared from '@teka/shared';
import {
  checkoutSchema,
  createBannerSchema,
  createProductSchema,
  createPromotionSchema,
  emailLoginSchema,
  emailSchema,
  forceStatusSchema,
  initiatePaymentSchema,
  orderQuerySchema,
  paginationSchema,
  requestPayoutSchema,
  updateBannerSchema,
  updateProductSchema,
  uuidSchema,
} from '@teka/shared';

/**
 * @teka/shared validators on Zod 4 (zod 3 → 4.6.7 security upgrade).
 *
 * Pins the behaviour clients relied on under Zod 3: French enum messages,
 * PATCH schemas that inject no defaults, the 8-4-4-4-12 identifier shape the
 * seeded (non-RFC 4122) ids use, the email acceptance set, banner URLs
 * returned verbatim, and money prices as arbitrary-precision digit strings.
 * Numeric integer fields (stock, sortOrder, discountCDF, pagination) are now
 * bounded to the safe range (Zod 4 `.int()`), which every legitimate value
 * of those fields sits well inside; string prices are not bounded by it.
 */

const firstMessage = (r: { success: boolean; error?: { issues: Array<{ message: string }> } }) =>
  r.success ? undefined : r.error!.issues[0].message;

const VALID_GUID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

describe('@teka/shared validators (Zod 4)', () => {
  describe('public schema exports', () => {
    const INVENTORY = [
      // phone
      'phoneSchema', 'phoneOptionalSchema',
      // common
      'emailSchema', 'paginationSchema', 'uuidSchema', 'translatableTextSchema',
      // auth
      'passwordSchema', 'emailLoginSchema', 'emailRegisterSchema', 'passwordResetRequestSchema',
      'passwordResetConfirmSchema', 'refreshTokenSchema', 'buyerOtpRequestSchema', 'buyerOtpVerifySchema',
      'buyerOtpResendSchema', 'buyerClaimRequestSchema', 'buyerClaimVerifySchema', 'sellerMigrateCheckSchema',
      'sellerMigrateLinkEmailSchema', 'sellerPasswordSetupSchema',
      // product
      'createCategorySchema', 'updateCategorySchema', 'createProductSchema', 'updateProductSchema',
      'browseProductsSchema', 'createAttributeSchema',
      // cart
      'addToCartSchema', 'updateCartItemSchema', 'mergeCartSchema',
      // order
      'checkoutSchema', 'cancelOrderSchema', 'rejectOrderSchema', 'forceStatusSchema', 'orderQuerySchema',
      // payment
      'initiatePaymentSchema', 'requestPayoutSchema', 'commissionSettingSchema', 'rejectPayoutSchema',
      // review
      'createReviewSchema', 'reviewQuerySchema',
      // messaging
      'sendMessageSchema', 'conversationQuerySchema', 'messagesQuerySchema',
      // platform
      'createBannerSchema', 'updateBannerSchema', 'createPromotionSchema', 'sellerCreatePromotionSchema',
      'promotionQuerySchema', 'upsertContentSchema', 'updateSettingSchema', 'createBroadcastSchema',
      'reportQuerySchema', 'trendQuerySchema',
    ].sort();

    it('exports exactly the historical schema set, each a parseable schema', () => {
      const exported = Object.keys(shared).filter((k) => k.endsWith('Schema')).sort();
      expect(exported).toEqual(INVENTORY);
      for (const name of INVENTORY) {
        const schema = (shared as unknown as Record<string, any>)[name];
        expect(typeof schema.safeParse).toBe('function');
        expect(typeof schema.parse).toBe('function');
      }
    });

    it('supported parsing still returns typed data', () => {
      expect(paginationSchema.parse({})).toEqual({ page: 1, limit: 20 });
      expect(paginationSchema.parse({ page: '2', limit: '50' })).toEqual({ page: 2, limit: 50 });
      expect(
        checkoutSchema.parse({ deliveryAddressId: VALID_GUID, paymentMethod: 'COD', idempotencyKey: VALID_GUID }),
      ).toEqual({ deliveryAddressId: VALID_GUID, paymentMethod: 'COD', idempotencyKey: VALID_GUID });
      expect(shared.phoneSchema.parse('+243999000101')).toBe('+243999000101');
    });
  });

  describe('French enum messages (Zod 3 errorMap → Zod 4 error)', () => {
    it.each([
      ['checkout paymentMethod', checkoutSchema.shape.paymentMethod, 'Mode de paiement invalide'],
      ['forceStatus status', forceStatusSchema.shape.status, 'Statut de commande invalide'],
      ['orderQuery status', orderQuerySchema.shape.status, 'Statut de commande invalide'],
      ['initiatePayment provider', initiatePaymentSchema.shape.mobileMoneyProvider, 'Opérateur Mobile Money invalide'],
      ['requestPayout method', requestPayoutSchema.shape.payoutMethod, 'Méthode de paiement invalide'],
    ])('%s rejects an unknown value in French', (_label, schema, message) => {
      expect(firstMessage(schema.safeParse('BITCOIN'))).toBe(message);
      expect(firstMessage(schema.safeParse(42))).toBe(message);
    });

    it('required enums are French when missing too; the optional one stays optional', () => {
      expect(firstMessage(checkoutSchema.shape.paymentMethod.safeParse(undefined))).toBe('Mode de paiement invalide');
      expect(firstMessage(forceStatusSchema.shape.status.safeParse(undefined))).toBe('Statut de commande invalide');
      expect(orderQuerySchema.safeParse({}).success).toBe(true);
    });
  });

  describe('PATCH schemas inject no defaults', () => {
    it('an empty banner PATCH stays empty (no status / sortOrder reset)', () => {
      expect(updateBannerSchema.parse({})).toEqual({});
      expect(updateBannerSchema.parse({ title: 'Soldes' })).toEqual({ title: 'Soldes' });
      expect(updateBannerSchema.parse({ status: 'ACTIVE', sortOrder: 3 })).toEqual({ status: 'ACTIVE', sortOrder: 3 });
      expect(updateBannerSchema.safeParse({ status: 'ARCHIVED' }).success).toBe(false);
      expect(updateBannerSchema.safeParse({ sortOrder: -1 }).success).toBe(false);
    });

    it('banner creation still applies DRAFT / 0', () => {
      const created = createBannerSchema.parse({ title: 'Soldes', imageUrl: 'https://res.cloudinary.com/teka/a.webp' });
      expect(created.status).toBe('DRAFT');
      expect(created.sortOrder).toBe(0);
    });

    it('an empty product PATCH stays empty', () => {
      expect(updateProductSchema.parse({})).toEqual({});
    });
  });

  describe('banner URLs: Zod 3 `new URL(input)` acceptance, value returned verbatim', () => {
    const banner = { title: 'Soldes', imageUrl: 'https://res.cloudinary.com/teka/a.webp' };

    it('an ordinary URL is accepted unchanged on create and PATCH', () => {
      const created = createBannerSchema.parse({ ...banner, linkUrl: 'https://teka.cd/lubumbashi?promo=1' });
      expect(created.imageUrl).toBe('https://res.cloudinary.com/teka/a.webp');
      expect(created.linkUrl).toBe('https://teka.cd/lubumbashi?promo=1');
      expect(updateBannerSchema.parse({ linkUrl: 'https://teka.cd/' })).toEqual({ linkUrl: 'https://teka.cd/' });
    });

    it('surrounding whitespace the URL constructor accepts is kept verbatim, not trimmed', () => {
      const imageUrl = '  https://res.cloudinary.com/teka/a.webp\n';
      const linkUrl = '\thttps://teka.cd/kolwezi ';
      const created = createBannerSchema.parse({ ...banner, imageUrl, linkUrl });
      expect(created.imageUrl).toBe(imageUrl);
      expect(created.linkUrl).toBe(linkUrl);
      expect(updateBannerSchema.parse({ imageUrl })).toEqual({ imageUrl });
    });

    it('an invalid URL is refused, imageUrl in French; linkUrl stays optional', () => {
      for (const imageUrl of ['', 'pas une url', 'res.cloudinary.com/teka/a.webp', 'https://']) {
        expect(firstMessage(createBannerSchema.safeParse({ ...banner, imageUrl }))).toBe("URL d'image invalide");
      }
      expect(firstMessage(updateBannerSchema.safeParse({ imageUrl: 'pas une url' }))).toBe("URL d'image invalide");
      expect(createBannerSchema.safeParse({ ...banner, linkUrl: 'pas une url' }).success).toBe(false);
      expect(createBannerSchema.parse(banner)).not.toHaveProperty('linkUrl');
    });
  });

  describe('identifiers: the Zod 3 8-4-4-4-12 shape, not RFC 9562 strict', () => {
    it.each([
      '10000000-0000-0000-0000-000000999999', // Teka RDC Officiel seller
      '16000000-0000-0000-0000-000000000001', // product-type category range
      '00000000-0000-0000-0000-000000000000',
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
      VALID_GUID,
      'DDDDDDDD-DDDD-4DDD-8DDD-DDDDDDDDDDDD',
    ])('accepts %s', (id) => {
      expect(uuidSchema.safeParse(id).success).toBe(true);
      expect(checkoutSchema.shape.deliveryAddressId.safeParse(id).success).toBe(true);
    });

    it.each([
      '',
      'not-a-uuid',
      'dddddddddddd4ddd8ddddddddddddddddd',
      'dddddddd-dddd-4ddd-8ddd-ddddddddddd',
      'dddddddd-dddd-4ddd-8ddd-ddddddddddddd',
      'gggggggg-dddd-4ddd-8ddd-dddddddddddd',
      '{dddddddd-dddd-4ddd-8ddd-dddddddddddd}',
      ' dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd\n',
      "dddddddd-dddd-4ddd-8ddd-dddddddddddd' OR '1'='1",
    ])('rejects %j in French', (id) => {
      expect(firstMessage(uuidSchema.safeParse(id))).toBe('Identifiant invalide');
    });

    it('optional identifiers stay optional and nullable where they were', () => {
      expect(createPromotionSchema.safeParse({
        type: 'PROMOTION', title: 'Promo', discountPercent: 10,
        startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-10-31T00:00:00Z',
      }).success).toBe(true);
      expect(createProductSchema.shape.cityId.safeParse(null).success).toBe(true);
      expect(createProductSchema.shape.cityId.safeParse(undefined).success).toBe(true);
    });
  });

  describe('email acceptance is unchanged', () => {
    it.each(['marie@example.cd', "o'brien@exemple.cd", 'a+b@x.co', 'Jean.Kabila@Teka.CD', 'a_b-c@sous.domaine.cd'])(
      'accepts %s',
      (email) => expect(emailSchema.safeParse(email).success).toBe(true),
    );

    it.each(['', 'marie', 'marie@', '@example.cd', '.marie@example.cd', 'ma..rie@example.cd', 'marie@example', 'marie@example.c', 'ma rie@example.cd'])(
      'rejects %j in French',
      (email) => expect(firstMessage(emailSchema.safeParse(email))).toBe('Adresse email invalide'),
    );

    it('auth email is trimmed and lower-cased before the format check', () => {
      expect(emailLoginSchema.parse({ email: '  Marie@Example.CD ', password: 'x' }).email).toBe('marie@example.cd');
      expect(firstMessage(emailLoginSchema.safeParse({ email: ' pas-un-email ', password: 'x' }))).toBe(
        'Adresse email invalide',
      );
    });
  });

  describe('numbers: integer fields are safe integers; prices stay arbitrary-precision strings', () => {
    const product = {
      title: 'Téléphone',
      description: 'Neuf, sous garantie',
      categoryId: '16000000-0000-0000-0000-000000000001',
      priceCDF: '2500000',
      condition: 'NEW' as const,
    };

    it('stock accepts 0 … MAX_SAFE_INTEGER and refuses unsafe / fractional / negative values', () => {
      for (const quantity of [0, 1, 250, Number.MAX_SAFE_INTEGER]) {
        expect(createProductSchema.safeParse({ ...product, quantity }).success).toBe(true);
      }
      for (const quantity of [Number.MAX_SAFE_INTEGER + 1, 1e20, 1.5, -1, Infinity, NaN]) {
        expect(createProductSchema.safeParse({ ...product, quantity }).success).toBe(false);
      }
      expect(firstMessage(createProductSchema.safeParse({ ...product, quantity: -1 }))).toBe(
        'La quantité ne peut pas être négative',
      );
    });

    it('a CDF price far beyond Number precision is accepted verbatim as a string', () => {
      const huge = '123456789012345678901234567890';
      const parsed = createProductSchema.parse({ ...product, priceCDF: huge, priceUSD: huge, quantity: 1 });
      expect(parsed.priceCDF).toBe(huge);
      expect(parsed.priceUSD).toBe(huge);
      expect(firstMessage(createProductSchema.safeParse({ ...product, priceCDF: '12.5', quantity: 1 }))).toBe(
        'Le prix CDF doit être un nombre entier positif',
      );
      expect(createProductSchema.safeParse({ ...product, priceCDF: 2500000, quantity: 1 }).success).toBe(false);
    });

    it('discountCDF / sortOrder / pagination are bounded to the safe range', () => {
      const promo = { type: 'PROMOTION', title: 'Promo', startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-10-31T00:00:00Z' };
      expect(createPromotionSchema.safeParse({ ...promo, discountCDF: Number.MAX_SAFE_INTEGER }).success).toBe(true);
      expect(createPromotionSchema.safeParse({ ...promo, discountCDF: 2 ** 53 }).success).toBe(false);
      expect(updateBannerSchema.safeParse({ sortOrder: 2 ** 53 }).success).toBe(false);
      expect(paginationSchema.safeParse({ page: '9007199254740993' }).success).toBe(false);
      expect(paginationSchema.parse({ page: String(Number.MAX_SAFE_INTEGER) }).page).toBe(Number.MAX_SAFE_INTEGER);
    });
  });
});
