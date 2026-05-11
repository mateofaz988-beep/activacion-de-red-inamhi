import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../services/auth.service';
import {
  SolicitudAdmin,
  SolicitudesAdminService
} from '../../services/solicitudes-admin.service';

@Component({
  selector: 'app-reportes',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './reportes.html',
  styleUrl: './reportes.scss'
})
export class Reportes implements OnInit {

  solicitudes: SolicitudAdmin[] = [];
  solicitudesFiltradas: SolicitudAdmin[] = [];

  cargando = false;
  error = '';

  textoBusqueda = '';
  filtroEstado = '';
  fechaDesde = '';
  fechaHasta = '';

  totalSolicitudes = 0;
  totalPendientes = 0;
  totalAprobacion = 0;
  totalTics = 0;
  totalFinalizadas = 0;
  totalRechazadas = 0;

  estados = [
    { valor: '', texto: 'Todos los estados' },
    { valor: 'pendiente_firma_solicitante', texto: 'Pendiente firma solicitante' },
    { valor: 'pendiente_jefe_inmediato', texto: 'Pendiente jefe inmediato' },
    { valor: 'pendiente_maxima_autoridad', texto: 'Pendiente máxima autoridad' },
    { valor: 'pendiente_tics', texto: 'Pendiente TICS' },
    { valor: 'pendiente_ejecucion_tics', texto: 'Pendiente ejecución TICS' },
    { valor: 'finalizada', texto: 'Finalizada' },
    { valor: 'rechazada_jefe_inmediato', texto: 'Rechazada jefe inmediato' },
    { valor: 'rechazada_maxima_autoridad', texto: 'Rechazada máxima autoridad' },
    { valor: 'rechazada_tics', texto: 'Rechazada TICS' },
    { valor: 'anulada', texto: 'Anulada' }
  ];

  constructor(
    private router: Router,
    private authService: AuthService,
    private solicitudesService: SolicitudesAdminService
  ) {}

  ngOnInit(): void {
    this.cargarDatos();
  }

  cargarDatos(): void {
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

        this.error = err.error?.mensaje || 'No se pudieron cargar los datos del reporte.';
      }
    });
  }

  aplicarFiltros(): void {
    const busqueda = this.textoBusqueda.trim().toLowerCase();

    this.solicitudesFiltradas = this.solicitudes.filter((solicitud) => {
      const coincideEstado = this.filtroEstado
        ? solicitud.estado === this.filtroEstado
        : true;

      const coincideBusqueda = busqueda
        ? this.obtenerTextoBusqueda(solicitud).includes(busqueda)
        : true;

      const coincideFecha = this.validarRangoFecha(solicitud.fecha_solicitud);

      return coincideEstado && coincideBusqueda && coincideFecha;
    });

    this.calcularResumen();
  }

  obtenerTextoBusqueda(solicitud: SolicitudAdmin): string {
    return `
      ${solicitud.codigo_solicitud}
      ${solicitud.nombres_completos}
      ${solicitud.cedula}
      ${solicitud.correo_institucional}
      ${solicitud.telefono_ext}
      ${solicitud.dependencia}
      ${solicitud.area_unidad}
      ${solicitud.cargo}
      ${solicitud.estado}
      ${solicitud.etapa_actual}
    `.toLowerCase();
  }

  validarRangoFecha(fechaSolicitud: string): boolean {
    if (!this.fechaDesde && !this.fechaHasta) {
      return true;
    }

    const fecha = this.normalizarFecha(fechaSolicitud);

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

  normalizarFecha(fecha: string): string {
    if (!fecha) {
      return '';
    }

    return String(fecha).slice(0, 10);
  }

  calcularResumen(): void {
    this.totalSolicitudes = this.solicitudesFiltradas.length;

    this.totalPendientes = this.solicitudesFiltradas.filter((solicitud) => {
      return solicitud.estado === 'pendiente_firma_solicitante';
    }).length;

    this.totalAprobacion = this.solicitudesFiltradas.filter((solicitud) => {
      return [
        'pendiente_jefe_inmediato',
        'pendiente_maxima_autoridad'
      ].includes(solicitud.estado);
    }).length;

    this.totalTics = this.solicitudesFiltradas.filter((solicitud) => {
      return [
        'pendiente_tics',
        'pendiente_ejecucion_tics'
      ].includes(solicitud.estado);
    }).length;

    this.totalFinalizadas = this.solicitudesFiltradas.filter((solicitud) => {
      return solicitud.estado === 'finalizada';
    }).length;

    this.totalRechazadas = this.solicitudesFiltradas.filter((solicitud) => {
      return solicitud.estado.includes('rechazada');
    }).length;
  }

  limpiarFiltros(): void {
    this.textoBusqueda = '';
    this.filtroEstado = '';
    this.fechaDesde = '';
    this.fechaHasta = '';
    this.aplicarFiltros();
  }

  imprimirReporte(): void {
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
      'Teléfono',
      'Dependencia',
      'Área / Unidad',
      'Cargo',
      'Fecha solicitud',
      'Tipo usuario',
      'Estado',
      'Etapa',
      'Páginas solicitadas',
      'Creado',
      'Actualizado'
    ];

    const filas = this.solicitudesFiltradas.map((solicitud) => [
      solicitud.codigo_solicitud,
      solicitud.nombres_completos,
      solicitud.cedula,
      solicitud.correo_institucional,
      solicitud.telefono_ext,
      solicitud.dependencia,
      solicitud.area_unidad,
      solicitud.cargo,
      solicitud.fecha_solicitud,
      solicitud.tipo_usuario,
      this.getEstadoTexto(solicitud.estado),
      this.getEtapaTexto(solicitud.etapa_actual),
      String(solicitud.total_paginas || 0),
      solicitud.created_at,
      solicitud.updated_at
    ]);

    const contenido = [
      encabezados,
      ...filas
    ]
      .map((fila) => fila.map((valor) => this.escaparCsv(valor)).join(';'))
      .join('\n');

    const blob = new Blob(['\ufeff' + contenido], {
      type: 'text/csv;charset=utf-8;'
    });

    const url = window.URL.createObjectURL(blob);
    const enlace = document.createElement('a');

    const fechaActual = new Date().toISOString().slice(0, 10);

    enlace.href = url;
    enlace.download = `reporte-solicitudes-inamhi-${fechaActual}.csv`;
    enlace.click();

    window.URL.revokeObjectURL(url);
  }

  escaparCsv(valor: string): string {
    const texto = String(valor || '').replace(/"/g, '""');
    return `"${texto}"`;
  }

  verDetalle(id: number): void {
    this.router.navigate(['/admin/solicitudes', id]);
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

    return etapas[etapa] || etapa;
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

    if (estado === 'pendiente_tics' || estado === 'pendiente_ejecucion_tics') {
      return 'tics';
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