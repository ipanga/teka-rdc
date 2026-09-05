import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { SellerVerificationController } from './seller-verification.controller';
import { AdminSellerVerificationController } from './admin-seller-verification.controller';

/**
 * Authorization model (D8), pinned on the decorators the global RolesGuard
 * reads (`getAllAndOverride` — a method-level @Roles wins over the class).
 */
const reflector = new Reflector();
const roles = (ctrl: any, method?: string) =>
  reflector.getAllAndOverride<string[]>(ROLES_KEY, method ? [ctrl.prototype[method], ctrl] : [ctrl]);

describe('seller verification — who may do what', () => {
  it('sellers: read + upload their own evidence only', () => {
    expect(roles(SellerVerificationController, 'getStatus')).toEqual(['SELLER']);
    expect(roles(SellerVerificationController, 'uploadDocument')).toEqual(['SELLER']);
    // No seller route can set a verification status.
    expect(Object.getOwnPropertyNames(SellerVerificationController.prototype).sort()).toEqual(['constructor', 'getStatus', 'uploadDocument']);
  });

  it('SUPPORT: status only; ADMIN: documents + every transition', () => {
    expect(roles(AdminSellerVerificationController, 'get')).toEqual(['ADMIN', 'SUPPORT']);
    expect(roles(AdminSellerVerificationController, 'documentUrl')).toEqual(['ADMIN']);
    expect(roles(AdminSellerVerificationController, 'approve')).toEqual(['ADMIN']);
    expect(roles(AdminSellerVerificationController, 'reject')).toEqual(['ADMIN']);
    expect(roles(AdminSellerVerificationController, 'revoke')).toEqual(['ADMIN']);
  });
});
