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

      const contenido = `
        ${solicitud.codigo_solicitud}
        ${solicitud.nombres_completos}
        ${solicitud.cedula}
        ${solicitud.correo_institucional}
        ${solicitud.dependencia}
        ${solicitud.area_unidad}
        ${solicitud.estado}
      `.toLowerCase();

      const coincideBusqueda = texto
        ? contenido.includes(texto)
        : true;

      const fechaSolicitud = String(solicitud.fecha_solicitud || '').slice(0, 10);

      const coincideFechaDesde = this.fechaDesde
        ? fechaSolicitud >= this.fechaDesde
        : true;

      const coincideFechaHasta = this.fechaHasta
        ? fechaSolicitud <= this.fechaHasta
        : true;

      return coincideEstado && coincideBusqueda && coincideFechaDesde && coincideFechaHasta;
    });

    this.calcularResumen();
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

  imprimir(): void {
    window.print();
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
      'Estado',
      'Fecha'
    ];

    const filas = this.solicitudesFiltradas.map((s) => [
      s.codigo_solicitud,
      s.nombres_completos,
      s.cedula,
      s.correo_institucional,
      s.dependencia,
      s.area_unidad,
      this.getEstadoTexto(s.estado),
      s.fecha_solicitud
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
    enlace.download = `reporte-tics-${new Date().toISOString().slice(0, 10)}.csv`;
    enlace.click();

    window.URL.revokeObjectURL(url);
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

    return 'normal';
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }
}