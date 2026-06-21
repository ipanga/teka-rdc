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
