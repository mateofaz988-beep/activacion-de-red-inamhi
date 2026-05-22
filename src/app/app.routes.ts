import { Routes } from '@angular/router';

import { Inicio } from './pages/inicio/inicio';
import { Login } from './auth/login/login';

/* =====================================================
   RUTAS PÚBLICAS
===================================================== */

import { SeleccionarProceso } from './pages/seleccionar-proceso/seleccionar-proceso';
import { SolicitudPublica } from './public/solicitud-publica/solicitud-publica';
import { SeguimientoSolicitud } from './public/seguimiento-solicitud/seguimiento-solicitud';

/* =====================================================
   ADMIN
===================================================== */

import { AdminDashboard } from './admin/dashboard/dashboard';
import { SolicitudDetalle } from './admin/solicitud-detalle/solicitud-detalle';
import { Solicitudes } from './admin/solicitudes/solicitudes';
import { Usuarios } from './admin/usuarios/usuarios';
import { Reportes } from './admin/reportes/reportes';
import { Auditoria } from './admin/auditoria/auditoria';

/* =====================================================
   JEFE INMEDIATO
===================================================== */

import { Dashboard as JefeDashboard } from './jefe/dashboard/dashboard';
import { Historial as JefeHistorial } from './jefe/historial/historial';
import { Reportes as JefeReportes } from './jefe/reportes/reportes';

/* =====================================================
   MÁXIMA AUTORIDAD
===================================================== */

import { AutoridadDashboard } from './autoridad/dashboard/dashboard';
import { Historial as AutoridadHistorial } from './autoridad/historial/historial';
import { Reportes as AutoridadReportes } from './autoridad/reportes/reportes';

/* =====================================================
   TICS
===================================================== */

import { TicsDashboard } from './tics/dashboard/dashboard';
import { Historial as TicsHistorial } from './tics/historial/historial';
import { Reportes as TicsReportes } from './tics/reportes/reportes';

/* =====================================================
   GUARDS
===================================================== */

import { roleGuard } from './guards/role-guard';

export const routes: Routes = [
  /* =====================================================
     INICIO
  ====================================================== */

  {
    path: '',
    component: Inicio
  },

  /* =====================================================
     AUTENTICACIÓN
  ====================================================== */

  {
    path: 'auth/login',
    component: Login
  },

  /* =====================================================
     PÚBLICO
  ====================================================== */

  {
    path: 'seleccionar-proceso',
    component: SeleccionarProceso
  },
  {
    path: 'public/solicitud',
    component: SolicitudPublica
  },
  {
    path: 'public/seguimiento',
    component: SeguimientoSolicitud
  },

  /* =====================================================
     ADMIN
  ====================================================== */

  {
    path: 'admin/dashboard',
    component: AdminDashboard,
    canActivate: [roleGuard],
    data: {
      roles: ['administrador']
    }
  },
  {
    path: 'admin/solicitudes',
    component: Solicitudes,
    canActivate: [roleGuard],
    data: {
      roles: ['administrador']
    }
  },
  {
    path: 'admin/solicitudes/:id',
    component: SolicitudDetalle,
    canActivate: [roleGuard],
    data: {
      roles: ['administrador']
    }
  },
  {
    path: 'admin/solicitud-detalle/:id',
    component: SolicitudDetalle,
    canActivate: [roleGuard],
    data: {
      roles: ['administrador']
    }
  },
  {
    path: 'admin/usuarios',
    component: Usuarios,
    canActivate: [roleGuard],
    data: {
      roles: ['administrador']
    }
  },
  {
    path: 'admin/reportes',
    component: Reportes,
    canActivate: [roleGuard],
    data: {
      roles: ['administrador']
    }
  },
  {
    path: 'admin/auditoria',
    component: Auditoria,
    canActivate: [roleGuard],
    data: {
      roles: ['administrador']
    }
  },

  /* =====================================================
     JEFE INMEDIATO
  ====================================================== */

  {
    path: 'jefe/dashboard',
    component: JefeDashboard,
    canActivate: [roleGuard],
    data: {
      roles: ['jefe_inmediato']
    }
  },
  {
    path: 'jefe/historial',
    component: JefeHistorial,
    canActivate: [roleGuard],
    data: {
      roles: ['jefe_inmediato']
    }
  },
  {
    path: 'jefe/reportes',
    component: JefeReportes,
    canActivate: [roleGuard],
    data: {
      roles: ['jefe_inmediato']
    }
  },
  {
    path: 'jefe/solicitud-detalle/:id',
    component: SolicitudDetalle,
    canActivate: [roleGuard],
    data: {
      roles: ['jefe_inmediato']
    }
  },
  {
    path: 'jefe/solicitudes/:id',
    component: SolicitudDetalle,
    canActivate: [roleGuard],
    data: {
      roles: ['jefe_inmediato']
    }
  },

  /* =====================================================
     MÁXIMA AUTORIDAD
  ====================================================== */

  {
    path: 'autoridad/dashboard',
    component: AutoridadDashboard,
    canActivate: [roleGuard],
    data: {
      roles: ['maxima_autoridad']
    }
  },
  {
    path: 'autoridad/historial',
    component: AutoridadHistorial,
    canActivate: [roleGuard],
    data: {
      roles: ['maxima_autoridad']
    }
  },
  {
    path: 'autoridad/reportes',
    component: AutoridadReportes,
    canActivate: [roleGuard],
    data: {
      roles: ['maxima_autoridad']
    }
  },
  {
    path: 'autoridad/solicitud-detalle/:id',
    component: SolicitudDetalle,
    canActivate: [roleGuard],
    data: {
      roles: ['maxima_autoridad']
    }
  },
  {
    path: 'autoridad/solicitudes/:id',
    component: SolicitudDetalle,
    canActivate: [roleGuard],
    data: {
      roles: ['maxima_autoridad']
    }
  },

  /* =====================================================
     TICS
  ====================================================== */

  {
    path: 'tics/dashboard',
    component: TicsDashboard,
    canActivate: [roleGuard],
    data: {
      roles: ['analista_tics']
    }
  },
  {
    path: 'tics/historial',
    component: TicsHistorial,
    canActivate: [roleGuard],
    data: {
      roles: ['analista_tics']
    }
  },
  {
    path: 'tics/reportes',
    component: TicsReportes,
    canActivate: [roleGuard],
    data: {
      roles: ['analista_tics']
    }
  },
  {
    path: 'tics/solicitud-detalle/:id',
    component: SolicitudDetalle,
    canActivate: [roleGuard],
    data: {
      roles: ['analista_tics']
    }
  },
  {
    path: 'tics/solicitudes/:id',
    component: SolicitudDetalle,
    canActivate: [roleGuard],
    data: {
      roles: ['analista_tics']
    }
  },

  /* =====================================================
     RUTA NO ENCONTRADA
  ====================================================== */

  {
    path: '**',
    redirectTo: ''
  }
];