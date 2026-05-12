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
  selector: 'app-tics-historial',
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

  cargando = false;
  error = '';

  busqueda = '';
  filtroEstado = '';

  totalHistorial = 0;
  totalEjecucion = 0;
  totalFinalizadas = 0;
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

        this.error = err.error?.mensaje || 'No se pudo cargar el historial de TICS.';
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

      return coincideEstado && coincideBusqueda;
    });

    this.calcularResumen();
  }

  calcularResumen(): void {
    this.totalHistorial = this.solicitudesFiltradas.length;

    this.totalEjecucion = this.solicitudesFiltradas.filter(
      solicitud => solicitud.estado === 'pendiente_ejecucion_tics'
    ).length;

    this.totalFinalizadas = this.solicitudesFiltradas.filter(
      solicitud => solicitud.estado === 'finalizada'
    ).length;

    this.totalRechazadas = this.solicitudesFiltradas.filter(
      solicitud => solicitud.estado === 'rechazada_tics'
    ).length;
  }

  limpiarFiltros(): void {
    this.busqueda = '';
    this.filtroEstado = '';
    this.aplicarFiltros();
  }

  verDetalle(id: number): void {
    this.router.navigate(['/admin/solicitudes', id]);
  }

  getEstadoTexto(estado: string): string {
    const estados: Record<string, string> = {
      pendiente_ejecucion_tics: 'Pendiente ejecución TICS',
      finalizada: 'Finalizada',
      rechazada_tics: 'Rechazada por TICS'
    };

    return estados[estado] || estado;
  }

  getEstadoClase(estado: string): string {
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