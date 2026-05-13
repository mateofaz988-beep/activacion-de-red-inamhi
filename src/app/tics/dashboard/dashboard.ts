import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import Swal from 'sweetalert2';

import { AuthService, UsuarioLogin } from '../../services/auth.service';
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

  usuario: UsuarioLogin | null = null;

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
    this.usuario = this.authService.getUsuario();
    this.cargarSolicitudesTics();
  }

  cargarSolicitudesTics(): void {
    this.cargando = true;
    this.error = '';

    this.solicitudesService.listarSolicitudes().subscribe({
      next: (response) => {
        this.cargando = false;

        const solicitudes = response.solicitudes || [];

        /*
          TICS solo debe ver solicitudes que están en etapa técnica:
          - pendiente_tics
          - pendiente_ejecucion_tics
        */
        this.solicitudes = solicitudes.filter((solicitud) =>
          [
            'pendiente_tics',
            'pendiente_ejecucion_tics'
          ].includes(solicitud.estado)
        );

        this.calcularResumen(solicitudes);
      },
      error: (err: any) => {
        this.cargando = false;

        if (err.status === 401 || err.status === 403) {
          this.authService.logout();
          this.router.navigate(['/auth/login']);
          return;
        }

        this.error = err.error?.mensaje || 'No se pudieron cargar las solicitudes asignadas a TICS.';
      }
    });
  }

  calcularResumen(solicitudes: SolicitudAdmin[]): void {
    this.totalPendientes = solicitudes.filter(
      solicitud => solicitud.estado === 'pendiente_tics'
    ).length;

    this.totalEjecucion = solicitudes.filter(
      solicitud => solicitud.estado === 'pendiente_ejecucion_tics'
    ).length;

    this.totalFinalizadas = solicitudes.filter(
      solicitud => solicitud.estado === 'finalizada'
    ).length;

    this.totalRechazadas = solicitudes.filter(
      solicitud => solicitud.estado === 'rechazada_tics'
    ).length;
  }

  verDetalle(id: number): void {
    /*
      TICS NO debe ir a /admin/solicitudes/:id.
      Debe usar su propia ruta protegida.
    */
    this.router.navigate(['/tics/solicitudes', id]);
  }

  descargarPdf(solicitud: SolicitudAdmin): void {
    if (!solicitud?.id) {
      return;
    }

    this.solicitudesService.descargarPdfSolicitud(solicitud.id).subscribe({
      next: (blob: Blob) => {
        const archivo = new Blob([blob], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(archivo);
        const enlace = document.createElement('a');

        enlace.href = url;
        enlace.download = `${solicitud.codigo_solicitud || 'solicitud-inamhi'}.pdf`;
        enlace.click();

        window.URL.revokeObjectURL(url);

        Swal.fire({
          title: 'PDF descargado',
          text: 'El documento PDF se descargó correctamente.',
          icon: 'success',
          confirmButtonText: 'Entendido',
          confirmButtonColor: '#0284c7',
          background: '#ffffff',
          color: '#0f172a'
        });
      },
      error: (err: any) => {
        if (err.status === 401 || err.status === 403) {
          this.authService.logout();
          this.router.navigate(['/auth/login']);
          return;
        }

        Swal.fire({
          title: 'No se pudo descargar',
          text: err.error?.mensaje || 'No se pudo generar o descargar el PDF de la solicitud.',
          icon: 'error',
          confirmButtonText: 'Entendido',
          confirmButtonColor: '#dc2626',
          background: '#ffffff',
          color: '#0f172a'
        });
      }
    });
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