import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import Swal from 'sweetalert2';

import { AuthService } from '../../services/auth.service';
import {
  PaginaWebAdmin,
  SolicitudAdmin,
  SolicitudesAdminService
} from '../../services/solicitudes-admin.service';

@Component({
  selector: 'app-solicitud-detalle',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    RouterLinkActive
  ],
  templateUrl: './solicitud-detalle.html',
  styleUrl: './solicitud-detalle.scss'
})
export class SolicitudDetalle implements OnInit {

  solicitud: SolicitudAdmin | null = null;
  paginasWeb: PaginaWebAdmin[] = [];

  cargando = false;
  procesando = false;
  mostrarModalRechazo = false;

  error = '';
  mensajeOk = '';
  motivoRechazo = '';

  documentoFirmadoCargado = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private solicitudesService: SolicitudesAdminService
  ) {}

  ngOnInit(): void {
    this.cargarDetalle();
  }

  cargarDetalle(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));

    if (!id || Number.isNaN(id)) {
      this.mostrarError('ID inválido', 'ID de solicitud inválido.');
      return;
    }

    this.cargando = true;
    this.error = '';
    this.mensajeOk = '';

    this.solicitudesService.obtenerSolicitudPorId(id).subscribe({
      next: (response) => {
        this.cargando = false;
        this.solicitud = response.solicitud;
        this.paginasWeb = response.paginas_web || [];

        const documentos = response.documentos || [];

        const existeDocumentoFirmado = documentos.some((documento: any) => {
          return (
            documento.firmado === true ||
            documento.firmado === 1 ||
            documento.firma_validada === true ||
            documento.firma_validada === 1
          );
        });

        this.documentoFirmadoCargado =
          response.documento_firmado_cargado === true ||
          response.solicitud?.firma_actual_validada === true ||
          response.solicitud?.firma_actual_validada === 1 ||
          !!response.solicitud?.documento_actual_id ||
          existeDocumentoFirmado ||
          this.documentoFirmadoCargado;
      },
      error: (err) => {
        this.cargando = false;

        if (err.status === 401 || err.status === 403) {
          this.authService.logout();
          this.router.navigate(['/auth/login']);
          return;
        }

        this.mostrarError(
          'No se pudo cargar',
          err.error?.mensaje || 'No se pudo cargar el detalle de la solicitud.'
        );
      }
    });
  }

  /*
    Descarga el PDF generado por el sistema desde la plantilla A4.
    Este NO es necesariamente el documento firmado por el rol anterior.
  */
  descargarPdf(): void {
    if (!this.solicitud) {
      return;
    }

    this.procesando = true;
    this.error = '';
    this.mensajeOk = '';

    this.solicitudesService.descargarPdfSolicitud(this.solicitud.id).subscribe({
      next: (blob) => {
        this.procesando = false;

        const archivo = new Blob([blob], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(archivo);
        const enlace = document.createElement('a');

        enlace.href = url;
        enlace.download = `${this.solicitud?.codigo_solicitud || 'solicitud-inamhi'}.pdf`;
        enlace.click();

        window.URL.revokeObjectURL(url);

        Swal.fire({
          title: 'PDF generado',
          text: 'El documento PDF generado desde la plantilla se descargó correctamente.',
          icon: 'success',
          confirmButtonText: 'Entendido',
          confirmButtonColor: '#1d4ed8',
          background: '#ffffff',
          color: '#0f172a'
        });
      },
      error: (err) => {
        this.procesando = false;

        if (err.status === 401 || err.status === 403) {
          this.authService.logout();
          this.router.navigate(['/auth/login']);
          return;
        }

        this.mostrarError(
          'No se pudo descargar',
          'No se pudo generar o descargar el PDF de la solicitud.'
        );
      }
    });
  }

  /*
    Descarga el último PDF firmado cargado en el flujo.
    Este es el documento correcto que debe revisar el siguiente rol.

    Flujo esperado:
    - Admin sube PDF firmado -> Jefe descarga este documento.
    - Jefe sube PDF firmado -> Autoridad descarga este documento.
    - Autoridad sube PDF firmado -> TICS descarga este documento.
    - TICS sube PDF final -> queda como respaldo final.
  */
  descargarDocumentoFirmadoActual(): void {
    if (!this.solicitud) {
      return;
    }

    this.procesando = true;
    this.error = '';
    this.mensajeOk = '';

    this.solicitudesService.descargarDocumentoActualSolicitud(this.solicitud.id).subscribe({
      next: (blob) => {
        this.procesando = false;

        const archivo = new Blob([blob], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(archivo);
        const enlace = document.createElement('a');

        enlace.href = url;
        enlace.download = `${this.solicitud?.codigo_solicitud || 'solicitud-inamhi'}-firmado.pdf`;
        enlace.click();

        window.URL.revokeObjectURL(url);

        Swal.fire({
          title: 'PDF firmado descargado',
          text: 'Se descargó el último documento firmado cargado en el flujo.',
          icon: 'success',
          confirmButtonText: 'Entendido',
          confirmButtonColor: '#15803d',
          background: '#ffffff',
          color: '#0f172a'
        });
      },
      error: (err) => {
        this.procesando = false;

        if (err.status === 401 || err.status === 403) {
          this.authService.logout();
          this.router.navigate(['/auth/login']);
          return;
        }

        this.mostrarError(
          'Documento firmado no disponible',
          err.error?.mensaje || 'Todavía no existe un PDF firmado cargado para esta solicitud.'
        );
      }
    });
  }

  seleccionarFirmaManual(event: Event): void {
    const input = event.target as HTMLInputElement;

    if (!input.files || input.files.length === 0) {
      return;
    }

    const archivo = input.files[0];

    if (!this.validarArchivoPdf(archivo)) {
      input.value = '';
      return;
    }

    this.subirDocumentoFirmado(
      archivo,
      'pdf_firmado_manual',
      'PDF firmado manualmente, escaneado y cargado al sistema.'
    );

    input.value = '';
  }

  seleccionarFirmaElectronica(event: Event): void {
    const input = event.target as HTMLInputElement;

    if (!input.files || input.files.length === 0) {
      return;
    }

    const archivo = input.files[0];

    if (!this.validarArchivoPdf(archivo)) {
      input.value = '';
      return;
    }

    this.subirDocumentoFirmado(
      archivo,
      'pdf_firmado_electronico',
      'PDF firmado electrónicamente y cargado al sistema.'
    );

    input.value = '';
  }

  validarArchivoPdf(archivo: File): boolean {
    const maxSizeMb = 10;
    const maxSizeBytes = maxSizeMb * 1024 * 1024;

    const nombreArchivo = archivo.name || '';

    if (!nombreArchivo.toLowerCase().endsWith('.pdf')) {
      this.mostrarError('Archivo inválido', 'Solo se permiten archivos con extensión .pdf.');
      return false;
    }

    if (archivo.size > maxSizeBytes) {
      this.mostrarError('Archivo demasiado grande', `El archivo no puede superar ${maxSizeMb} MB.`);
      return false;
    }

    return true;
  }

  subirDocumentoFirmado(
    archivo: File,
    tipoDocumento: string,
    observacion: string
  ): void {
    if (!this.solicitud?.id) {
      this.mostrarError('Solicitud no encontrada', 'No se encontró la solicitud.');
      return;
    }

    this.procesando = true;
    this.error = '';
    this.mensajeOk = '';

    this.solicitudesService.subirDocumentoFirmado(
      this.solicitud.id,
      archivo,
      tipoDocumento,
      observacion
    ).subscribe({
      next: (response) => {
        this.procesando = false;
        this.documentoFirmadoCargado = true;

        Swal.fire({
          title: 'Documento cargado',
          text: response?.mensaje || 'El PDF firmado fue subido correctamente.',
          icon: 'success',
          confirmButtonText: 'Entendido',
          confirmButtonColor: '#1d4ed8',
          background: '#ffffff',
          color: '#0f172a'
        }).then(() => {
          this.cargarDetalle();
        });
      },
      error: (err) => {
        this.procesando = false;

        if (err.status === 401 || err.status === 403) {
          this.authService.logout();
          this.router.navigate(['/auth/login']);
          return;
        }

        this.mostrarError(
          'No se pudo subir el documento',
          err.error?.mensaje || 'Error al subir el PDF firmado.'
        );
      }
    });
  }

  async confirmarAprobacion(): Promise<void> {
    if (!this.solicitud) {
      return;
    }

    if (!this.documentoFirmadoCargado) {
      Swal.fire({
        title: 'Documento firmado requerido',
        text: 'Antes de aprobar debe subir un PDF firmado manualmente o electrónicamente.',
        icon: 'warning',
        confirmButtonText: 'Entendido',
        confirmButtonColor: '#d97706',
        background: '#ffffff',
        color: '#0f172a'
      });

      return;
    }

    const resultado = await Swal.fire({
      title: 'Confirmar aprobación',
      html: `
        <div style="text-align:center">
          <p style="margin: 0 0 10px; color:#475569;">
            ¿Está seguro de aprobar esta solicitud?
          </p>
          <strong style="display:inline-block; color:#1d4ed8; font-size:17px; margin-bottom:10px;">
            ${this.solicitud.codigo_solicitud}
          </strong>
          <div style="
            margin-top:14px;
            padding:12px;
            border-radius:14px;
            background:#f8fafc;
            border:1px solid #e2e8f0;
            color:#334155;
            font-size:14px;
          ">
            Estado actual: <b>${this.getEstadoTexto(this.solicitud.estado)}</b>
          </div>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, aprobar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#15803d',
      cancelButtonColor: '#64748b',
      reverseButtons: true,
      background: '#ffffff',
      color: '#0f172a',
      customClass: {
        popup: 'swal-profesional'
      }
    });

    if (resultado.isConfirmed) {
      this.aprobar();
    }
  }

  aprobar(): void {
    if (!this.solicitud) {
      return;
    }

    this.procesando = true;
    this.error = '';
    this.mensajeOk = '';

    this.solicitudesService.aprobarSolicitud(this.solicitud.id).subscribe({
      next: (response) => {
        this.procesando = false;

        Swal.fire({
          title: 'Solicitud aprobada',
          text: response.mensaje || 'La solicitud avanzó correctamente a la siguiente etapa.',
          icon: 'success',
          confirmButtonText: 'Entendido',
          confirmButtonColor: '#1d4ed8',
          background: '#ffffff',
          color: '#0f172a'
        });

        this.documentoFirmadoCargado = false;
        this.cargarDetalle();
      },
      error: (err) => {
        this.procesando = false;

        if (err.status === 401 || err.status === 403) {
          this.authService.logout();
          this.router.navigate(['/auth/login']);
          return;
        }

        this.mostrarError(
          'No se pudo aprobar',
          err.error?.mensaje || 'No se pudo aprobar la solicitud.'
        );
      }
    });
  }

  abrirModalRechazo(): void {
    this.error = '';
    this.mensajeOk = '';
    this.motivoRechazo = '';
    this.mostrarModalRechazo = true;
  }

  cerrarModalRechazo(): void {
    this.mostrarModalRechazo = false;
    this.motivoRechazo = '';
  }

  rechazar(): void {
    if (!this.solicitud) {
      return;
    }

    const motivo = this.motivoRechazo.trim().replace(/\s+/g, ' ');

    if (!motivo) {
      this.mostrarError('Motivo requerido', 'Debe ingresar el motivo del rechazo.');
      return;
    }

    if (motivo.length < 10) {
      this.mostrarError('Motivo muy corto', 'El motivo del rechazo debe tener mínimo 10 caracteres.');
      return;
    }

    if (motivo.length > 1000) {
      this.mostrarError('Motivo demasiado largo', 'El motivo del rechazo no puede superar 1000 caracteres.');
      return;
    }

    this.procesando = true;
    this.error = '';
    this.mensajeOk = '';

    this.solicitudesService.rechazarSolicitud(this.solicitud.id, motivo).subscribe({
      next: (response) => {
        this.procesando = false;
        this.mostrarModalRechazo = false;
        this.motivoRechazo = '';

        const correoEnviado = response?.correo_enviado === true;

        Swal.fire({
          title: 'Solicitud rechazada',
          text: correoEnviado
            ? 'La solicitud fue rechazada correctamente y se notificó al correo del solicitante.'
            : response.mensaje || 'La solicitud fue rechazada correctamente.',
          icon: 'success',
          confirmButtonText: 'Entendido',
          confirmButtonColor: '#1d4ed8',
          background: '#ffffff',
          color: '#0f172a'
        });

        this.documentoFirmadoCargado = false;
        this.cargarDetalle();
      },
      error: (err) => {
        this.procesando = false;

        if (err.status === 401 || err.status === 403) {
          this.authService.logout();
          this.router.navigate(['/auth/login']);
          return;
        }

        this.mostrarError(
          'No se pudo rechazar',
          err.error?.mensaje || 'No se pudo rechazar la solicitud.'
        );
      }
    });
  }

  mostrarError(titulo: string, mensaje: string): void {
    Swal.fire({
      title: titulo,
      text: mensaje,
      icon: 'error',
      confirmButtonText: 'Entendido',
      confirmButtonColor: '#dc2626',
      background: '#ffffff',
      color: '#0f172a'
    });
  }

  puedeAprobar(): boolean {
    if (!this.solicitud) {
      return false;
    }

    const estadosPermitidos = [
      'pendiente_firma_solicitante',
      'pendiente_jefe_inmediato',
      'pendiente_maxima_autoridad',
      'pendiente_tics',
      'pendiente_ejecucion_tics'
    ];

    return estadosPermitidos.includes(this.solicitud.estado);
  }

  puedeRechazar(): boolean {
    if (!this.solicitud) {
      return false;
    }

    const estadosPermitidos = [
      'pendiente_jefe_inmediato',
      'pendiente_maxima_autoridad',
      'pendiente_tics'
    ];

    return estadosPermitidos.includes(this.solicitud.estado);
  }

  getTextoBotonAprobar(): string {
    if (!this.solicitud) {
      return 'Aprobar';
    }

    const textos: Record<string, string> = {
      pendiente_firma_solicitante: 'Validar firma y enviar a jefe',
      pendiente_jefe_inmediato: 'Aprobar como jefe inmediato',
      pendiente_maxima_autoridad: 'Aprobar como máxima autoridad',
      pendiente_tics: 'Aprobar validación TICS',
      pendiente_ejecucion_tics: 'Finalizar ejecución TICS'
    };

    return textos[this.solicitud.estado] || 'Aprobar solicitud';
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/auth/login']);
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

    if (estado.includes('pendiente')) {
      return 'pendiente';
    }

    return 'normal';
  }
}