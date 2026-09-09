import { avatarPublicIdFromUrl } from './avatar-asset';

const CLOUD = 'teka-rdc';
const OWN = `https://res.cloudinary.com/${CLOUD}/image/upload/v1725600000/teka-rdc/avatars/abc123XYZ_-.webp`;

describe('avatarPublicIdFromUrl (D11 — previous-avatar cleanup)', () => {
  it('derives the public id of an avatar this API uploaded', () => {
    expect(avatarPublicIdFromUrl(OWN, CLOUD)).toBe('teka-rdc/avatars/abc123XYZ_-');
  });

  it('accepts a URL without version or extension', () => {
    expect(
      avatarPublicIdFromUrl(`https://res.cloudinary.com/${CLOUD}/image/upload/teka-rdc/avatars/id1`, CLOUD),
    ).toBe('teka-rdc/avatars/id1');
  });

  it.each([
    ['null', null],
    ['empty', ''],
    ['not a URL', 'teka-rdc/avatars/abc'],
    ['http', OWN.replace('https://', 'http://')],
    ['another host', OWN.replace('res.cloudinary.com', 'example.com')],
    ['another cloud', OWN.replace(`/${CLOUD}/`, '/other-cloud/')],
    ['a product image', OWN.replace('teka-rdc/avatars/', 'teka-rdc/products/')],
    ['a seller document', OWN.replace('teka-rdc/avatars/', 'teka-rdc/seller-documents/')],
    ['a nested path', OWN.replace('teka-rdc/avatars/', 'teka-rdc/avatars/deeper/')],
    ['a transformation segment', OWN.replace('/upload/', '/upload/w_300,h_300,c_fill/')],
    ['a raw/private delivery type', OWN.replace('/image/upload/', '/image/authenticated/')],
    ['path traversal', `https://res.cloudinary.com/${CLOUD}/image/upload/teka-rdc/avatars/../products/x`],
  ])('yields null for %s (nothing is deleted on a guess)', (_label, url) => {
    expect(avatarPublicIdFromUrl(url, CLOUD)).toBeNull();
  });

  it('yields null when the cloud name is not configured', () => {
    expect(avatarPublicIdFromUrl(OWN, undefined)).toBeNull();
    expect(avatarPublicIdFromUrl(OWN, '')).toBeNull();
  });
});
