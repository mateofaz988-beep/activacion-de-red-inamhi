import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import Swal from 'sweetalert2';

import { AuthService } from '../../services/auth.service';
import {
  SolicitudAdmin,
  SolicitudesAdminService
} from '../../services/solicitudes-admin.service';

@Component({
  selector: 'app-tics-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    RouterLinkActive
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class TicsDashboard implements OnInit {

  /*
    solicitudes:
    Solo se usan para la tabla principal del dashboard.
    Aquí deben aparecer únicamente las solicitudes que TICS debe atender.
  */
  solicitudes: SolicitudAdmin[] = [];

  /*
    solicitudesTics:
    Se usa internamente para calcular estadísticas generales de TICS:
    pendientes, en ejecución, finalizadas y rechazadas.
  */
  private solicitudesTics: SolicitudAdmin[] = [];

  cargando = false;
  error = '';

  totalPendientes = 0;
  totalEjecucion = 0;
  totalFinalizadas = 0;
  totalRechazadas = 0;

  constructor(
    private router: Router,
    private authService: AuthService,
    private solicitudesService: SolicitudesAdminService
  ) {}

  ngOnInit(): void {
    this.cargarSolicitudesTics();
  }

  cargarSolicitudesTics(): void {
    this.cargando = true;
    this.error = '';

    /*
      Flujo TICS:
      - pendiente_tics:
        TICS debe revisar y validar técnicamente.

      - pendiente_ejecucion_tics:
        TICS ya validó y debe ejecutar/finalizar el proceso.

      - finalizada:
        Solicitud cerrada correctamente por TICS.

      - rechazada_tics:
        Solicitud rechazada por TICS.
    */

    this.solicitudesService.listarSolicitudes().subscribe({
      next: (response) => {
        this.cargando = false;

        const solicitudes = response.solicitudes || [];

        /*
          Todas las solicitudes relacionadas con TICS.
          Sirven para estadísticas.
        */
        this.solicitudesTics = solicitudes.filter((solicitud) =>
          [
            'pendiente_tics',
            'pendiente_ejecucion_tics',
            'finalizada',
            'rechazada_tics'
          ].includes(solicitud.estado)
        );

        /*
          Solo las solicitudes activas que TICS debe trabajar.
          Estas son las que se muestran en la tabla del dashboard.
        */
        this.solicitudes = this.solicitudesTics.filter((solicitud) =>
          [
            'pendiente_tics',
            'pendiente_ejecucion_tics'
          ].includes(solicitud.estado)
        );

        this.calcularResumen();
      },
      error: (err) => {
        this.cargando = false;

        if (err.status === 401 || err.status === 403) {
          this.authService.logout();
          this.router.navigate(['/auth/login']);
          return;
        }

        this.error = err.error?.mensaje || 'No se pudieron cargar las solicitudes de TICS.';
      }
    });
  }

  calcularResumen(): void {
    this.totalPendientes = this.solicitudesTics.filter(
      solicitud => solicitud.estado === 'pendiente_tics'
    ).length;

    this.totalEjecucion = this.solicitudesTics.filter(
      solicitud => solicitud.estado === 'pendiente_ejecucion_tics'
    ).length;

    this.totalFinalizadas = this.solicitudesTics.filter(
      solicitud => solicitud.estado === 'finalizada'
    ).length;

    this.totalRechazadas = this.solicitudesTics.filter(
      solicitud => solicitud.estado === 'rechazada_tics'
    ).length;
  }

  verDetalle(id: number): void {
    /*
      Por ahora reutilizamos el detalle general de solicitudes.
      La seguridad real la controla el backend con token y rol.
    */
    this.router.navigate(['/admin/solicitudes', id]);
  }

  descargarPdf(solicitud: SolicitudAdmin): void {
    this.solicitudesService.descargarPdfSolicitud(solicitud.id).subscribe({
      next: (blob) => {
        const archivo = new Blob([blob], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(archivo);
        const enlace = document.createElement('a');

        enlace.href = url;
        enlace.download = `${solicitud.codigo_solicitud || 'solicitud-tics'}.pdf`;
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
          confirmButtonColor: '#dc2626',
          background: '#ffffff',
          color: '#0f172a'
        });
      }
    });
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