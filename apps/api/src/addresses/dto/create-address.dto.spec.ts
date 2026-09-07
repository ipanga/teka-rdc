import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { normalizeDrcPhone } from '@teka/shared';
import { CreateAddressDto, normalizeRecipientPhone } from './create-address.dto';
import { UpdateAddressDto } from './update-address.dto';

// One phone rule for every surface (PR D2, 2026-09-07). The shared helper has
// no test runner of its own, so its contract is pinned here, from the API —
// the surface that actually enforces it.
describe('normalizeDrcPhone (shared) — every equivalent form → one canonical value', () => {
  it.each([
    ['990000001', '+243990000001'],
    ['0990000001', '+243990000001'],
    ['+243990000001', '+243990000001'],
    ['243990000001', '+243990000001'],
    ['00243990000001', '+243990000001'],
    ['+243 99 000 00 01', '+243990000001'],
    ['099-000-00-01', '+243990000001'],
    ['(099) 000.00.01', '+243990000001'],
    ['  0810000001  ', '+243810000001'],
    ['+243 81 000 00 01', '+243810000001'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeDrcPhone(input)).toBe(expected);
  });

  it.each([
    ['', 'blank'],
    ['   ', 'whitespace'],
    ['99000000', '8 digits'],
    ['9900000012', '10 digits not starting with 0'],
    ['09900000012', '11 digits'],
    ['+24499000000', 'another country'],
    ['0790000001', 'not a DRC mobile prefix'],
    ['+243790000001', 'not a DRC mobile prefix (intl)'],
    ['abc', 'letters'],
    ['09900000O1', 'letter O for zero'],
    ['+243990000001x', 'trailing junk'],
  ])('rejects %s (%s)', (input) => {
    expect(normalizeDrcPhone(input)).toBeNull();
  });
});

type PhoneDto = { recipientPhone?: string | null };
async function validated(
  input: Record<string, unknown>,
  Dto: new () => PhoneDto = CreateAddressDto,
) {
  const dto = plainToInstance(Dto, input) as PhoneDto;
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return { dto, errors };
}

const base = { province: 'Haut-Katanga', town: 'Lubumbashi', neighborhood: 'Kampemba' };

describe('CreateAddressDto.recipientPhone — normalised on write, validated after', () => {
  it.each([
    ['0990000001'],
    ['+243 99 000 00 01'],
    ['00243990000001'],
    ['099-000-00-01'],
  ])('%s is stored as +243990000001', async (phone) => {
    const { dto, errors } = await validated({ ...base, recipientPhone: phone });
    expect(errors).toHaveLength(0);
    expect(dto.recipientPhone).toBe('+243990000001');
  });

  it('an unreadable value fails with the French message, never stored as typed', async () => {
    const { errors } = await validated({ ...base, recipientPhone: '12345' });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('recipientPhone');
    expect(Object.values(errors[0].constraints ?? {})).toContain(
      'Numéro de téléphone invalide. Format: +243XXXXXXXXX',
    );
  });

  it('blank clears the field (null) and passes; absent stays absent', async () => {
    const blank = await validated({ ...base, recipientPhone: '   ' });
    expect(blank.errors).toHaveLength(0);
    expect(blank.dto.recipientPhone).toBeNull();
    const absent = await validated(base);
    expect(absent.errors).toHaveLength(0);
    expect(absent.dto.recipientPhone).toBeUndefined();
  });

  it('PATCH inherits the same rule (null clears, forms normalise)', async () => {
    const cleared = await validated({ recipientPhone: null }, UpdateAddressDto);
    expect(cleared.errors).toHaveLength(0);
    expect(cleared.dto.recipientPhone).toBeNull();
    const intl = await validated({ recipientPhone: '+243 81 000 00 01' }, UpdateAddressDto);
    expect(intl.errors).toHaveLength(0);
    expect(intl.dto.recipientPhone).toBe('+243810000001');
  });

  it('normalizeRecipientPhone: undefined/null pass through, non-strings are left to validation', () => {
    expect(normalizeRecipientPhone(undefined)).toBeUndefined();
    expect(normalizeRecipientPhone(null)).toBeNull();
    expect(normalizeRecipientPhone(12)).toBe(12);
  });
});
