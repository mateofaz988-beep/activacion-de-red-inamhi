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
  selector: 'app-tics-reportes',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    RouterLinkActive
  ],
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
  pendientes = 0;
  ejecucion = 0;
  finalizadas = 0;
  rechazadas = 0;

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

        const solicitudes = response.solicitudes || [];

        this.solicitudes = solicitudes.filter((solicitud) =>
          [
            'pendiente_tics',
            'pendiente_ejecucion_tics',
            'finalizada',
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

        this.error = err.error?.mensaje || 'No se pudo cargar el reporte TICS.';
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
        Usamos created_at porque contiene fecha y hora real.
        fecha_solicitud normalmente puede venir como 2026-05-13 00:00:00.
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
      ${solicitud.cargo || ''}
      ${solicitud.estado || ''}
      ${solicitud.etapa_actual || ''}
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
      solicitud => solicitud.estado === 'pendiente_tics'
    ).length;

    this.ejecucion = this.solicitudesFiltradas.filter(
      solicitud => solicitud.estado === 'pendiente_ejecucion_tics'
    ).length;

    this.finalizadas = this.solicitudesFiltradas.filter(
      solicitud => solicitud.estado === 'finalizada'
    ).length;

    this.rechazadas = this.solicitudesFiltradas.filter(
      solicitud => solicitud.estado === 'rechazada_tics'
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
      'Área / Unidad',
      'Cargo',
      'Fecha',
      'Hora',
      'Fecha y hora completa',
      'Estado'
    ];

    const filas = this.solicitudesFiltradas.map((solicitud) => [
      solicitud.codigo_solicitud,
      solicitud.nombres_completos,
      solicitud.cedula,
      solicitud.correo_institucional,
      solicitud.dependencia,
      solicitud.area_unidad,
      solicitud.cargo,
      this.formatearFecha(solicitud.created_at),
      this.formatearHora(solicitud.created_at),
      this.formatearFechaHora(solicitud.created_at),
      this.getEstadoTexto(solicitud.estado)
    ]);

    const contenido = [
      encabezados,
      ...filas
    ]
      .map((fila) =>
        fila
          .map((valor) => `"${String(valor || '').replace(/"/g, '""')}"`)
          .join(';')
      )
      .join('\n');

    const blob = new Blob(['\ufeff' + contenido], {
      type: 'text/csv;charset=utf-8;'
    });

    const url = window.URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    const fechaActual = new Date().toISOString().slice(0, 10);

    enlace.href = url;
    enlace.download = `reporte-tics-${fechaActual}.csv`;
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

  formatearFechaHora(fecha: string | null | undefined): string {
    if (!fecha) {
      return 'Sin fecha y hora';
    }

    return `${this.formatearFecha(fecha)} ${this.formatearHora(fecha)}`;
  }

  getEstadoTexto(estado: string): string {
    const estados: Record<string, string> = {
      pendiente_tics: 'Pendiente validación TICS',
      pendiente_ejecucion_tics: 'Pendiente ejecución TICS',
      finalizada: 'Finalizada',
      rechazada_tics: 'Rechazada por TICS'
    };

    return estados[estado] || estado;
  }

  getEstadoClase(estado: string): string {
    if (!estado) {
      return 'normal';
    }

    if (estado === 'pendiente_tics') {
      return 'pendiente';
    }

    if (estado === 'pendiente_ejecucion_tics') {
      return 'ejecucion';
    }

    if (estado === 'finalizada') {
      return 'finalizada';
    }

    if (estado === 'rechazada_tics') {
      return 'rechazada';
    }

    if (estado.includes('rechazada')) {
      return 'rechazada-secundaria';
    }

    return 'normal';
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }
}