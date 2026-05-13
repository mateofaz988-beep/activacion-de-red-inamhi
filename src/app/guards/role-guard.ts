import { inject } from '@angular/core';
import {
  CanActivateFn,
  Router,
  ActivatedRouteSnapshot
} from '@angular/router';

import { AuthService } from '../services/auth.service';

export const roleGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot
) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    router.navigate(['/auth/login']);
    return false;
  }

  const rolesPermitidos = route.data?.['roles'] as string[] | undefined;

  if (!rolesPermitidos || rolesPermitidos.length === 0) {
    return true;
  }

  if (authService.tieneRol(rolesPermitidos)) {
    return true;
  }

  router.navigate([authService.getRutaDashboardPorRol()]);
  return false;
};