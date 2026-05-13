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
  selector: 'app-historial-autoridad',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    RouterLinkActive
  ],
  templateUrl: './historial.html',
  styleUrl: './historial.scss'
})
export class Historial implements OnInit {

  usuario: UsuarioLogin | null = null;

  solicitudes: SolicitudAdmin[] = [];
  solicitudesFiltradas: SolicitudAdmin[] = [];

  solicitudSeleccionada: SolicitudAdmin | null = null;
  mostrarModalDetalle = false;

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
          [
            'pendiente_tics',
            'pendiente_ejecucion_tics',
            'finalizada',
            'rechazada_maxima_autoridad',
            'rechazada_tics'
          ].includes(solicitud.estado)
        );

        this.aplicarFiltros();
      },
      error: (err) => {
        this.cargando = false;

        if (err.status === 401 || err.status === 403) {
          this.authService.logout();
          this.router.navigate(['/auth/login']);
          return;
        }

        this.error = err.error?.mensaje || 'No se pudo cargar el historial de máxima autoridad.';
      }
    });
  }

  aplicarFiltros(): void {
    const texto = this.busqueda.trim().toLowerCase();

    this.solicitudesFiltradas = this.solicitudes.filter((solicitud) => {
      const coincideEstado = this.filtroEstado
        ? solicitud.estado === this.filtroEstado
        : true;

      const coincideTexto = texto
        ? this.obtenerTextoBusqueda(solicitud).includes(texto)
        : true;

      return coincideEstado && coincideTexto;
    });

    this.calcularResumen();
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
      ${solicitud.created_at || ''}
    `.toLowerCase();
  }

  calcularResumen(): void {
    this.totalHistorial = this.solicitudesFiltradas.length;

    this.totalAprobadas = this.solicitudesFiltradas.filter((solicitud) =>
      [
        'pendiente_tics',
        'pendiente_ejecucion_tics',
        'finalizada'
      ].includes(solicitud.estado)
    ).length;

    this.totalRechazadas = this.solicitudesFiltradas.filter((solicitud) =>
      solicitud.estado === 'rechazada_maxima_autoridad'
    ).length;
  }

  limpiarFiltros(): void {
    this.busqueda = '';
    this.filtroEstado = '';
    this.aplicarFiltros();
  }

  abrirDetalle(solicitud: SolicitudAdmin): void {
    this.solicitudSeleccionada = solicitud;
    this.mostrarModalDetalle = true;
  }

  cerrarDetalle(): void {
    this.solicitudSeleccionada = null;
    this.mostrarModalDetalle = false;
  }

  formatearFecha(fecha: string | null | undefined): string {
    if (!fecha) {
      return 'Sin fecha';
    }

    const textoFecha = String(fecha);

    if (textoFecha.includes(' ')) {
      const [soloFecha] = textoFecha.split(' ');
      return soloFecha;
    }

    const fechaObj = new Date(textoFecha);

    if (Number.isNaN(fechaObj.getTime())) {
      return textoFecha.slice(0, 10);
    }

    return fechaObj.toLocaleDateString('es-EC', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }

  formatearHora(fecha: string | null | undefined): string {
    if (!fecha) {
      return 'Sin hora';
    }

    const textoFecha = String(fecha);

    if (textoFecha.includes(' ')) {
      const partes = textoFecha.split(' ');
      return partes[1] || 'Sin hora';
    }

    const fechaObj = new Date(textoFecha);

    if (Number.isNaN(fechaObj.getTime())) {
      return 'Sin hora';
    }

    return fechaObj.toLocaleTimeString('es-EC', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  }

  getEstadoTexto(estado: string): string {
    const estados: Record<string, string> = {
      pendiente_firma_solicitante: 'Pendiente firma solicitante',
      pendiente_jefe_inmediato: 'Pendiente jefe inmediato',
      rechazada_jefe_inmediato: 'Rechazada por jefe inmediato',
      pendiente_maxima_autoridad: 'Pendiente máxima autoridad',
      rechazada_maxima_autoridad: 'Rechazada por máxima autoridad',
      pendiente_tics: 'Aprobada por máxima autoridad',
      rechazada_tics: 'Rechazada por TICS',
      pendiente_ejecucion_tics: 'Pendiente ejecución TICS',
      finalizada: 'Finalizada',
      anulada: 'Anulada'
    };

    return estados[estado] || estado;
  }

  getEtapaTexto(etapa: string): string {
    const etapas: Record<string, string> = {
      registro_publico: 'Registro público',
      firma_solicitante: 'Firma del solicitante',
      jefe_inmediato: 'Jefe inmediato',
      maxima_autoridad: 'Máxima autoridad',
      tics: 'Validación TICS',
      ejecucion_tics: 'Ejecución TICS',
      finalizado: 'Finalizado'
    };

    return etapas[etapa] || etapa || 'No registrada';
  }

  getEstadoClase(estado: string): string {
    if (!estado) {
      return 'normal';
    }

    if (estado === 'rechazada_maxima_autoridad') {
      return 'rechazada';
    }

    if (estado.includes('rechazada')) {
      return 'rechazada-secundaria';
    }

    if (estado === 'finalizada') {
      return 'finalizada';
    }

    if (
      estado === 'pendiente_tics' ||
      estado === 'pendiente_ejecucion_tics'
    ) {
      return 'aprobada';
    }

    return 'normal';
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }
}