import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import Swal from 'sweetalert2';

import { AuthService } from '../../services/auth.service';
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

  solicitudes: SolicitudAdmin[] = [];
  solicitudesFiltradas: SolicitudAdmin[] = [];

  cargando = false;
  error = '';

  filtroEstado = '';
  textoBusqueda = '';

  totalSolicitudes = 0;
  totalPendienteFirma = 0;
  totalJefe = 0;
  totalAutoridad = 0;
  totalTics = 0;
  totalFinalizadas = 0;
  totalRechazadas = 0;

  estados = [
    {
      valor: '',
      texto: 'Todos los estados'
    },
    {
      valor: 'pendiente_firma_solicitante',
      texto: 'Pendiente firma solicitante'
    },
    {
      valor: 'pendiente_jefe_inmediato',
      texto: 'Pendiente jefe inmediato'
    },
    {
      valor: 'pendiente_maxima_autoridad',
      texto: 'Pendiente máxima autoridad'
    },
    {
      valor: 'pendiente_tics',
      texto: 'Pendiente TICS'
    },
    {
      valor: 'pendiente_ejecucion_tics',
      texto: 'Pendiente ejecución TICS'
    },
    {
      valor: 'finalizada',
      texto: 'Finalizada'
    },
    {
      valor: 'rechazada_jefe_inmediato',
      texto: 'Rechazada jefe inmediato'
    },
    {
      valor: 'rechazada_maxima_autoridad',
      texto: 'Rechazada máxima autoridad'
    },
    {
      valor: 'rechazada_tics',
      texto: 'Rechazada TICS'
    },
    {
      valor: 'anulada',
      texto: 'Anulada'
    }
  ];

  constructor(
    private router: Router,
    private authService: AuthService,
    private solicitudesService: SolicitudesAdminService
  ) {}

  ngOnInit(): void {
    this.cargarSolicitudes();
  }

  cargarSolicitudes(): void {
    this.cargando = true;
    this.error = '';

    this.solicitudesService.listarSolicitudes().subscribe({
      next: (response) => {
        this.cargando = false;
        this.solicitudes = response.solicitudes || [];
        this.totalSolicitudes = response.total || this.solicitudes.length;

        this.calcularResumen();
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

  aplicarFiltros(): void {
    const busqueda = this.textoBusqueda.trim().toLowerCase();

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
        ${solicitud.cargo}
        ${solicitud.estado}
        ${solicitud.etapa_actual}
      `.toLowerCase();

      const coincideBusqueda = busqueda
        ? textoCompleto.includes(busqueda)
        : true;

      return coincideEstado && coincideBusqueda;
    });
  }

  limpiarFiltros(): void {
    this.filtroEstado = '';
    this.textoBusqueda = '';
    this.aplicarFiltros();
  }

  calcularResumen(): void {
    this.totalPendienteFirma = this.solicitudes.filter(
      solicitud => solicitud.estado === 'pendiente_firma_solicitante'
    ).length;

    this.totalJefe = this.solicitudes.filter(
      solicitud => solicitud.estado === 'pendiente_jefe_inmediato'
    ).length;

    this.totalAutoridad = this.solicitudes.filter(
      solicitud => solicitud.estado === 'pendiente_maxima_autoridad'
    ).length;

    this.totalTics = this.solicitudes.filter(
      solicitud =>
        solicitud.estado === 'pendiente_tics' ||
        solicitud.estado === 'pendiente_ejecucion_tics'
    ).length;

    this.totalFinalizadas = this.solicitudes.filter(
      solicitud => solicitud.estado === 'finalizada'
    ).length;

    this.totalRechazadas = this.solicitudes.filter(
      solicitud => solicitud.estado.includes('rechazada')
    ).length;
  }

  verDetalle(id: number): void {
    this.router.navigate(['/admin/solicitudes', id]);
  }

  descargarPdf(solicitud: SolicitudAdmin): void {
    this.solicitudesService.descargarPdfSolicitud(solicitud.id).subscribe({
      next: (blob) => {
        const archivo = new Blob([blob], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(archivo);
        const enlace = document.createElement('a');

        enlace.href = url;
        enlace.download = `${solicitud.codigo_solicitud || 'solicitud-inamhi'}.pdf`;
        enlace.click();

        window.URL.revokeObjectURL(url);
      },
      error: (err) => {
        if (err.status === 401 || err.status === 403) {
          this.authService.logout();
          this.router.navigate(['/auth/login']);
          return;
        }

        Swal.fire({
          title: 'No se pudo descargar',
          text: 'No se pudo generar o descargar el PDF de la solicitud.',
          icon: 'error',
          confirmButtonText: 'Entendido',
          confirmButtonColor: '#dc2626'
        });
      }
    });
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

    if (estado === 'pendiente_firma_solicitante') {
      return 'firma';
    }

    if (estado === 'pendiente_jefe_inmediato') {
      return 'jefe';
    }

    if (estado === 'pendiente_maxima_autoridad') {
      return 'autoridad';
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