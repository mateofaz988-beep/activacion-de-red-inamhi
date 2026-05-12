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
  selector: 'app-historial',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive],
  templateUrl: './historial.html',
  styleUrl: './historial.scss'
})
export class Historial implements OnInit {

  usuario: UsuarioLogin | null = null;

  solicitudes: SolicitudAdmin[] = [];
  solicitudesFiltradas: SolicitudAdmin[] = [];

  cargando = false;
  error = '';

  busqueda = '';
  filtroEstado = '';

  totalHistorial = 0;
  totalAprobadas = 0;
  totalRechazadas = 0;

  constructor(
    private router: Router,
    private authService: AuthService,
    private solicitudesService: SolicitudesAdminService
  ) {}

  ngOnInit(): void {
    this.usuario = this.authService.getUsuario();
    this.cargarHistorial();
  }

  cargarHistorial(): void {
    this.cargando = true;
    this.error = '';

    this.solicitudesService.listarSolicitudes().subscribe({
      next: (response) => {
        this.cargando = false;

        const solicitudes = response.solicitudes || [];

        this.solicitudes = solicitudes.filter((solicitud) =>
          this.esSolicitudDelHistorialJefe(solicitud)
        );

        this.aplicarFiltros();
        this.calcularEstadisticas();
      },
      error: (err) => {
        this.cargando = false;

        if (err.status === 401 || err.status === 403) {
          this.authService.logout();
          this.router.navigate(['/auth/login']);
          return;
        }

        this.error = err.error?.mensaje || 'No se pudo cargar el historial del jefe inmediato.';
      }
    });
  }

  esSolicitudDelHistorialJefe(solicitud: SolicitudAdmin): boolean {
    const estadosHistorial = [
      'pendiente_maxima_autoridad',
      'pendiente_tics',
      'pendiente_ejecucion_tics',
      'finalizada',
      'rechazada_jefe_inmediato',
      'rechazada_maxima_autoridad',
      'rechazada_tics'
    ];

    return estadosHistorial.includes(solicitud.estado);
  }

  aplicarFiltros(): void {
    const texto = this.busqueda.trim().toLowerCase();

    this.solicitudesFiltradas = this.solicitudes.filter((solicitud) => {
      const coincideEstado = this.filtroEstado
        ? solicitud.estado === this.filtroEstado
        : true;

      const textoCompleto = `
        ${solicitud.codigo_solicitud}
        ${solicitud.nombres_completos}
        ${solicitud.cedula}
        ${solicitud.correo_institucional}
        ${solicitud.dependencia}
        ${solicitud.area_unidad}
        ${solicitud.estado}
      `.toLowerCase();

      const coincideBusqueda = texto
        ? textoCompleto.includes(texto)
        : true;

      return coincideEstado && coincideBusqueda;
    });

    this.calcularEstadisticas();
  }

  limpiarFiltros(): void {
    this.busqueda = '';
    this.filtroEstado = '';
    this.aplicarFiltros();
  }

  calcularEstadisticas(): void {
    this.totalHistorial = this.solicitudesFiltradas.length;

    this.totalAprobadas = this.solicitudesFiltradas.filter((solicitud) =>
      [
        'pendiente_maxima_autoridad',
        'pendiente_tics',
        'pendiente_ejecucion_tics',
        'finalizada'
      ].includes(solicitud.estado)
    ).length;

    this.totalRechazadas = this.solicitudesFiltradas.filter((solicitud) =>
      solicitud.estado === 'rechazada_jefe_inmediato'
    ).length;
  }

  verDetalle(id: number): void {
    this.router.navigate(['/admin/solicitudes', id]);
  }

  getEstadoTexto(estado: string): string {
    const estados: Record<string, string> = {
      pendiente_maxima_autoridad: 'Aprobada por jefe / enviada a autoridad',
      pendiente_tics: 'En TICS',
      pendiente_ejecucion_tics: 'Pendiente ejecución TICS',
      finalizada: 'Finalizada',
      rechazada_jefe_inmediato: 'Rechazada por jefe inmediato',
      rechazada_maxima_autoridad: 'Rechazada por máxima autoridad',
      rechazada_tics: 'Rechazada por TICS'
    };

    return estados[estado] || estado;
  }

  getEstadoClase(estado: string): string {
    if (estado === 'rechazada_jefe_inmediato') {
      return 'rechazada';
    }

    if (estado.includes('rechazada')) {
      return 'rechazada-secundaria';
    }

    if (estado === 'finalizada') {
      return 'finalizada';
    }

    return 'aprobada';
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }
}