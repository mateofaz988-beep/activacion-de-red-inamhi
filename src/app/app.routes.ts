import { Routes } from '@angular/router';

import { Inicio } from './pages/inicio/inicio';
import { Login } from './auth/login/login';
import { SolicitudPublica } from './public/solicitud-publica/solicitud-publica';
import { SeguimientoSolicitud } from './public/seguimiento-solicitud/seguimiento-solicitud';

import { AdminDashboard } from './admin/dashboard/dashboard';
import { SolicitudDetalle } from './admin/solicitud-detalle/solicitud-detalle';

import { Dashboard as JefeDashboard } from './jefe/dashboard/dashboard';
import { Dashboard as AutoridadDashboard } from './autoridad/dashboard/dashboard';
import { TicsDashboard } from './tics/dashboard/dashboard';

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
  {
    path: 'admin/dashboard',
    component: AdminDashboard
  },
  {
    path: 'admin/solicitudes/:id',
    component: SolicitudDetalle
  },
  {
    path: 'jefe/dashboard',
    component: JefeDashboard
  },
  {
    path: 'autoridad/dashboard',
    component: AutoridadDashboard
  },
  {
    path: 'tics/dashboard',
    component: TicsDashboard
  },
  {
    path: '**',
    redirectTo: ''
  }
];