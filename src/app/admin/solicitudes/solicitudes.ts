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
  selector: 'app-solicitudes',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    RouterLinkActive
  ],
  templateUrl: './solicitudes.html',
  styleUrl: './solicitudes.scss'
})
export class Solicitudes implements OnInit {

  usuario: UsuarioLogin | null = null;

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

  constructor(
    private router: Router,
    private authService: AuthService,
    private solicitudesService: SolicitudesAdminService
  ) {}

  ngOnInit(): void {
    this.usuario = this.authService.getUsuario();
    this.cargarSolicitudes();
  }

  // =====================================================
  // CARGAR SOLICITUDES
  // =====================================================

  cargarSolicitudes(): void {
    this.cargando = true;
    this.error = '';

    this.solicitudesService.listarSolicitudes().subscribe({
      next: (response) => {
        this.cargando = false;

        this.solicitudes = response.solicitudes || [];
        this.aplicarFiltros();
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

  // =====================================================
  // BÚSQUEDA Y FILTROS
  // =====================================================

  buscar(): void {
    this.aplicarFiltros();
  }

  aplicarFiltros(): void {
    const texto = this.busqueda.trim().toLowerCase();

    this.solicitudesFiltradas = this.solicitudes.filter((solicitud) => {
      const coincideTexto = texto
        ? this.obtenerTextoBusqueda(solicitud).includes(texto)
        : true;

      const coincideEstado = this.filtroEstado
        ? solicitud.estado === this.filtroEstado
        : true;

      return coincideTexto && coincideEstado;
    });

    this.calcularResumen();
  }

  limpiarFiltros(): void {
    this.busqueda = '';
    this.filtroEstado = '';
    this.aplicarFiltros();
  }

  obtenerTextoBusqueda(solicitud: SolicitudAdmin): string {
    return `
      ${solicitud.id || ''}
      ${solicitud.codigo_solicitud || ''}
      ${solicitud.nombres_completos || ''}
      ${solicitud.cedula || ''}
      ${solicitud.correo_institucional || ''}
      ${solicitud.telefono_ext || ''}
      ${solicitud.dependencia || ''}
      ${solicitud.area_unidad || ''}
      ${solicitud.cargo || ''}
      ${solicitud.estado || ''}
      ${solicitud.fecha_solicitud || ''}
      ${solicitud.created_at || ''}
    `.toLowerCase();
  }

  // =====================================================
  // RESUMEN
  // =====================================================

  calcularResumen(): void {
    this.totalSolicitudes = this.solicitudesFiltradas.length;

    this.totalPendientes = this.solicitudesFiltradas.filter((solicitud) =>
      solicitud.estado?.includes('pendiente')
    ).length;

    this.totalRechazadas = this.solicitudesFiltradas.filter((solicitud) =>
      solicitud.estado?.includes('rechazada')
    ).length;

    this.totalFinalizadas = this.solicitudesFiltradas.filter((solicitud) =>
      solicitud.estado === 'finalizada'
    ).length;
  }

  // =====================================================
  // FORMATEO DE FECHA Y HORA
  // =====================================================

  formatearFecha(fecha: string | null | undefined): string {
    if (!fecha) {
      return 'Sin fecha';
    }

    const fechaTexto = String(fecha).trim();

    if (!fechaTexto) {
      return 'Sin fecha';
    }

    const soloFecha = fechaTexto.slice(0, 10);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(soloFecha)) {
      return fechaTexto;
    }

    const [anio, mes, dia] = soloFecha.split('-');

    return `${dia}/${mes}/${anio}`;
  }

  formatearHora(fecha: string | null | undefined): string {
    if (!fecha) {
      return '--:--';
    }

    const fechaTexto = String(fecha).trim();

    if (!fechaTexto) {
      return '--:--';
    }

    // Formato MySQL: 2026-05-13 12:35:00
    if (fechaTexto.includes(' ')) {
      const partes = fechaTexto.split(' ');
      const hora = partes[1] || '';

      return hora.slice(0, 5) || '--:--';
    }

    // Formato ISO: 2026-05-13T12:35:00
    if (fechaTexto.includes('T')) {
      const partes = fechaTexto.split('T');
      const hora = partes[1] || '';

      return hora.slice(0, 5) || '--:--';
    }

    return '--:--';
  }

  // =====================================================
  // ESTADOS
  // =====================================================

  getEstadoTexto(estado: string): string {
    const estados: Record<string, string> = {
      pendiente_firma_solicitante: 'Pendiente firma solicitante',
      pendiente_jefe_inmediato: 'Pendiente jefe inmediato',
      pendiente_maxima_autoridad: 'Pendiente máxima autoridad',
      pendiente_tics: 'Pendiente TICS',
      pendiente_ejecucion_tics: 'Pendiente ejecución TICS',
      finalizada: 'Finalizada',
      rechazada_jefe_inmediato: 'Rechazada jefe inmediato',
      rechazada_maxima_autoridad: 'Rechazada máxima autoridad',
      rechazada_tics: 'Rechazada TICS',
      anulada: 'Anulada'
    };

    return estados[estado] || estado;
  }

  getEstadoClase(estado: string): string {
    if (!estado) {
      return 'normal';
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

  // =====================================================
  // SESIÓN
  // =====================================================

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }
}