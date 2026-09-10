import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { UsersService, maskEmail } from './users.service';

/**
 * Login-email re-authentication (2026-09-09).
 *
 * `PATCH /v1/users/profile` used to write `email` with no proof of identity,
 * so a hijacked seller or admin session could point the account at an
 * attacker's address, request a password reset there, and own the account
 * permanently — the escalation path into the payout destination that S12
 * guards. A duplicate address also produced a raw 500 from the unique index.
 */
describe('UsersService.updateProfile — login-email change requires re-auth', () => {
  const USER = 'user-1';
  const CURRENT = 'marie@example.cd';
  const NEXT = 'nouvelle@example.cd';
  const PASSWORD = 'Secret123!';
  const HASH = bcrypt.hashSync(PASSWORD, 4);

  function makeService(
    user: Record<string, unknown> | null = {
      id: USER,
      email: CURRENT,
      firstName: 'Marie',
      lastName: 'K',
      passwordHash: HASH,
      deletedAt: null,
    },
    opts: { updateError?: unknown } = {},
  ) {
    const tx = {
      user: {
        update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          if (opts.updateError) return Promise.reject(opts.updateError);
          return Promise.resolve({
            id: USER,
            email: data.email ?? CURRENT,
            firstName: data.firstName ?? 'Marie',
            lastName: 'K',
            emailVerified: data.emailVerified ?? true,
            passwordHash: HASH,
            deletedAt: null,
          });
        }),
      },
      adminAuditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      $transaction: jest.fn().mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx)),
    };
    const rateLimit = {
      assertNotBlocked: jest.fn().mockResolvedValue(undefined),
      enforce: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn(),
    };
    const audit = {
      record: jest
        .fn()
        .mockImplementation((t: typeof tx, entry: unknown) => t.adminAuditLog.create({ data: entry })),
    };
    const emailService = { sendLoginEmailChanged: jest.fn().mockResolvedValue(true) };
    const service = new UsersService(
      prisma as never,
      {} as never,
      rateLimit as never,
      audit as never,
      emailService as never,
    );
    return { service, prisma, tx, rateLimit, audit, emailService };
  }

  const flush = () => new Promise((r) => setImmediate(r));

  it('a name-only update needs no password and writes no audit row or notice', async () => {
    const { service, tx, audit, emailService, rateLimit } = makeService();
    const res = await service.updateProfile(USER, { firstName: 'Marie-Claire' });
    expect(res.firstName).toBe('Marie-Claire');
    expect(tx.user.update.mock.calls[0][0].data).not.toHaveProperty('email');
    expect(audit.record).not.toHaveBeenCalled();
    expect(emailService.sendLoginEmailChanged).not.toHaveBeenCalled();
    expect(rateLimit.assertNotBlocked).not.toHaveBeenCalled();
  });

  it('re-sending the SAME email is a password-free no-op on the identity', async () => {
    const { service, tx, audit, emailService } = makeService();
    await service.updateProfile(USER, { email: CURRENT });
    expect(tx.user.update.mock.calls[0][0].data).not.toHaveProperty('email');
    expect(audit.record).not.toHaveBeenCalled();
    expect(emailService.sendLoginEmailChanged).not.toHaveBeenCalled();
  });

  it('the same email in a different case is still treated as unchanged', async () => {
    const { service, tx } = makeService();
    await service.updateProfile(USER, { email: '  MARIE@Example.CD ' });
    expect(tx.user.update.mock.calls[0][0].data).not.toHaveProperty('email');
  });

  it('a real change without a password is a French 400 and writes nothing', async () => {
    const { service, prisma, tx } = makeService();
    await expect(service.updateProfile(USER, { email: NEXT })).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.updateProfile(USER, { email: NEXT })).rejects.toThrow(
      /mot de passe est requis/i,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('a wrong password is a generic 403, counts in the login lock, and writes nothing', async () => {
    const { service, prisma, rateLimit, audit } = makeService();
    await expect(
      service.updateProfile(USER, { email: NEXT, password: 'wrong' }),
    ).rejects.toThrow(ForbiddenException);
    expect(rateLimit.assertNotBlocked).toHaveBeenCalledWith('login', CURRENT);
    expect(rateLimit.enforce).toHaveBeenCalledWith('login', CURRENT);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  /**
   * Buyer compatibility (2026-09-10).
   *
   * The first version of this guard required a password for ANY email change.
   * Buyers sign in with a phone and a WhatsApp OTP (Rule 13) and have no
   * password by construction, so their optional contact email — the field is
   * labelled « Optionnel » in the app — became permanently unchangeable, and
   * every distributed buyer build got a French 400 telling them to supply a
   * password they can never have. These tests pin the corrected rule.
   */
  const OTP_BUYER = {
    id: USER,
    email: CURRENT,
    firstName: 'Marie',
    lastName: 'K',
    passwordHash: null,
    deletedAt: null,
  };

  it('an OTP buyer changes their optional email with NO password', async () => {
    const { service, tx } = makeService(OTP_BUYER);
    const res = await service.updateProfile(USER, { email: NEXT });
    expect(tx.user.update.mock.calls[0][0].data).toMatchObject({
      email: NEXT,
      emailVerified: false,
    });
    expect(res.email).toBe(NEXT);
  });

  it('an OTP buyer email change is not audited and sends no login notice', async () => {
    const { service, audit, emailService, rateLimit } = makeService(OTP_BUYER);
    await service.updateProfile(USER, { email: NEXT });
    await flush();
    // `LOGIN_EMAIL_CHANGED` would be a lie, and the notice says « vos
    // connexions se feront avec … », which is false for a phone login.
    expect(audit.record).not.toHaveBeenCalled();
    expect(emailService.sendLoginEmailChanged).not.toHaveBeenCalled();
    // No credential was checked, so nothing may touch the login lock.
    expect(rateLimit.assertNotBlocked).not.toHaveBeenCalled();
    expect(rateLimit.enforce).not.toHaveBeenCalled();
  });

  it('an OTP buyer keeps the existing validation: unchanged email is a no-op', async () => {
    const { service, tx } = makeService(OTP_BUYER);
    await service.updateProfile(USER, { email: CURRENT });
    expect(tx.user.update.mock.calls[0][0].data).not.toHaveProperty('email');
  });

  it('an OTP buyer still gets the French 409 on a duplicate address', async () => {
    const { service } = makeService(OTP_BUYER, {
      updateError: new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'x',
      }),
    });
    const err = await service
      .updateProfile(USER, { email: NEXT })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(JSON.stringify(err.getResponse())).toMatch(/ne peut pas être utilisée/);
  });

  it('a buyer who DOES hold a password is still guarded — the rule is the credential, not the role', async () => {
    // The legacy 2026-05-12..05-15 cohort: BUYERs created with EMAIL_PASSWORD.
    // `loginWithEmail` does not filter by role, so their address is a working
    // login credential. A `role === 'BUYER'` shortcut would hand it to anyone
    // holding a stolen session.
    const { service, prisma } = makeService({
      id: USER,
      email: CURRENT,
      firstName: 'Marie',
      lastName: 'K',
      passwordHash: HASH,
      deletedAt: null,
    });
    await expect(service.updateProfile(USER, { email: NEXT })).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.updateProfile(USER, { email: NEXT })).rejects.toThrow(
      /mot de passe est requis/i,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('a buyer with a password still needs the CORRECT one', async () => {
    const { service } = makeService({
      id: USER,
      email: CURRENT,
      firstName: 'Marie',
      lastName: 'K',
      passwordHash: HASH,
      deletedAt: null,
    });
    await expect(
      service.updateProfile(USER, { email: NEXT, password: 'wrong' }),
    ).rejects.toThrow(ForbiddenException);
    const ok = await service.updateProfile(USER, {
      email: NEXT,
      password: PASSWORD,
    });
    expect(ok.email).toBe(NEXT);
  });

  it('the correct password changes the email, resets verification, audits with MASKED addresses and notifies the PREVIOUS one — the password appears nowhere', async () => {
    const { service, tx, audit, emailService } = makeService();
    const res = await service.updateProfile(USER, {
      email: NEXT,
      password: PASSWORD,
    });

    const data = tx.user.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ email: NEXT, emailVerified: false });
    expect(res).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(res)).not.toMatch(/Secret123/);

    const entry = audit.record.mock.calls[0][1];
    expect(entry).toMatchObject({
      actorId: USER,
      action: 'LOGIN_EMAIL_CHANGED',
      entityType: 'user',
      entityId: USER,
    });
    // Masked on both sides — the trail proves the change without storing the
    // addresses in a second place.
    expect(entry.before.email).toBe('m•••e@example.cd');
    expect(entry.after.email).toBe('n•••e@example.cd');
    expect(JSON.stringify(entry)).not.toMatch(/Secret123/);

    await flush();
    expect(emailService.sendLoginEmailChanged).toHaveBeenCalledWith(
      CURRENT,
      expect.anything(),
      'n•••e@example.cd',
      expect.any(String),
    );
    expect(JSON.stringify(emailService.sendLoginEmailChanged.mock.calls)).not.toMatch(
      /Secret123/,
    );
  });

  it('a duplicate address is a French 409 that reveals nothing about the other account', async () => {
    const { service } = makeService(undefined, {
      updateError: new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'x',
      }),
    });
    const err = await service
      .updateProfile(USER, { email: NEXT, password: PASSWORD })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    const body = JSON.stringify(err.getResponse());
    expect(body).toMatch(/ne peut pas être utilisée/);
    // No "already taken", no owner, no id.
    expect(body).not.toMatch(/existe|déjà utilisée par|appartient/i);
  });

  it('maskEmail keeps only the first and last local character plus the domain', () => {
    expect(maskEmail('marie@example.cd')).toBe('m•••e@example.cd');
    expect(maskEmail('a@example.cd')).toBe('a•••@example.cd');
    expect(maskEmail('not-an-email')).toBe('•••');
  });
});
