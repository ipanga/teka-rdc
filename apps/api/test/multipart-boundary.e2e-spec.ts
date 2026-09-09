import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { createTestApp, mockPrismaService, resetMocks } from './test-utils';

/**
 * The multipart boundary — every request here is parsed by the REAL multer
 * (busboy) chain behind Nest's FileInterceptor, exactly as in production.
 *
 * Written for the multer 2.2.0 → 2.3.0 security pin (GHSA-wc9g-mqfw-jrwm,
 * GHSA-qfvm-cv95-jqjf, GHSA-535w-7cp7-47q4, GHSA-qvfw-j98x-7q72; 2026-09-09).
 * On 2.2.0 the first payload below killed the API process with an uncaught
 * `RangeError: Invalid array length`, and the second pinned the event loop
 * for minutes. Both must now be a French 400 answered in milliseconds, and
 * nothing that reaches multer may ever surface as a 5xx.
 *
 * No request in this file reaches Cloudinary: every body is refused by
 * multer, by the guards, or by Teka's byte-level validation first.
 */
const BUYER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SELLER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PRODUCT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const USERS: Record<string, Record<string, unknown>> = {
  [BUYER]: { id: BUYER, role: 'BUYER', status: 'ACTIVE', phone: '+243999000101', email: null, deletedAt: null },
  [SELLER]: { id: SELLER, role: 'SELLER', status: 'ACTIVE', phone: '+243999000102', email: 'marie@example.cd', deletedAt: null },
};

const FIVE_MB = 5 * 1024 * 1024;
const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

const AVATAR = '/api/v1/users/avatar';
const PRODUCT_IMAGE = `/api/v1/sellers/products/${PRODUCT}/images`;
const VERIFICATION_DOC = '/api/v1/sellers/verification/documents';
const APPLICATION_DOC = '/api/v1/sellers/documents';

/** A hand-built multipart body so the crafted parts are byte-exact. */
function multipart(boundary: string, parts: Array<{ name: string; value?: string; filename?: string; type?: string; bytes?: Buffer }>): Buffer {
  const chunks: Buffer[] = [];
  for (const p of parts) {
    const disposition = `Content-Disposition: form-data; name="${p.name}"` + (p.filename !== undefined ? `; filename="${p.filename}"` : '');
    const head = [`--${boundary}`, disposition, ...(p.type ? [`Content-Type: ${p.type}`] : []), '', ''].join('\r\n');
    chunks.push(Buffer.from(head), p.bytes ?? Buffer.from(p.value ?? ''), Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(chunks);
}

describe('Multipart boundary (e2e) — multer 2.3.0 pin', () => {
  let app: INestApplication;
  let buyerToken: string;
  let sellerToken: string;

  const server = () => app.getHttpServer();
  const asBuyer = () => ({ Authorization: `Bearer ${buyerToken}`, 'X-Teka-Surface': 'buyer' });
  const asSeller = () => ({ Authorization: `Bearer ${sellerToken}`, 'X-Teka-Surface': 'seller' });

  beforeAll(async () => {
    app = await createTestApp();
    const jwt = app.get(JwtService, { strict: false });
    buyerToken = jwt.sign({ sub: BUYER, role: 'BUYER', phone: '+243999000101', jti: 'e2e-buyer' });
    sellerToken = jwt.sign({ sub: SELLER, role: 'SELLER', phone: '+243999000102', jti: 'e2e-seller' });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetMocks();
    mockPrismaService.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve(USERS[where.id] ?? null));
    // Product-image path: the product exists and has room, so a rejection can
    // only come from the multipart boundary itself.
    const m = mockPrismaService as Record<string, any>;
    m.product.findUnique.mockResolvedValue({ id: PRODUCT, sellerId: SELLER, deletedAt: null });
    m.productImage ??= {};
    m.productImage.count ??= jest.fn();
    m.productImage.count.mockResolvedValue(0);
  });

  const expectRejected = (res: request.Response, status: number) => {
    expect(res.status).toBe(status);
    expect(res.body).toMatchObject({ success: false, error: { status } });
    expect(typeof res.body.error.message).toBe('string');
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.js:\d+|node_modules|MulterError/);
  };

  describe('crafted field names (the 2.2.0 process crash and event-loop pin)', () => {
    it('a max-index field followed by an append field is a French 400, and the server keeps answering', async () => {
      const boundary = 'teka-boundary';
      const body = multipart(boundary, [
        { name: 'a[4294967294]', value: 'x' },
        { name: 'a[]', value: 'y' },
      ]);
      const res = await request(server())
        .post(AVATAR)
        .set(asBuyer())
        .set('Content-Type', `multipart/form-data; boundary=${boundary}`)
        .send(body);
      expectRejected(res, 400);
      expect(res.body.error.message).toBe('Requête multipart invalide');

      // Still alive: the next request is handled normally.
      const after = await request(server()).post(AVATAR).set(asBuyer()).send({ hello: 'world' });
      expectRejected(after, 400);
      expect(after.body.error.message).toBe('Aucun fichier reçu');
    });

    it('an oversized array index is refused in milliseconds on every multipart endpoint', async () => {
      const boundary = 'teka-boundary';
      const cases: Array<[string, Record<string, string>, string]> = [
        [AVATAR, asBuyer(), 'image'],
        [PRODUCT_IMAGE, asSeller(), 'image'],
        [VERIFICATION_DOC, asSeller(), 'document'],
        [APPLICATION_DOC, asSeller(), 'document'],
      ];
      for (const [url, auth, fileField] of cases) {
        const body = multipart(boundary, [
          { name: 'items[4294967294]', value: 'x' },
          { name: 'items[foo]', value: 'y' },
          { name: fileField, filename: 'a.png', type: 'image/png', bytes: PNG_HEAD },
        ]);
        const started = Date.now();
        const res = await request(server())
          .post(url)
          .set(auth)
          .set('Content-Type', `multipart/form-data; boundary=${boundary}`)
          .send(body);
        expect(Date.now() - started).toBeLessThan(2000);
        expectRejected(res, 400);
        expect(res.body.error.message).toBe('Requête multipart invalide');
      }
    });

    it('a field name above busboy\'s 100-byte cap is a 400, not a 500', async () => {
      const res = await request(server())
        .post(AVATAR)
        .set(asBuyer())
        .field('x'.repeat(200), 'v')
        .attach('image', PNG_HEAD, { filename: 'a.png', contentType: 'image/png' });
      expectRejected(res, 400);
    });
  });

  describe('size limits (streaming, before any buffering above the cap)', () => {
    it('5 MB + 1 byte is the French 413 on images and documents', async () => {
      const oversized = Buffer.concat([PNG_HEAD, Buffer.alloc(FIVE_MB + 1 - PNG_HEAD.length)]);
      for (const [url, auth, field] of [
        [AVATAR, asBuyer(), 'image'],
        [PRODUCT_IMAGE, asSeller(), 'image'],
        [VERIFICATION_DOC, asSeller(), 'document'],
        [APPLICATION_DOC, asSeller(), 'document'],
      ] as const) {
        const res = await request(server())
          .post(url)
          .set(auth)
          .field('type', 'RCCM')
          .attach(field, oversized, { filename: 'big.png', contentType: 'image/png' });
        expectRejected(res, 413);
        expect(res.body.error.message).toBe('Le fichier dépasse la taille maximale autorisée');
      }
    });

    it('exactly 5 MB passes multer (2.3.0 accepts files AT the limit) and Teka\'s byte check still decides', async () => {
      // Non-image bytes of exactly the limit: multer no longer refuses them,
      // so the answer must come from validateImageUpload — a 400, not a 413.
      const exact = Buffer.alloc(FIVE_MB, 0x41);
      const res = await request(server())
        .post(AVATAR)
        .set(asBuyer())
        .attach('image', exact, { filename: 'exact.bin', contentType: 'image/png' });
      expectRejected(res, 400);
      expect(res.body.error.message).toBe('Format invalide — image attendue (jpg, png, webp)');
    });
  });

  describe('content and structure', () => {
    it('SVG declared as PNG and PNG bytes declared as JPEG are refused from the bytes', async () => {
      const svg = await request(server())
        .post(AVATAR)
        .set(asBuyer())
        .attach('image', SVG, { filename: 'a.png', contentType: 'image/png' });
      expectRejected(svg, 400);
      expect(svg.body.error.message).toBe('Format invalide — image attendue (jpg, png, webp)');

      const forged = await request(server())
        .post(AVATAR)
        .set(asBuyer())
        .attach('image', PNG_HEAD, { filename: 'a.jpg', contentType: 'image/jpeg' });
      expectRejected(forged, 400);
      expect(forged.body.error.message).toBe('Le contenu du fichier ne correspond pas à son format déclaré');
    });

    it('an empty file is a 400 on images and on documents', async () => {
      const avatar = await request(server())
        .post(AVATAR)
        .set(asBuyer())
        .attach('image', Buffer.alloc(0), { filename: 'empty.png', contentType: 'image/png' });
      expectRejected(avatar, 400);

      const doc = await request(server())
        .post(APPLICATION_DOC)
        .set(asSeller())
        .attach('document', Buffer.alloc(0), { filename: 'empty.pdf', contentType: 'application/pdf' });
      expectRejected(doc, 400);
      // multer hands an empty buffer to the service; the byte sniff refuses it.
      expect(doc.body.error.message).toBe('Format non supporté. Formats acceptés : JPEG, PNG, WebP.');
    });

    it('a JSON body on an upload route is « Aucun fichier reçu », not a parser error', async () => {
      const res = await request(server()).post(AVATAR).set(asBuyer()).send({ image: 'data:image/png;base64,AAAA' });
      expectRejected(res, 400);
      expect(res.body.error.message).toBe('Aucun fichier reçu');
    });

    it('multipart without a boundary is a 400', async () => {
      const res = await request(server())
        .post(AVATAR)
        .set(asBuyer())
        .set('Content-Type', 'multipart/form-data')
        .send(Buffer.from('--x\r\nContent-Disposition: form-data; name="image"; filename="a.png"\r\n\r\nabc\r\n--x--\r\n'));
      expectRejected(res, 400);
    });

    it('a truncated multipart body (aborted upload) is a 400', async () => {
      const boundary = 'teka-boundary';
      const full = multipart(boundary, [{ name: 'image', filename: 'a.png', type: 'image/png', bytes: Buffer.concat([PNG_HEAD, Buffer.alloc(4096)]) }]);
      const truncated = full.subarray(0, Math.floor(full.length / 2));
      const res = await request(server())
        .post(AVATAR)
        .set(asBuyer())
        .set('Content-Type', `multipart/form-data; boundary=${boundary}`)
        .send(truncated);
      expectRejected(res, 400);
    });

    it('a second file, a file under another field name, or too many text fields are 400s', async () => {
      const twoFiles = await request(server())
        .post(AVATAR)
        .set(asBuyer())
        .attach('image', PNG_HEAD, { filename: 'a.png', contentType: 'image/png' })
        .attach('image', PNG_HEAD, { filename: 'b.png', contentType: 'image/png' });
      expectRejected(twoFiles, 400);

      const wrongField = await request(server())
        .post(AVATAR)
        .set(asBuyer())
        .attach('photo', PNG_HEAD, { filename: 'a.png', contentType: 'image/png' });
      expectRejected(wrongField, 400);

      const tooManyFields = await request(server())
        .post(AVATAR)
        .set(asBuyer())
        .field('f1', '1')
        .field('f2', '2')
        .field('f3', '3')
        .field('f4', '4')
        .field('f5', '5')
        .attach('image', PNG_HEAD, { filename: 'a.png', contentType: 'image/png' });
      expectRejected(tooManyFields, 400);
    });
  });

  describe('authorization is decided before any byte is trusted', () => {
    it('401 without a session on every multipart endpoint', async () => {
      for (const url of [AVATAR, PRODUCT_IMAGE, VERIFICATION_DOC, APPLICATION_DOC]) {
        const res = await request(server())
          .post(url)
          .attach(url.endsWith('documents') ? 'document' : 'image', PNG_HEAD, { filename: 'a.png', contentType: 'image/png' });
        expect(res.status).toBe(401);
      }
    });

    it('a buyer cannot reach seller product images or verification documents (403)', async () => {
      for (const [url, field] of [
        [PRODUCT_IMAGE, 'image'],
        [VERIFICATION_DOC, 'document'],
      ] as const) {
        const res = await request(server())
          .post(url)
          .set(asBuyer())
          .field('type', 'RCCM')
          .attach(field, PNG_HEAD, { filename: 'a.png', contentType: 'image/png' });
        expect(res.status).toBe(403);
      }
    });

    it('a seller can only name their OWN product (404 for another seller\'s id, nothing uploaded)', async () => {
      mockPrismaService.product.findUnique.mockResolvedValue(null);
      const res = await request(server())
        .post(PRODUCT_IMAGE)
        .set(asSeller())
        .attach('image', PNG_HEAD, { filename: 'a.png', contentType: 'image/png' });
      expect(res.status).toBe(404);
      expect(mockPrismaService.product.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: PRODUCT, sellerId: SELLER }) }),
      );
    });
  });
});
