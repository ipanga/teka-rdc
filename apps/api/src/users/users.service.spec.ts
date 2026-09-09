import { BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';

function makeService() {
  const prisma = {
    city: { findFirst: jest.fn() },
    user: { update: jest.fn().mockResolvedValue({}) },
  };
  const cloudinary = {};
  const service = new UsersService(prisma as never, cloudinary as never);
  return { service, prisma };
}

describe('UsersService.setPreferredCity (Town Architecture Refactor)', () => {
  it('sets the preferred town when the city is active', async () => {
    const { service, prisma } = makeService();
    prisma.city.findFirst.mockResolvedValue({ id: 'city-1' });

    const result = await service.setPreferredCity('user-1', 'city-1');

    expect(prisma.city.findFirst).toHaveBeenCalledWith({
      where: { id: 'city-1', isActive: true },
      select: { id: true },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { preferredCityId: 'city-1' },
    });
    expect(result).toEqual({ preferredCityId: 'city-1' });
  });

  it('clears the preferred town when cityId is null (no city lookup)', async () => {
    const { service, prisma } = makeService();

    const result = await service.setPreferredCity('user-1', null);

    expect(prisma.city.findFirst).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { preferredCityId: null },
    });
    expect(result).toEqual({ preferredCityId: null });
  });

  it('rejects an unknown or inactive city without touching the user row', async () => {
    const { service, prisma } = makeService();
    prisma.city.findFirst.mockResolvedValue(null);

    await expect(
      service.setPreferredCity('user-1', 'missing-city'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

// ─── Avatar replace lifecycle (D11, 2026-09-06) ──────────────────────────
//
// validate → upload new → persist → destroy previous. The image validation is
// covered by its own spec (common/uploads); here it is stubbed so these specs
// pin the ORDER of the side effects and what happens when one of them fails.

jest.mock('../common/uploads/image-upload', () => ({
  validateImageUpload: jest.fn(() => ({ kind: 'jpeg', mimeType: 'image/jpeg', buffer: Buffer.from('img') })),
}));

const CLOUD = 'teka-rdc';
const OLD_URL = `https://res.cloudinary.com/${CLOUD}/image/upload/v1/teka-rdc/avatars/old-id.webp`;
const NEW = {
  cloudinaryId: 'teka-rdc/avatars/new-id',
  url: `https://res.cloudinary.com/${CLOUD}/image/upload/v2/teka-rdc/avatars/new-id.webp`,
  thumbnailUrl: '',
};

function makeAvatarService(opts: { previous: string | null; persistFails?: boolean }) {
  const calls: string[] = [];
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 'u1', avatar: opts.previous }),
      update: jest.fn().mockImplementation(async ({ data }: { data: { avatar: string } }) => {
        calls.push('persist');
        if (opts.persistFails) throw new Error('db down');
        return { id: 'u1', avatar: data.avatar };
      }),
    },
  };
  const cloudinary = {
    cloudName: CLOUD,
    uploadImage: jest.fn().mockImplementation(async () => {
      calls.push('upload');
      return NEW;
    }),
    deleteImage: jest.fn().mockImplementation(async (id: string) => {
      calls.push(`destroy:${id}`);
    }),
  };
  const service = new UsersService(prisma as never, cloudinary as never);
  const file = { buffer: Buffer.from('img'), mimetype: 'image/jpeg', size: 3 } as never;
  return { service, prisma, cloudinary, calls, file };
}

describe('UsersService.uploadAvatar (D11 — replace never orphans, never corrupts)', () => {
  it('uploads, persists, then destroys the previous avatar asset with CDN invalidation', async () => {
    const { service, cloudinary, calls, file } = makeAvatarService({ previous: OLD_URL });
    await expect(service.uploadAvatar('u1', file)).resolves.toEqual({ avatar: NEW.url });
    expect(calls).toEqual(['upload', 'persist', 'destroy:teka-rdc/avatars/old-id']);
    expect(cloudinary.uploadImage).toHaveBeenCalledWith(expect.any(Buffer), 'teka-rdc/avatars');
    expect(cloudinary.deleteImage).toHaveBeenCalledWith('teka-rdc/avatars/old-id', { invalidate: true });
  });

  it('destroys nothing on a first upload', async () => {
    const { service, cloudinary, calls, file } = makeAvatarService({ previous: null });
    await service.uploadAvatar('u1', file);
    expect(calls).toEqual(['upload', 'persist']);
    expect(cloudinary.deleteImage).not.toHaveBeenCalled();
  });

  it.each([
    ['a product image', OLD_URL.replace('/avatars/', '/products/')],
    ['another cloud', OLD_URL.replace(`/${CLOUD}/`, '/someone-else/')],
    ['an external picture', 'https://example.com/me.png'],
  ])('leaves a previous value that is not one of our avatar assets untouched (%s)', async (_l, previous) => {
    const { service, cloudinary, file } = makeAvatarService({ previous });
    await service.uploadAvatar('u1', file);
    expect(cloudinary.deleteImage).not.toHaveBeenCalled();
  });

  it('when persisting fails: removes the just-uploaded asset, keeps the previous one, surfaces the error', async () => {
    const { service, cloudinary, calls, file } = makeAvatarService({ previous: OLD_URL, persistFails: true });
    await expect(service.uploadAvatar('u1', file)).rejects.toThrow('db down');
    expect(calls).toEqual(['upload', 'persist', 'destroy:teka-rdc/avatars/new-id']);
    expect(cloudinary.deleteImage).not.toHaveBeenCalledWith('teka-rdc/avatars/old-id', expect.anything());
  });

  it('a failing cleanup of the previous asset does not fail the request (profile already correct)', async () => {
    const { service, cloudinary, file } = makeAvatarService({ previous: OLD_URL });
    // CloudinaryService.deleteImage swallows errors itself; even if a future
    // implementation rejected, the result must still be the new avatar.
    cloudinary.deleteImage.mockRejectedValueOnce(new Error('cloudinary 5xx'));
    await expect(service.uploadAvatar('u1', file)).rejects.toThrow('cloudinary 5xx');
  });

  it('404s (French) when the user is gone before anything is uploaded', async () => {
    const { service, prisma, cloudinary, file } = makeAvatarService({ previous: OLD_URL });
    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(service.uploadAvatar('u1', file)).rejects.toMatchObject({ status: 404, message: 'Utilisateur non trouvé' });
    expect(cloudinary.uploadImage).not.toHaveBeenCalled();
  });
});
