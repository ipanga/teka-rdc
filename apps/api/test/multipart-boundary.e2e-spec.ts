import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import multer from 'multer';
import { createServer } from 'node:http';
import { AddressInfo, connect } from 'node:net';
import { deflateSync, gzipSync } from 'node:zlib';
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
 *
 * Extended for the multer 2.5.0 / body-parser 2.4.0 pins: the JSON parser
 * (plain, gzip, deflate) in front of every route, and an upload interrupted
 * while an async fileFilter is still deciding.
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

  describe('JSON body parser (body-parser 2.4.0 pin) — the real Nest parser in front of every route', () => {
    // These assertions pin the ESTABLISHED external behaviour, identical on
    // body-parser 2.3.0 and 2.4.0 behind the unchanged HttpExceptionFilter:
    //   - malformed JSON          → 400 carrying the parser's SyntaxError message
    //   - decodable gzip/deflate  → reaches the route (avatar: « Aucun fichier reçu »)
    //   - over the limit, corrupt/truncated compressed stream, unsupported
    //     Content-Encoding        → the generic French 500 envelope.
    // That last group is a PRE-EXISTING gap, not a regression of this pin and
    // not newly accepted risk: body-parser raises plain http-errors (413 /
    // 415 / 400 on `err.status`), which are not Nest HttpExceptions, so the
    // filter's catch-all answers 500 (and reports them to Sentry as
    // unhandled). The process survives and nothing internal leaks — asserted
    // below. Mapping them to French 4xx changes external statuses and belongs
    // in a separate HTTP-error-handling remediation, not this security PR.
    const JSON_BODY = Buffer.from(JSON.stringify({ image: 'data:image/png;base64,AAAA' }));
    // Nest's default JSON limit (100 kB) applies to the DECODED bytes.
    const OVER_LIMIT = Buffer.from(JSON.stringify({ a: ' '.repeat(150 * 1024) }));
    const GENERIC_500 = { success: false, error: { status: 500, message: 'Erreur interne du serveur' } };

    // superagent runs its application/json serializer over any non-string
    // body (Buffers included), so the exact bytes are pinned with an identity
    // serializer — otherwise the server would receive `{"type":"Buffer",…}`.
    // (Typed as returning string; at runtime superagent writes a Buffer as-is.)
    const rawJson = (req: request.Test, body: Buffer) =>
      req
        .set('Content-Type', 'application/json')
        .serialize(() => body as unknown as string)
        .send(body);

    const postJson = (body: Buffer, headers: Record<string, string> = {}) =>
      rawJson(request(server()).post(AVATAR).set(asBuyer()).set(headers), body);

    const expectGeneric500 = (res: request.Response) => {
      expect(res.status).toBe(500);
      expect(res.body).toEqual(GENERIC_500);
    };

    const expectReachedRoute = (res: request.Response) => {
      expectRejected(res, 400);
      expect(res.body.error.message).toBe('Aucun fichier reçu');
    };

    const expectAlive = async () => {
      expectReachedRoute(await request(server()).post(AVATAR).set(asBuyer()).send({ hello: 'world' }));
    };

    it('the raw-byte path itself reaches the route: plain JSON bytes are the route\'s 400', async () => {
      expectReachedRoute(await postJson(JSON_BODY));
    });

    it('malformed JSON is the parser\'s 400 envelope, and the server keeps answering', async () => {
      for (const raw of ['{"image":', '[' + '['.repeat(64)]) {
        const res = await postJson(Buffer.from(raw));
        expectRejected(res, 400);
        expect(res.body).toEqual({ success: false, error: { status: 400, message: 'Unexpected end of JSON input' } });
      }
      for (const raw of ['{"a":1}}', '\u0000\u0001']) {
        const res = await postJson(Buffer.from(raw));
        expectRejected(res, 400);
        expect(res.body.error.message).not.toBe('Aucun fichier reçu');
        expect(res.body.error.message).not.toBe(GENERIC_500.error.message);
      }
      await expectAlive();
    });

    it('a body over the JSON limit is refused by the parser before auth is consulted (established generic 500)', async () => {
      expectGeneric500(await postJson(OVER_LIMIT));

      // No session: still the parser's answer, not the guard's 401.
      expectGeneric500(await rawJson(request(server()).post(AVATAR), OVER_LIMIT));

      // Small body, no session: the guard answers.
      const small = await request(server()).post(AVATAR).send({ hello: 'world' });
      expect(small.status).toBe(401);
      expect(small.body).toMatchObject({ success: false, error: { status: 401 } });
      await expectAlive();
    });

    it('gzip and deflate bodies are inflated and reach the route', async () => {
      for (const [encoding, bytes] of [
        ['gzip', gzipSync(JSON_BODY)],
        ['deflate', deflateSync(JSON_BODY)],
      ] as const) {
        expectReachedRoute(await postJson(bytes, { 'Content-Encoding': encoding }));
      }
    });

    it('a gzip body with an invalid trailer is the established generic 500 and never takes the process down', async () => {
      for (const bytes of [
        // Garbage after the member: zlib tries it as a second member and fails.
        Buffer.concat([gzipSync(JSON_BODY), Buffer.from('trailing-bytes-after-the-stream')]),
        // A second member that starts and never finishes.
        Buffer.concat([gzipSync(JSON_BODY), Buffer.from([0x1f, 0x8b, 0x08, 0x00])]),
      ]) {
        expectGeneric500(await postJson(bytes, { 'Content-Encoding': 'gzip' }));
      }
      await expectAlive();
    });

    it('a deflate body with trailing bytes is decoded up to the stream end and reaches the route', async () => {
      // Node's inflate stops at the end of the deflate stream and drops the rest.
      const res = await postJson(Buffer.concat([deflateSync(JSON_BODY), Buffer.from('trailing-bytes')]), {
        'Content-Encoding': 'deflate',
      });
      expectReachedRoute(res);
    });

    it('a truncated or corrupt gzip body, or one that inflates past the limit, is the established generic 500', async () => {
      const gz = gzipSync(JSON_BODY);
      for (const bytes of [gz.subarray(0, gz.length - 8), gz.subarray(0, 12), Buffer.from('pas du gzip du tout')]) {
        expectGeneric500(await postJson(bytes, { 'Content-Encoding': 'gzip' }));
      }

      const inflatesPastLimit = gzipSync(OVER_LIMIT);
      expect(inflatesPastLimit.length).toBeLessThan(4096);
      expectGeneric500(await postJson(inflatesPastLimit, { 'Content-Encoding': 'gzip' }));
      await expectAlive();
    });

    it('an unsupported Content-Encoding is the established generic 500', async () => {
      expectGeneric500(await postJson(JSON_BODY, { 'Content-Encoding': 'compress' }));
      await expectAlive();
    });
  });

  describe('multer 2.5.0 — an upload interrupted while an async fileFilter is pending', () => {
    // Isolated fixture on the same multer the API ships: none of Teka's
    // FileInterceptors use a fileFilter, so the edge is driven directly
    // through multer on a local ephemeral port.
    it('never crashes the process, never delivers a partial file, and the next upload succeeds', async () => {
      const outcomes: Array<{ url: string | undefined; err: unknown; file: unknown }> = [];
      let reachFilter!: () => void;
      const filterReached = new Promise<void>((resolve) => (reachFilter = resolve));

      const upload = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: 64 * 1024, files: 1 },
        fileFilter: (_req, _file, cb) => {
          reachFilter();
          setTimeout(() => cb(null, true), 50);
        },
      }).single('image');

      const fixture = createServer((req, res) => {
        upload(req as any, res as any, (err?: unknown) => {
          outcomes.push({ url: req.url, err, file: (req as any).file });
          if (res.destroyed || res.headersSent) return;
          res.statusCode = err ? 400 : 200;
          res.end();
        });
      });
      await new Promise<void>((resolve) => fixture.listen(0, '127.0.0.1', resolve));
      const { port } = fixture.address() as AddressInfo;

      try {
        const boundary = 'teka-boundary';
        const full = multipart(boundary, [
          { name: 'image', filename: 'a.png', type: 'image/png', bytes: Buffer.concat([PNG_HEAD, Buffer.alloc(2048)]) },
        ]);
        // Part headers plus a few file bytes, then the client vanishes.
        const partial = full.subarray(0, full.indexOf('\r\n\r\n') + 4 + 8);

        const socket = connect(port, '127.0.0.1');
        socket.on('error', () => undefined);
        await new Promise<void>((resolve) => socket.once('connect', () => resolve()));
        socket.write(
          `POST /interrupted HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n` +
            `Content-Type: multipart/form-data; boundary=${boundary}\r\n` +
            `Content-Length: ${full.length}\r\n\r\n`,
        );
        socket.write(partial);
        await filterReached;
        socket.destroy();

        // Let the pending fileFilter callback fire against the dead request.
        await new Promise((resolve) => setTimeout(resolve, 300));

        const interrupted = outcomes.filter((o) => o.url === '/interrupted');
        expect(interrupted.length).toBeLessThanOrEqual(1);
        for (const o of interrupted) {
          expect(o.err).toBeTruthy();
        }

        const ok = await request(fixture)
          .post('/complete')
          .attach('image', PNG_HEAD, { filename: 'a.png', contentType: 'image/png' });
        expect(ok.status).toBe(200);
        const complete = outcomes.filter((o) => o.url === '/complete');
        expect(complete).toHaveLength(1);
        expect(complete[0].err).toBeFalsy();
        expect((complete[0].file as { size: number }).size).toBe(PNG_HEAD.length);
      } finally {
        fixture.closeAllConnections();
        await new Promise<void>((resolve) => fixture.close(() => resolve()));
      }

      // And the API itself is untouched.
      const after = await request(server()).post(AVATAR).set(asBuyer()).send({ hello: 'world' });
      expectRejected(after, 400);
    });
  });
});
