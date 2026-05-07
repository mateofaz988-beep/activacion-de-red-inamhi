import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService, UsuarioLogin } from '../../services/auth.service';
import {
  SolicitudAdmin,
  SolicitudesAdminService
} from '../../services/solicitudes-admin.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class AdminDashboard implements OnInit {

  solicitudes: SolicitudAdmin[] = [];
  solicitudesFiltradas: SolicitudAdmin[] = [];

  cargando = false;
  error = '';

  busqueda = '';
  filtroEstado = '';

  totalSolicitudes = 0;
  totalPendientes = 0;
  totalRechazadas = 0;
  totalFinalizadas = 0;

  usuario: UsuarioLogin | null = null;

  constructor(
    private solicitudesService: SolicitudesAdminService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.usuario = this.authService.getUsuario();
    this.cargarSolicitudes();
  }

  cargarSolicitudes(): void {
    this.cargando = true;
    this.error = '';

    this.solicitudesService.listarSolicitudes(this.filtroEstado, this.busqueda.trim()).subscribe({
      next: (response) => {
        this.cargando = false;
        this.solicitudes = response.solicitudes || [];
        this.solicitudesFiltradas = [...this.solicitudes];
        this.calcularEstadisticas();
      },
      error: (err) => {
        this.cargando = false;

        if (err.status === 401 || err.status === 403) {
          this.authService.logout();
          this.router.navigate(['/auth/login']);
          return;
        }

        this.error = err.error?.mensaje || 'No se pudieron cargar las solicitudes.';
      }
    });
  }

  calcularEstadisticas(): void {
    this.totalSolicitudes = this.solicitudes.length;

    this.totalPendientes = this.solicitudes.filter((solicitud) =>
      solicitud.estado.includes('pendiente')
    ).length;

    this.totalRechazadas = this.solicitudes.filter((solicitud) =>
      solicitud.estado.includes('rechazada')
    ).length;

    this.totalFinalizadas = this.solicitudes.filter((solicitud) =>
      solicitud.estado === 'finalizada'
    ).length;
  }

  buscar(): void {
    this.cargarSolicitudes();
  }

  limpiarFiltros(): void {
    this.busqueda = '';
    this.filtroEstado = '';
    this.cargarSolicitudes();
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }

  getEstadoTexto(estado: string): string {
    const estados: Record<string, string> = {
      pendiente_firma_solicitante: 'Pendiente firma solicitante',
      pendiente_jefe_inmediato: 'Pendiente jefe inmediato',
      rechazada_jefe_inmediato: 'Rechazada jefe inmediato',
      pendiente_maxima_autoridad: 'Pendiente máxima autoridad',
      rechazada_maxima_autoridad: 'Rechazada máxima autoridad',
      pendiente_tics: 'Pendiente TICS',
      rechazada_tics: 'Rechazada TICS',
      pendiente_ejecucion_tics: 'Pendiente ejecución TICS',
      finalizada: 'Finalizada',
      anulada: 'Anulada'
    };

    return estados[estado] || estado;
  }

  getEstadoClase(estado: string): string {
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
}