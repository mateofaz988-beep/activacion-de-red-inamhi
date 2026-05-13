import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

import { AuthService, UsuarioLogin } from '../../services/auth.service';
import {
  SolicitudAdmin,
  SolicitudesAdminService
} from '../../services/solicitudes-admin.service';

@Component({
  selector: 'app-dashboard-autoridad',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    RouterLinkActive
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class Dashboard implements OnInit {

  usuario: UsuarioLogin | null = null;

  solicitudes: SolicitudAdmin[] = [];
  solicitudesOriginales: SolicitudAdmin[] = [];

  cargando = false;
  error = '';
  busqueda = '';

  constructor(
    private router: Router,
    private authService: AuthService,
    private solicitudesService: SolicitudesAdminService
  ) {}

  ngOnInit(): void {
    this.usuario = this.authService.getUsuario();
    this.cargarSolicitudes();
  }

  cargarSolicitudes(): void {
    this.cargando = true;
    this.error = '';

    this.solicitudesService.listarSolicitudes().subscribe({
      next: (response) => {
        this.cargando = false;

        const solicitudes = response.solicitudes || [];

        /*
          Máxima autoridad solo debe ver solicitudes que están
          pendientes de aprobación por máxima autoridad.
        */
        this.solicitudesOriginales = solicitudes.filter((solicitud) =>
          solicitud.estado === 'pendiente_maxima_autoridad'
        );

        this.solicitudes = [...this.solicitudesOriginales];
      },
      error: (err) => {
        this.cargando = false;

        if (err.status === 401 || err.status === 403) {
          this.authService.logout();
          this.router.navigate(['/auth/login']);
          return;
        }

        this.error = err.error?.mensaje || 'No se pudieron cargar las solicitudes de máxima autoridad.';
      }
    });
  }

  buscar(): void {
    const texto = this.busqueda.trim().toLowerCase();

    if (!texto) {
      this.solicitudes = [...this.solicitudesOriginales];
      return;
    }

    this.solicitudes = this.solicitudesOriginales.filter((solicitud) =>
      this.obtenerTextoBusqueda(solicitud).includes(texto)
    );
  }

  limpiar(): void {
    this.busqueda = '';
    this.solicitudes = [...this.solicitudesOriginales];
  }

  obtenerTextoBusqueda(solicitud: SolicitudAdmin): string {
    return `
      ${solicitud.codigo_solicitud || ''}
      ${solicitud.nombres_completos || ''}
      ${solicitud.cedula || ''}
      ${solicitud.correo_institucional || ''}
      ${solicitud.dependencia || ''}
      ${solicitud.area_unidad || ''}
      ${solicitud.cargo || ''}
      ${solicitud.estado || ''}
      ${solicitud.etapa_actual || ''}
    `.toLowerCase();
  }

  verDetalle(id: number): void {
    /*
      Importante:
      Máxima autoridad NO debe ir a /admin/solicitudes/:id.
      Usa su propia ruta protegida.
    */
    this.router.navigate(['/autoridad/solicitudes', id]);
  }

  getEstadoTexto(estado: string): string {
    const estados: Record<string, string> = {
      pendiente_firma_solicitante: 'Pendiente firma solicitante',
      pendiente_jefe_inmediato: 'Pendiente jefe inmediato',
      rechazada_jefe_inmediato: 'Rechazada por jefe inmediato',
      pendiente_maxima_autoridad: 'Pendiente máxima autoridad',
      rechazada_maxima_autoridad: 'Rechazada por máxima autoridad',
      pendiente_tics: 'Pendiente TICS',
      rechazada_tics: 'Rechazada por TICS',
      pendiente_ejecucion_tics: 'Pendiente ejecución TICS',
      finalizada: 'Finalizada',
      anulada: 'Anulada'
    };

    return estados[estado] || estado;
  }

  getEstadoClase(estado: string): string {
    if (!estado) {
      return 'normal';
    }

    if (estado === 'pendiente_maxima_autoridad') {
      return 'autoridad-status';
    }

    if (estado.includes('rechazada')) {
      return 'rechazada';
    }

    if (estado === 'finalizada') {
      return 'finalizada';
    }

    if (estado.includes('pendiente')) {
      return 'pendiente';
    }

    return 'normal';
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }
}