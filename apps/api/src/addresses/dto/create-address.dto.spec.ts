import {
  ArgumentMetadata,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';
import { CreateAddressDto } from './create-address.dto';
import { UpdateAddressDto } from './update-address.dto';

/**
 * Contract guard for the address payload.
 *
 * Both buyer clients used to post `details` and `phone`, while the DTO has
 * always accepted `reference` and `recipientPhone`. Because main.ts runs the
 * ValidationPipe with `forbidNonWhitelisted: true`, those keys are not
 * silently dropped — they are a hard 400. It went unnoticed because both
 * clients omit the key entirely when the input is blank, so an address only
 * failed to save once the buyer actually filled in "Point de repère" or
 * "Téléphone du destinataire".
 *
 * The pipe here is configured exactly as in main.ts.
 */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

const meta: ArgumentMetadata = { type: 'body', metatype: CreateAddressDto };
const updateMeta: ArgumentMetadata = { type: 'body', metatype: UpdateAddressDto };

const base = {
  province: 'Haut-Katanga',
  town: 'Lubumbashi',
  neighborhood: 'Kampemba',
};

/**
 * Runs the pipe and returns the flattened validation messages. The pipe throws
 * a BadRequestException whose own `message` is just "Bad Request Exception" —
 * the per-field detail lives in `getResponse().message`.
 */
async function rejectionMessages(
  payload: Record<string, unknown>,
  m: ArgumentMetadata = meta,
): Promise<string> {
  try {
    await pipe.transform(payload, m);
  } catch (e) {
    const body = (e as BadRequestException).getResponse() as {
      message?: string[] | string;
    };
    const raw = body?.message ?? String(e);
    return Array.isArray(raw) ? raw.join(' | ') : String(raw);
  }
  throw new Error('expected the payload to be rejected, but it was accepted');
}

describe('CreateAddressDto', () => {
  it('accepts the minimum required payload', async () => {
    await expect(pipe.transform({ ...base }, meta)).resolves.toMatchObject(base);
  });

  it('accepts the full contract field names', async () => {
    const payload = {
      ...base,
      avenue: 'Av. Lumumba 24',
      reference: 'En face de la pharmacie',
      recipientName: 'Jean Kabila',
      recipientPhone: '+243990000001',
    };
    await expect(pipe.transform(payload, meta)).resolves.toMatchObject(payload);
  });

  // The two that were actually broken in production.
  it('rejects the legacy `details` key (contract name is `reference`)', async () => {
    expect(
      await rejectionMessages({ ...base, details: 'En face de la pharmacie' }),
    ).toMatch(/details should not exist/i);
  });

  it('rejects the legacy `phone` key (contract name is `recipientPhone`)', async () => {
    expect(
      await rejectionMessages({ ...base, phone: '+243990000001' }),
    ).toMatch(/phone should not exist/i);
  });

  it('rejects a recipientPhone that is not +243XXXXXXXXX', async () => {
    expect(
      await rejectionMessages({ ...base, recipientPhone: '0990000001' }),
    ).toMatch(/téléphone/i);
  });

  it('requires town', async () => {
    const { town: _town, ...withoutTown } = base;
    expect(await rejectionMessages(withoutTown)).toMatch(/ville/i);
  });
});

describe('UpdateAddressDto', () => {
  it('allows a partial payload (edit sends only what changed)', async () => {
    await expect(
      pipe.transform({ avenue: 'Av. Kasavubu 9' }, updateMeta),
    ).resolves.toMatchObject({ avenue: 'Av. Kasavubu 9' });
  });

  it('rejects the legacy keys on edit too', async () => {
    expect(
      await rejectionMessages({ details: 'Près du marché' }, updateMeta),
    ).toMatch(/details should not exist/i);
  });
});
