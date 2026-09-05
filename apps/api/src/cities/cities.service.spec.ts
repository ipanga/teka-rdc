import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CitiesService } from './cities.service';

const CITY = '01000000-0000-0000-0000-000000000001';
const OTHER_CITY = '01000000-0000-0000-0000-000000000002';
const COMMUNE = '02000000-0000-0000-0000-000000000001';

function makeService() {
  const commune = {
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const city = {
    findUnique: jest.fn().mockResolvedValue({ id: CITY, isActive: true }),
    findFirst: jest.fn().mockResolvedValue({ id: CITY }),
  };
  const prisma = { commune, city };
  const service = new CitiesService(prisma as never);
  return { service, commune, city };
}

const liveCommune = (over: Record<string, unknown> = {}) => ({
  id: COMMUNE,
  name: 'Kampemba',
  cityId: CITY,
  isActive: true,
  city: { isActive: true },
  ...over,
});

describe('CitiesService.resolveCommune — the city ↔ commune source of truth (D4)', () => {
  it('returns the commune with ITS city, ignoring nothing the client could fake', async () => {
    const { service, commune } = makeService();
    commune.findUnique.mockResolvedValue(liveCommune());
    await expect(service.resolveCommune(COMMUNE)).resolves.toEqual({
      communeId: COMMUNE,
      cityId: CITY,
      communeName: 'Kampemba',
    });
    await expect(service.resolveCommune(COMMUNE, CITY)).resolves.toMatchObject({
      cityId: CITY,
    });
  });

  it('rejects a commune of another city when the client sent a city', async () => {
    const { service, commune } = makeService();
    commune.findUnique.mockResolvedValue(liveCommune());
    await expect(service.resolveCommune(COMMUNE, OTHER_CITY)).rejects.toThrow(
      'La commune ne correspond pas à la ville sélectionnée',
    );
  });

  it('rejects an unknown, inactive, or inactive-city commune', async () => {
    const { service, commune } = makeService();
    commune.findUnique.mockResolvedValueOnce(null);
    await expect(service.resolveCommune(COMMUNE)).rejects.toThrow(
      'Commune invalide',
    );
    commune.findUnique.mockResolvedValueOnce(liveCommune({ isActive: false }));
    await expect(service.resolveCommune(COMMUNE)).rejects.toThrow(
      'Commune inactive',
    );
    commune.findUnique.mockResolvedValueOnce(
      liveCommune({ city: { isActive: false } }),
    );
    await expect(service.resolveCommune(COMMUNE)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('CitiesService — commune library visibility', () => {
  it('public listing returns only active communes; admin listing includes retired ones', async () => {
    const { service, commune } = makeService();
    await service.getCommunesByCityId(CITY);
    expect(commune.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { cityId: CITY, isActive: true } }),
    );
    await service.getCommunesByCityId(CITY, { includeInactive: true });
    expect(commune.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { cityId: CITY } }),
    );
  });

  it('404s the listing for an unknown city', async () => {
    const { service, city } = makeService();
    city.findUnique.mockResolvedValue(null);
    await expect(service.getCommunesByCityId(CITY)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('cityHasActiveCommunes counts only active communes of that city', async () => {
    const { service, commune } = makeService();
    commune.count.mockResolvedValue(0);
    await expect(service.cityHasActiveCommunes(CITY)).resolves.toBe(false);
    expect(commune.count).toHaveBeenCalledWith({
      where: { cityId: CITY, isActive: true },
    });
    commune.count.mockResolvedValue(6);
    await expect(service.cityHasActiveCommunes(CITY)).resolves.toBe(true);
  });

  it('assertActiveCity rejects an unknown or inactive city', async () => {
    const { service, city } = makeService();
    city.findFirst.mockResolvedValue(null);
    await expect(service.assertActiveCity(CITY)).rejects.toThrow(
      'Ville invalide ou inactive',
    );
  });
});

describe('CitiesService — admin retire vs delete', () => {
  it('refuses to delete a commune still referenced by sellers or addresses (deactivate instead)', async () => {
    const { service, commune } = makeService();
    commune.findUnique.mockResolvedValue({
      id: COMMUNE,
      _count: { sellerProfiles: 2, addresses: 1 },
    });
    await expect(service.deleteCommune(COMMUNE)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(commune.delete).not.toHaveBeenCalled();
  });

  it('deletes an unreferenced commune and toggles isActive on update', async () => {
    const { service, commune } = makeService();
    commune.findUnique.mockResolvedValue({
      id: COMMUNE,
      _count: { sellerProfiles: 0, addresses: 0 },
    });
    await expect(service.deleteCommune(COMMUNE)).resolves.toEqual({
      deleted: true,
    });
    commune.update.mockResolvedValue({ id: COMMUNE, isActive: false });
    await service.updateCommune(COMMUNE, { isActive: false });
    expect(commune.update).toHaveBeenCalledWith({
      where: { id: COMMUNE },
      data: { isActive: false },
    });
  });
});
