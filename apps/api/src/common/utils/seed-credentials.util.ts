/**
 * Returns the seeded credentials to apply to a user during seeding — but ONLY
 * for an account that has no password yet. An account that already has a
 * `passwordHash` keeps it (this returns `{}`), so re-running the seed (e.g. on
 * every prod DB upgrade) NEVER overwrites a real, owner-set password.
 *
 * Regression guard for the recurring "Email ou mot de passe invalide" after
 * deployments: `seedTekaOfficielSeller` used to spread fixed dev credentials
 * unconditionally, clobbering the platform owner's seller password on every
 * `prisma:seed:prod` run. Existing sellers must keep working after upgrades
 * without a password reset.
 */
export function credentialsForSeed<T extends object>(
  existingPasswordHash: string | null | undefined,
  seeded: T,
): T | Record<string, never> {
  return existingPasswordHash ? {} : seeded;
}
