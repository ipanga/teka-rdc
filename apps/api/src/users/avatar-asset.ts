/**
 * Avatar assets live in ONE Cloudinary folder, under a random public id the
 * upload API assigns: `teka-rdc/avatars/<id>`. The row only stores the
 * delivery URL, so the public id of the asset behind a stored avatar is
 * derived from that URL when the avatar is replaced (D11, 2026-09-06).
 */
export const AVATAR_FOLDER = 'teka-rdc/avatars';

/**
 * Public id of the Cloudinary asset a stored avatar URL points at, or `null`
 * when the URL is not an avatar THIS API uploaded.
 *
 * Deliberately strict: the id is only derived from a `res.cloudinary.com`
 * delivery URL of OUR cloud whose asset sits directly in {@link AVATAR_FOLDER}.
 * A stored value that points anywhere else (another cloud, a product image, a
 * seller document, an external picture, a hand-crafted URL) yields `null`, so
 * the replace path can never be steered into destroying an asset that is not
 * an avatar of the calling user. Nothing is ever deleted on a filename guess.
 */
export function avatarPublicIdFromUrl(
  url: string | null | undefined,
  cloudName: string | undefined,
): string | null {
  if (!url || !cloudName) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com') {
    return null;
  }
  const prefix = `/${cloudName}/image/upload/`;
  if (!parsed.pathname.startsWith(prefix)) return null;
  // `[v<version>/]teka-rdc/avatars/<id>[.<ext>]` — no transformation segments
  // (the API stores the plain secure_url) and no deeper folder.
  const m = /^(?:v\d+\/)?teka-rdc\/avatars\/([A-Za-z0-9_-]+)(?:\.[A-Za-z0-9]+)?$/.exec(
    parsed.pathname.slice(prefix.length),
  );
  return m ? `${AVATAR_FOLDER}/${m[1]}` : null;
}
