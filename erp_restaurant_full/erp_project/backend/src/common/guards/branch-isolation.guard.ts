/**
 * Phase 2: Branch Isolation Guard
 *
 * Automatically injects branchId filtering from the JWT branchIds array.
 * SUPER_ADMIN bypasses isolation. All other roles are restricted to their
 * assigned branches only.
 */
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

@Injectable()
export class BranchIsolationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) return true;
    // SUPER_ADMIN bypasses branch isolation
    if (user.role === 'SUPER_ADMIN') return true;

    const branchIds: number[] = user.branchIds || [];
    if (branchIds.length === 0 && user.branchId) {
      branchIds.push(user.branchId);
    }

    // If a branchId is specified in query/body, validate it's in the user's assigned branches
    const queryBranchId = parseInt(request.query?.branchId, 10);
    const bodyBranchId = parseInt(request.body?.branchId, 10);

    if (queryBranchId && !isNaN(queryBranchId)) {
      if (!branchIds.includes(queryBranchId)) {
        throw new ForbiddenException('Access denied: you are not assigned to this branch');
      }
    }

    if (bodyBranchId && !isNaN(bodyBranchId)) {
      if (!branchIds.includes(bodyBranchId)) {
        throw new ForbiddenException('Access denied: you are not assigned to this branch');
      }
    }

    // If no branchId specified in query, auto-inject the user's active branch
    // so controllers always get filtered data
    if (!request.query?.branchId && branchIds.length > 0) {
      // Inject the user's active branchId (from JWT) as default filter
      request.query = request.query || {};
      if (branchIds.length === 1) {
        request.query.branchId = String(branchIds[0]);
      } else if (user.branchId) {
        request.query.branchId = String(user.branchId);
      }
    }

    // Store branchIds on request for services that need multi-branch queries
    request.userBranchIds = branchIds;

    return true;
  }
}
