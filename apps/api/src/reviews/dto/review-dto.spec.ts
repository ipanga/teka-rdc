import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateReviewDto } from './create-review.dto';
import { UpdateReviewDto } from './update-review.dto';

// Title rollout (2026-07-28). The asymmetry between create and update is
// deliberate and is the whole compatibility story:
//
//   CREATE  → title OPTIONAL. Mobile builds already on buyers' phones know
//             nothing about the field; rejecting them would 400 a review the
//             buyer cannot fix without updating the app.
//   UPDATE  → title REQUIRED. An edit can only come from a client new enough
//             to offer the field, so there is no legacy case to protect.
//
// These specs pin that asymmetry so a later "tidy-up" cannot quietly make
// create strict before adoption justifies it.

const PRODUCT = '31000000-0000-0000-0000-000000000042';
const ORDER = '70000000-0000-0000-0000-000000000042';

async function errorsFor<T extends object>(
  cls: new () => T,
  payload: Record<string, unknown>,
): Promise<string[]> {
  const dto = plainToInstance(cls, payload);
  const errors = await validate(dto as object);
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('CreateReviewDto — title is optional during the compatibility window', () => {
  it('accepts a legacy request with NO title at all', async () => {
    const errors = await errorsFor(CreateReviewDto, {
      productId: PRODUCT,
      orderId: ORDER,
      rating: 5,
      text: 'Très bon produit.',
    });
    expect(errors).toEqual([]);
  });

  it('accepts a new-client request that includes a title', async () => {
    const errors = await errorsFor(CreateReviewDto, {
      productId: PRODUCT,
      orderId: ORDER,
      rating: 5,
      title: 'Excellent produit',
      text: 'Conforme.',
    });
    expect(errors).toEqual([]);
  });

  it('still validates a title that IS supplied (too short)', async () => {
    // Permissive about absence, not about rubbish.
    const errors = await errorsFor(CreateReviewDto, {
      productId: PRODUCT,
      orderId: ORDER,
      rating: 5,
      title: 'abc',
    });
    expect(errors.join(' ')).toMatch(/au moins 5 caractères/);
  });

  it('still validates a title that IS supplied (too long)', async () => {
    const errors = await errorsFor(CreateReviewDto, {
      productId: PRODUCT,
      orderId: ORDER,
      rating: 5,
      title: 'a'.repeat(101),
    });
    expect(errors.join(' ')).toMatch(/dépasser 100 caractères/);
  });
});

describe('UpdateReviewDto — title is required on edit', () => {
  it('rejects an edit with no title', async () => {
    const errors = await errorsFor(UpdateReviewDto, {
      rating: 4,
      text: 'Mise à jour.',
    });
    expect(errors.join(' ')).toMatch(/titre/i);
  });

  it('accepts an edit that carries a title', async () => {
    const errors = await errorsFor(UpdateReviewDto, {
      rating: 4,
      title: 'Bon produit',
      text: 'Mise à jour.',
    });
    expect(errors).toEqual([]);
  });

  it('rejects an edit that smuggles productId / orderId', async () => {
    // Re-pointing a review at another product or order would bypass the
    // delivered-purchase eligibility check. main.ts runs the global pipe with
    // { whitelist: true, forbidNonWhitelisted: true }, so a payload carrying
    // fields the DTO does not declare is REJECTED outright rather than merely
    // stripped. This asserts that real runtime path, not plainToInstance's
    // (permissive) default.
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    await expect(
      pipe.transform(
        {
          rating: 4,
          title: 'Bon produit',
          productId: PRODUCT,
          orderId: ORDER,
        },
        { type: 'body', metatype: UpdateReviewDto },
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
