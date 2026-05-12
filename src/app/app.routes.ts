import { Routes } from '@angular/router';

import { Inicio } from './pages/inicio/inicio';
import { Login } from './auth/login/login';
import { SolicitudPublica } from './public/solicitud-publica/solicitud-publica';
import { SeguimientoSolicitud } from './public/seguimiento-solicitud/seguimiento-solicitud';

import { AdminDashboard } from './admin/dashboard/dashboard';
import { SolicitudDetalle } from './admin/solicitud-detalle/solicitud-detalle';
import { Solicitudes } from './admin/solicitudes/solicitudes';
import { Usuarios } from './admin/usuarios/usuarios';
import { Reportes } from './admin/reportes/reportes';
import { Auditoria } from './admin/auditoria/auditoria';

import { Dashboard as JefeDashboard } from './jefe/dashboard/dashboard';
import { Historial as JefeHistorial } from './jefe/historial/historial';
import { Reportes as JefeReportes } from './jefe/reportes/reportes';

import { Dashboard as AutoridadDashboard } from './autoridad/dashboard/dashboard';
import { Historial as AutoridadHistorial } from './autoridad/historial/historial';
import { Reportes as AutoridadReportes } from './autoridad/reportes/reportes';

import { TicsDashboard } from './tics/dashboard/dashboard';
import { Historial as TicsHistorial } from './tics/historial/historial';
import { Reportes as TicsReportes } from './tics/reportes/reportes';

export const routes: Routes = [
  {
    path: '',
    component: Inicio
  },
  {
    path: 'auth/login',
    component: Login
  },
  {
    path: 'public/solicitud',
    component: SolicitudPublica
  },
  {
    path: 'public/seguimiento',
    component: SeguimientoSolicitud
  },

  // =========================
  // ADMIN
  // =========================

  {
    path: 'admin/dashboard',
    component: AdminDashboard
  },
  {
    path: 'admin/solicitudes',
    component: Solicitudes
  },
  {
    path: 'admin/solicitudes/:id',
    component: SolicitudDetalle
  },
  {
    path: 'admin/usuarios',
    component: Usuarios
  },
  {
    path: 'admin/reportes',
    component: Reportes
  },
  {
    path: 'admin/auditoria',
    component: Auditoria
  },

  // =========================
  // JEFE INMEDIATO
  // =========================

  {
    path: 'jefe/dashboard',
    component: JefeDashboard
  },
  {
    path: 'jefe/historial',
    component: JefeHistorial
  },
  {
    path: 'jefe/reportes',
    component: JefeReportes
  },

  // =========================
  // MÁXIMA AUTORIDAD
  // =========================

  {
    path: 'autoridad/dashboard',
    component: AutoridadDashboard
  },
  {
    path: 'autoridad/historial',
    component: AutoridadHistorial
  },
  {
    path: 'autoridad/reportes',
    component: AutoridadReportes
  },

  // =========================
  // TICS
  // =========================

  {
    path: 'tics/dashboard',
    component: TicsDashboard
  },
  {
    path: 'tics/historial',
    component: TicsHistorial
  },
  {
    path: 'tics/reportes',
    component: TicsReportes
  },

  // =========================
  // RUTA NO ENCONTRADA
  // =========================

  {
    path: '**',
    redirectTo: ''
  }
];