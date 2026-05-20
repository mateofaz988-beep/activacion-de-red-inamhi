import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

import { AuthService, UsuarioLogin } from '../../services/auth.service';

export interface SolicitudAutoridad {
  id: number;
  codigo_solicitud: string;
  nombres_completos: string;
  cedula: string;
  correo_institucional: string;
  telefono_ext: string;
  dependencia: string;
  area_unidad: string;
  cargo: string;
  fecha_solicitud: string;
  tipo_usuario: string;
  nombre_usuario_externo?: string | null;
  direccion_ip?: string | null;
  tiempo_vigencia_acceso: string;
  justificacion_necesidad_institucional: string;
  estado: string;
  etapa_actual: string;
  bloqueada: boolean;
  created_at: string;
  updated_at: string;
  total_paginas: number;
}

interface RespuestaSolicitudesAutoridad {
  estado?: string;
  mensaje?: string;
  total?: number;
  solicitudes?: SolicitudAutoridad[];
}

@Component({
  selector: 'app-autoridad-dashboard',
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
export class AutoridadDashboard implements OnInit {

  /*
    LOCAL:
    http://localhost:5050/api

    SERVIDOR CON NGINX:
    /api
  */
  private readonly API_URL = 'http://localhost:5050/api';

  solicitudes: SolicitudAutoridad[] = [];
  solicitudesFiltradas: SolicitudAutoridad[] = [];

  cargando = false;
  error = '';

  busqueda = '';
  filtroEstado = '';

  totalSolicitudes = 0;
  totalPendientes = 0;
  totalFinalizadas = 0;
  totalRechazadas = 0;

  usuario: UsuarioLogin | null = null;

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.usuario = this.authService.getUsuario();

    if (!this.authService.getToken()) {
      this.router.navigate(['/auth/login']);
      return;
    }

    this.cargarSolicitudes();
  }

  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();

    return new HttpHeaders({
      Authorization: `Bearer ${token || ''}`
    });
  }

  cargarSolicitudes(): void {
    this.cargando = true;
    this.error = '';

    let params = new HttpParams();

    const busquedaLimpia = this.busqueda.trim();

    if (busquedaLimpia) {
      params = params.set('q', busquedaLimpia);
    }

    /*
      Este endpoint debe devolver únicamente las solicitudes asignadas
      a la máxima autoridad, es decir:
      estado = pendiente_maxima_autoridad
      etapa_actual = maxima_autoridad
    */
    this.http.get<RespuestaSolicitudesAutoridad>(`${this.API_URL}/mis-solicitudes`, {
      headers: this.getHeaders(),
      params
    }).subscribe({
      next: (response) => {
        this.cargando = false;

        if (response.estado && response.estado !== 'ok') {
          this.solicitudes = [];
          this.solicitudesFiltradas = [];
          this.calcularEstadisticas();
          this.error = response.mensaje || 'No se pudieron cargar las solicitudes asignadas.';
          return;
        }

        this.solicitudes = response.solicitudes || [];

        /*
          Seguridad visual:
          aunque el backend debería filtrar por rol, aquí nos aseguramos
          de mostrar solo las solicitudes que corresponden a máxima autoridad.
        */
        this.solicitudes = this.solicitudes.filter((solicitud) =>
          solicitud.estado === 'pendiente_maxima_autoridad' ||
          solicitud.estado === 'rechazada_maxima_autoridad' ||
          solicitud.estado === 'pendiente_tics' ||
          solicitud.estado === 'pendiente_ejecucion_tics' ||
          solicitud.estado === 'finalizada'
        );

        this.aplicarFiltroEstado();
        this.calcularEstadisticas();
      },
      error: (err) => {
        this.cargando = false;
        this.solicitudes = [];
        this.solicitudesFiltradas = [];
        this.calcularEstadisticas();

        if (err.status === 401 || err.status === 403) {
          this.authService.logout();
          this.router.navigate(['/auth/login']);
          return;
        }

        if (err.status === 0) {
          this.error = 'No se pudo conectar con el servidor Flask. Verifique que el backend esté encendido en el puerto 5050.';
          return;
        }

        if (err.status === 404) {
          this.error = 'No existe la ruta /api/mis-solicitudes en Flask o no está registrada correctamente.';
          return;
        }

        if (err.status === 500) {
          this.error = err.error?.mensaje || 'Error interno del servidor al cargar las solicitudes de máxima autoridad.';
          return;
        }

        this.error = err.error?.mensaje || 'No se pudieron cargar las solicitudes asignadas.';
      }
    });
  }

  aplicarFiltroEstado(): void {
    if (!this.filtroEstado) {
      this.solicitudesFiltradas = [...this.solicitudes];
      return;
    }

    this.solicitudesFiltradas = this.solicitudes.filter((solicitud) =>
      solicitud.estado === this.filtroEstado
    );
  }

  calcularEstadisticas(): void {
    this.totalSolicitudes = this.solicitudes.length;

    this.totalPendientes = this.solicitudes.filter((solicitud) =>
      solicitud.estado === 'pendiente_maxima_autoridad'
    ).length;

    this.totalFinalizadas = this.solicitudes.filter((solicitud) =>
      solicitud.estado === 'finalizada'
    ).length;

    this.totalRechazadas = this.solicitudes.filter((solicitud) =>
      solicitud.estado === 'rechazada_maxima_autoridad'
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

  obtenerFechaTabla(fecha: string | null | undefined): string {
    if (!fecha) {
      return 'Sin fecha';
    }

    const valor = String(fecha).trim();

    if (!valor) {
      return 'Sin fecha';
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
      const [anio, mes, dia] = valor.split('-');
      return `${dia}/${mes}/${anio}`;
    }

    const valorCompatible = valor.includes('T')
      ? valor
      : valor.replace(' ', 'T');

    const fechaObj = new Date(valorCompatible);

    if (Number.isNaN(fechaObj.getTime())) {
      return valor;
    }

    return fechaObj.toLocaleDateString('es-EC', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }

  obtenerHoraTabla(fecha: string | null | undefined): string {
    if (!fecha) {
      return 'Sin hora registrada';
    }

    const valor = String(fecha).trim();

    if (!valor) {
      return 'Sin hora registrada';
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
      return 'Sin hora registrada';
    }

    if (
      valor.endsWith('00:00:00') ||
      valor.includes('T00:00:00') ||
      valor.includes(' 00:00:00')
    ) {
      return 'Sin hora registrada';
    }

    const valorCompatible = valor.includes('T')
      ? valor
      : valor.replace(' ', 'T');

    const fechaObj = new Date(valorCompatible);

    if (Number.isNaN(fechaObj.getTime())) {
      return 'Sin hora registrada';
    }

    const hora = fechaObj.toLocaleTimeString('es-EC', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    if (hora === '00:00:00') {
      return 'Sin hora registrada';
    }

    return hora;
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
}