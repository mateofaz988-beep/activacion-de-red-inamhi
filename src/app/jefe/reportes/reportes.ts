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
  selector: 'app-reportes-jefe',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive],
  templateUrl: './reportes.html',
  styleUrl: './reportes.scss'
})
export class Reportes implements OnInit {

  usuario: UsuarioLogin | null = null;

  solicitudes: SolicitudAdmin[] = [];
  solicitudesFiltradas: SolicitudAdmin[] = [];

  cargando = false;
  error = '';

  busqueda = '';
  filtroEstado = '';
  fechaDesde = '';
  fechaHasta = '';

  total = 0;
  aprobadas = 0;
  rechazadas = 0;
  pendientes = 0;

  constructor(
    private router: Router,
    private authService: AuthService,
    private solicitudesService: SolicitudesAdminService
  ) {}

  ngOnInit(): void {
    this.usuario = this.authService.getUsuario();
    this.cargarReporte();
  }

  cargarReporte(): void {
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

        this.error = err.error?.mensaje || 'No se pudo cargar el reporte del jefe inmediato.';
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

      /*
        Para filtrar por fecha usamos created_at porque tiene fecha y hora real.
        fecha_solicitud puede venir como 2026-05-13 00:00:00.
      */
      const coincideFecha = this.validarFecha(solicitud.created_at);

      return coincideEstado && coincideTexto && coincideFecha;
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
      ${solicitud.estado || ''}
      ${solicitud.created_at || ''}
    `.toLowerCase();
  }

  validarFecha(fechaSolicitud: string | null | undefined): boolean {
    const fecha = String(fechaSolicitud || '').slice(0, 10);

    if (!fecha) {
      return true;
    }

    if (this.fechaDesde && fecha < this.fechaDesde) {
      return false;
    }

    if (this.fechaHasta && fecha > this.fechaHasta) {
      return false;
    }

    return true;
  }

  calcularResumen(): void {
    this.total = this.solicitudesFiltradas.length;

    this.pendientes = this.solicitudesFiltradas.filter(
      s => s.estado === 'pendiente_jefe_inmediato'
    ).length;

    this.aprobadas = this.solicitudesFiltradas.filter(
      s => [
        'pendiente_maxima_autoridad',
        'pendiente_tics',
        'pendiente_ejecucion_tics',
        'finalizada'
      ].includes(s.estado)
    ).length;

    this.rechazadas = this.solicitudesFiltradas.filter(
      s => s.estado === 'rechazada_jefe_inmediato'
    ).length;
  }

  limpiarFiltros(): void {
    this.busqueda = '';
    this.filtroEstado = '';
    this.fechaDesde = '';
    this.fechaHasta = '';
    this.aplicarFiltros();
  }

  exportarCsv(): void {
    if (this.solicitudesFiltradas.length === 0) {
      this.error = 'No existen datos para exportar.';
      return;
    }

    const encabezados = [
      'Código',
      'Solicitante',
      'Cédula',
      'Correo',
      'Dependencia',
      'Área',
      'Cargo',
      'Fecha',
      'Hora',
      'Fecha y hora completa',
      'Estado'
    ];

    const filas = this.solicitudesFiltradas.map((s) => [
      s.codigo_solicitud,
      s.nombres_completos,
      s.cedula,
      s.correo_institucional,
      s.dependencia,
      s.area_unidad,
      s.cargo,
      this.formatearFecha(s.created_at),
      this.formatearHora(s.created_at),
      this.formatearFechaHora(s.created_at),
      this.getEstadoTexto(s.estado)
    ]);

    const contenido = [
      encabezados,
      ...filas
    ]
      .map(fila => fila.map(valor => `"${String(valor || '').replace(/"/g, '""')}"`).join(';'))
      .join('\n');

    const blob = new Blob(['\ufeff' + contenido], {
      type: 'text/csv;charset=utf-8;'
    });

    const url = window.URL.createObjectURL(blob);
    const enlace = document.createElement('a');

    enlace.href = url;
    enlace.download = `reporte-jefe-inmediato-${new Date().toISOString().slice(0, 10)}.csv`;
    enlace.click();

    window.URL.revokeObjectURL(url);
  }

  imprimir(): void {
    window.print();
  }

  formatearFecha(fecha: string | null | undefined): string {
    if (!fecha) {
      return 'Sin fecha';
    }

    const textoFecha = String(fecha);

    /*
      MySQL normalmente envía:
      2026-05-13 11:37:26
      Aquí tomamos solo la fecha.
    */
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

    /*
      MySQL normalmente envía:
      2026-05-13 11:37:26
      Aquí tomamos solo la hora.
    */
   
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

  formatearFechaHora(fecha: string | null | undefined): string {
    if (!fecha) {
      return 'Sin fecha y hora';
    }

    return `${this.formatearFecha(fecha)} ${this.formatearHora(fecha)}`;
  }

  getEstadoTexto(estado: string): string {
    const estados: Record<string, string> = {
      pendiente_firma_solicitante: 'Pendiente firma solicitante',
      pendiente_jefe_inmediato: 'Pendiente jefe inmediato',
      pendiente_maxima_autoridad: 'Aprobada por jefe',
      pendiente_tics: 'En TICS',
      pendiente_ejecucion_tics: 'Pendiente ejecución TICS',
      finalizada: 'Finalizada',
      rechazada_jefe_inmediato: 'Rechazada por jefe inmediato',
      rechazada_maxima_autoridad: 'Rechazada por máxima autoridad',
      rechazada_tics: 'Rechazada por TICS',
      anulada: 'Anulada'
    };

    return estados[estado] || estado;
  }

  getEstadoClase(estado: string): string {
    if (!estado) {
      return 'normal';
    }

    if (estado === 'pendiente_jefe_inmediato') {
      return 'pendiente';
    }

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