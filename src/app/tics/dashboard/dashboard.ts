import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import Swal from 'sweetalert2';

import { AuthService } from '../../services/auth.service';
import {
  SolicitudAdmin,
  SolicitudesAdminService
} from '../../services/solicitudes-admin.service';

@Component({
  selector: 'app-tics-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class TicsDashboard implements OnInit {

  solicitudes: SolicitudAdmin[] = [];

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
      Para TICS conviene traer todas las solicitudes y luego filtrar.
      Si luego quieres optimizar, podemos crear un endpoint exclusivo:
      GET /api/tics/solicitudes
    */
    this.solicitudesService.listarSolicitudes().subscribe({
      next: (response) => {
        this.cargando = false;

        const solicitudes = response.solicitudes || [];

        this.solicitudes = solicitudes.filter((solicitud) => {
          return [
            'pendiente_tics',
            'pendiente_ejecucion_tics',
            'finalizada',
            'rechazada_tics'
          ].includes(solicitud.estado);
        });

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
    this.totalPendientes = this.solicitudes.filter(
      solicitud => solicitud.estado === 'pendiente_tics'
    ).length;

    this.totalEjecucion = this.solicitudes.filter(
      solicitud => solicitud.estado === 'pendiente_ejecucion_tics'
    ).length;

    this.totalFinalizadas = this.solicitudes.filter(
      solicitud => solicitud.estado === 'finalizada'
    ).length;

    this.totalRechazadas = this.solicitudes.filter(
      solicitud => solicitud.estado === 'rechazada_tics'
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
        enlace.download = `${solicitud.codigo_solicitud || 'solicitud-tics'}.pdf`;
        enlace.click();

        window.URL.revokeObjectURL(url);
      },
      error: () => {
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