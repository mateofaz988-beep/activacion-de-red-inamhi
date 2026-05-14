import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import Swal from 'sweetalert2';

import { AuthService } from '../../services/auth.service';
import {
  DocumentoSolicitud,
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
  documentos: DocumentoSolicitud[] = [];

  cargando = false;
  procesando = false;
  procesandoAprobacion = false;
  procesandoFinalizacion = false;
  procesandoRechazo = false;
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

  // =====================================================
  // CONTROL LOCAL DE DOCUMENTO FIRMADO
  // =====================================================

  private getClaveDocumentoLocal(estadoOpcional?: string): string {
    const solicitudId = this.solicitud?.id || Number(this.route.snapshot.paramMap.get('id'));
    const estado = estadoOpcional || this.solicitud?.estado || 'sin_estado';

    return `documento_firmado_${solicitudId}_${estado}`;
  }

  private guardarDocumentoFirmadoLocal(estadoOpcional?: string): void {
    localStorage.setItem(this.getClaveDocumentoLocal(estadoOpcional), 'true');
  }

  private existeDocumentoFirmadoLocal(estadoOpcional?: string): boolean {
    return localStorage.getItem(this.getClaveDocumentoLocal(estadoOpcional)) === 'true';
  }

  private limpiarDocumentoFirmadoLocal(estadoOpcional?: string): void {
    localStorage.removeItem(this.getClaveDocumentoLocal(estadoOpcional));
  }

  // =====================================================
  // CARGA DE DETALLE
  // =====================================================

  cargarDetalle(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));

    if (!id || Number.isNaN(id)) {
      this.mostrarError('ID inválido', 'ID de solicitud inválido.');
      return;
    }

    const documentoFirmadoLocalActual = this.documentoFirmadoCargado;

    this.cargando = true;
    this.error = '';
    this.mensajeOk = '';

    this.solicitudesService.obtenerSolicitudPorId(id).subscribe({
      next: (response) => {
        this.cargando = false;

        this.solicitud = response.solicitud;
        this.paginasWeb = response.paginas_web || [];
        this.documentos = response.documentos || [];

        const existeDocumentoFirmado = this.documentos.some((documento) => {
          return (
            documento.firmado === true ||
            documento.firmado === 1 ||
            documento.firma_validada === true ||
            documento.firma_validada === 1 ||
            documento.tipo_documento === 'pdf_firmado_manual' ||
            documento.tipo_documento === 'pdf_firmado_electronico' ||
            documento.tipo_documento === 'pdf_tics' ||
            documento.tipo_documento === 'pdf_final'
          );
        });

        const existeDocumentoLocal = this.existeDocumentoFirmadoLocal();

        this.documentoFirmadoCargado =
          response.documento_firmado_cargado === true ||
          this.solicitud?.firma_actual_validada === true ||
          this.solicitud?.firma_actual_validada === 1 ||
          !!this.solicitud?.documento_actual_id ||
          existeDocumentoFirmado ||
          documentoFirmadoLocalActual ||
          existeDocumentoLocal;
      },
      error: (err: any) => {
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

  // =====================================================
  // MENÚ DINÁMICO POR ROL
  // =====================================================

  esAdmin(): boolean {
    return this.authService.isAdmin();
  }

  esJefe(): boolean {
    return this.authService.isJefeInmediato();
  }

  esAutoridad(): boolean {
    return this.authService.isMaximaAutoridad();
  }

  esTics(): boolean {
    return this.authService.isTics();
  }

  getTituloRol(): string {
    if (this.esAdmin()) {
      return 'Liberación Web';
    }

    if (this.esJefe()) {
      return 'Jefe inmediato';
    }

    if (this.esAutoridad()) {
      return 'Máxima autoridad';
    }

    if (this.esTics()) {
      return 'Panel técnico';
    }

    return 'Sistema institucional';
  }

  getIconoRol(): string {
    if (this.esAdmin()) {
      return 'bi bi-diagram-3-fill';
    }

    if (this.esJefe()) {
      return 'bi bi-person-check-fill';
    }

    if (this.esAutoridad()) {
      return 'bi bi-shield-check';
    }

    if (this.esTics()) {
      return 'bi bi-cpu-fill';
    }

    return 'bi bi-building-fill';
  }

  getRutaVolver(): string {
    if (this.esAdmin()) {
      return '/admin/solicitudes';
    }

    if (this.esJefe()) {
      return '/jefe/dashboard';
    }

    if (this.esAutoridad()) {
      return '/autoridad/dashboard';
    }

    if (this.esTics()) {
      return '/tics/dashboard';
    }

    return '/';
  }

  estaFinalizada(): boolean {
    return this.solicitud?.estado === 'finalizada';
  }

  // =====================================================
  // DESCARGA DE PDF GENERADO
  // =====================================================

  descargarPdf(): void {
    if (!this.solicitud) {
      return;
    }

    this.procesando = true;
    this.error = '';
    this.mensajeOk = '';

    this.solicitudesService.descargarPdfSolicitud(this.solicitud.id).subscribe({
      next: (blob: Blob) => {
        this.procesando = false;

        const nombreArchivo = `${this.solicitud?.codigo_solicitud || 'solicitud-inamhi'}.pdf`;
        this.solicitudesService.descargarBlob(blob, nombreArchivo);

        Swal.fire({
          title: 'PDF descargado',
          text: 'El PDF generado por el sistema se descargó correctamente.',
          icon: 'success',
          confirmButtonText: 'Entendido',
          confirmButtonColor: '#1d4ed8',
          background: '#ffffff',
          color: '#0f172a'
        });
      },
      error: (err: any) => {
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

  // =====================================================
  // DESCARGA DEL ÚLTIMO DOCUMENTO FIRMADO
  // =====================================================

  descargarDocumentoFirmadoActual(): void {
    if (!this.solicitud) {
      return;
    }

    this.procesando = true;
    this.error = '';
    this.mensajeOk = '';

    this.solicitudesService.descargarDocumentoFirmadoActual(this.solicitud.id).subscribe({
      next: (blob: Blob) => {
        this.procesando = false;

        const nombreArchivo = `${this.solicitud?.codigo_solicitud || 'solicitud'}_documento_firmado_actual.pdf`;
        this.solicitudesService.descargarBlob(blob, nombreArchivo);

        Swal.fire({
          title: 'Documento descargado',
          text: 'El PDF firmado actual se descargó correctamente.',
          icon: 'success',
          confirmButtonText: 'Entendido',
          confirmButtonColor: '#15803d',
          background: '#ffffff',
          color: '#0f172a'
        });
      },
      error: (err: any) => {
        this.procesando = false;

        if (err.status === 401 || err.status === 403) {
          this.authService.logout();
          this.router.navigate(['/auth/login']);
          return;
        }

        Swal.fire({
          title: 'Documento firmado no disponible',
          text: err.error?.mensaje || 'Todavía no existe un PDF firmado cargado para esta solicitud.',
          icon: 'warning',
          confirmButtonText: 'Entendido',
          confirmButtonColor: '#d97706',
          background: '#ffffff',
          color: '#0f172a'
        });
      }
    });
  }
    // =====================================================
  // SELECCIÓN Y VALIDACIÓN DE ARCHIVOS
  // =====================================================

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

    const imagenFirma = input.files[0];

    if (!this.validarImagenFirma(imagenFirma)) {
      input.value = '';
      return;
    }

    this.subirFirmaElectronica(imagenFirma);

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

  validarImagenFirma(archivo: File): boolean {
    const maxSizeMb = 5;
    const maxSizeBytes = maxSizeMb * 1024 * 1024;

    const nombreArchivo = archivo.name || '';
    const extension = nombreArchivo.toLowerCase();

    const extensionesValidas = [
      '.png',
      '.jpg',
      '.jpeg'
    ];

    const tiposMimeValidos = [
      'image/png',
      'image/jpeg'
    ];

    const extensionValida = extensionesValidas.some((ext) =>
      extension.endsWith(ext)
    );

    const mimeValido = tiposMimeValidos.includes(archivo.type);

    if (!extensionValida || !mimeValido) {
      this.mostrarError(
        'Imagen inválida',
        'La firma electrónica debe ser una imagen PNG, JPG o JPEG.'
      );

      return false;
    }

    if (archivo.size > maxSizeBytes) {
      this.mostrarError(
        'Imagen demasiado grande',
        `La imagen de firma no puede superar ${maxSizeMb} MB.`
      );

      return false;
    }

    return true;
  }

  // =====================================================
  // SUBIR PDF FIRMADO MANUALMENTE
  // =====================================================

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
        this.guardarDocumentoFirmadoLocal();

        Swal.fire({
          title: 'Documento cargado',
          text: response?.mensaje || 'El PDF firmado fue subido correctamente.',
          icon: 'success',
          confirmButtonText: 'Entendido',
          confirmButtonColor: '#1d4ed8',
          background: '#ffffff',
          color: '#0f172a'
        }).then(() => {
          this.documentoFirmadoCargado = true;
          this.guardarDocumentoFirmadoLocal();
          this.cargarDetalle();
        });
      },
      error: (err: any) => {
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

  // =====================================================
  // SUBIR FIRMA ELECTRÓNICA COMO IMAGEN
  // =====================================================

  subirFirmaElectronica(imagenFirma: File): void {
    if (!this.solicitud?.id) {
      this.mostrarError(
        'Solicitud no encontrada',
        'No se encontró la solicitud.'
      );
      return;
    }

    this.procesando = true;
    this.error = '';
    this.mensajeOk = '';

    this.solicitudesService.subirFirmaElectronica(
      this.solicitud.id,
      imagenFirma
    ).subscribe({
      next: (response) => {
        this.procesando = false;

        this.documentoFirmadoCargado = true;
        this.guardarDocumentoFirmadoLocal();

        Swal.fire({
          title: 'Firma electrónica colocada',
          text: response?.mensaje || 'La firma electrónica fue colocada correctamente en el PDF.',
          icon: 'success',
          confirmButtonText: 'Entendido',
          confirmButtonColor: '#1d4ed8',
          background: '#ffffff',
          color: '#0f172a'
        }).then(() => {
          this.documentoFirmadoCargado = true;
          this.guardarDocumentoFirmadoLocal();
          this.cargarDetalle();
        });
      },
      error: (err: any) => {
        this.procesando = false;

        if (err.status === 401 || err.status === 403) {
          this.authService.logout();
          this.router.navigate(['/auth/login']);
          return;
        }

        this.mostrarError(
          'No se pudo colocar la firma electrónica',
          err.error?.mensaje || 'Error al subir la imagen de firma electrónica.'
        );
      }
    });
  }

  // =====================================================
  // APROBACIÓN GENERAL ADMIN / JEFE / AUTORIDAD
  // =====================================================

  async confirmarAprobacion(): Promise<void> {
    if (!this.solicitud) {
      return;
    }

    if (!this.documentoFirmadoCargado) {
      Swal.fire({
        title: 'Documento firmado requerido',
        text: 'Antes de aprobar debe subir un PDF firmado manualmente o colocar una firma electrónica.',
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
            ¿Está seguro de continuar con esta acción?
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
            Acción: <b>${this.getTextoBotonAprobar()}</b><br>
            Estado actual: <b>${this.getEstadoTexto(this.solicitud.estado)}</b>
          </div>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, continuar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#15803d',
      cancelButtonColor: '#64748b',
      reverseButtons: true,
      background: '#ffffff',
      color: '#0f172a'
    });

    if (resultado.isConfirmed) {
      this.aprobar('general');
    }
  }

  // =====================================================
  // TICS: APROBAR VALIDACIÓN
  // =====================================================

  async confirmarAprobacionTics(): Promise<void> {
    if (!this.solicitud) {
      return;
    }

    if (!this.puedeAprobarValidacionTics()) {
      this.mostrarError(
        'Acción no disponible',
        'La solicitud no se encuentra en estado pendiente de validación TICS.'
      );
      return;
    }

    if (!this.documentoFirmadoCargado) {
      Swal.fire({
        title: 'Documento firmado requerido',
        text: 'Para aprobar la validación TICS debe subir un PDF firmado o colocar una firma electrónica.',
        icon: 'warning',
        confirmButtonText: 'Entendido',
        confirmButtonColor: '#d97706',
        background: '#ffffff',
        color: '#0f172a'
      });
      return;
    }

    const resultado = await Swal.fire({
      title: 'Aprobar validación TICS',
      html: `
        <div style="text-align:center">
          <p style="margin: 0 0 10px; color:#475569;">
            Esta acción aprobará la validación técnica y habilitará la etapa de finalización.
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
            Estado actual: <b>${this.getEstadoTexto(this.solicitud.estado)}</b><br>
            Siguiente estado: <b>Pendiente ejecución TICS</b>
          </div>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, aprobar validación',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#15803d',
      cancelButtonColor: '#64748b',
      reverseButtons: true,
      background: '#ffffff',
      color: '#0f172a'
    });

    if (resultado.isConfirmed) {
      this.aprobar('validacion_tics');
    }
  }
    // =====================================================
  // TICS: FINALIZAR PROCESO
  // =====================================================

  async confirmarFinalizacionTics(): Promise<void> {
    if (!this.solicitud) {
      return;
    }

    if (!this.puedeFinalizarTics()) {
      this.mostrarError(
        'Finalización no disponible',
        'Primero debe aprobarse la validación TICS para poder finalizar el proceso.'
      );
      return;
    }

    if (!this.documentoFirmadoCargado) {
      Swal.fire({
        title: 'Documento firmado requerido',
        text: 'Para finalizar el proceso TICS debe existir un PDF firmado cargado.',
        icon: 'warning',
        confirmButtonText: 'Entendido',
        confirmButtonColor: '#d97706',
        background: '#ffffff',
        color: '#0f172a'
      });
      return;
    }

    const resultado = await Swal.fire({
      title: 'Finalizar proceso TICS',
      html: `
        <div style="text-align:center">
          <p style="margin: 0 0 10px; color:#475569;">
            Esta acción marcará la solicitud como finalizada y notificará al solicitante.
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
            Estado actual: <b>${this.getEstadoTexto(this.solicitud.estado)}</b><br>
            Estado final: <b>Finalizada</b>
          </div>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, finalizar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#15803d',
      cancelButtonColor: '#64748b',
      reverseButtons: true,
      background: '#ffffff',
      color: '#0f172a'
    });

    if (resultado.isConfirmed) {
      this.aprobar('finalizacion_tics');
    }
  }

  // =====================================================
  // APROBAR / AVANZAR FLUJO
  // =====================================================

  aprobar(tipoAccion: 'general' | 'validacion_tics' | 'finalizacion_tics' = 'general'): void {
    if (!this.solicitud) {
      return;
    }

    const estadoAntes = this.solicitud.estado;

    this.procesando = true;
    this.procesandoAprobacion = tipoAccion !== 'finalizacion_tics';
    this.procesandoFinalizacion = tipoAccion === 'finalizacion_tics';
    this.error = '';
    this.mensajeOk = '';

    this.solicitudesService.aprobarSolicitud(this.solicitud.id).subscribe({
      next: (response) => {
        this.procesando = false;
        this.procesandoAprobacion = false;
        this.procesandoFinalizacion = false;

        const estadoNuevo = response?.solicitud?.estado_actual || '';
        const etapaNueva = response?.solicitud?.etapa_actual || '';

        if (estadoNuevo && this.solicitud) {
          this.solicitud.estado = estadoNuevo;
        }

        if (etapaNueva && this.solicitud) {
          this.solicitud.etapa_actual = etapaNueva;
        }

        if (
          this.esTics() &&
          estadoAntes === 'pendiente_tics' &&
          estadoNuevo === 'pendiente_ejecucion_tics'
        ) {
          this.documentoFirmadoCargado = true;
          this.guardarDocumentoFirmadoLocal('pendiente_ejecucion_tics');
        }

        if (estadoNuevo === 'finalizada') {
          this.documentoFirmadoCargado = false;
          this.limpiarDocumentoFirmadoLocal('pendiente_tics');
          this.limpiarDocumentoFirmadoLocal('pendiente_ejecucion_tics');
          this.limpiarDocumentoFirmadoLocal('finalizada');
        }

        let titulo = 'Solicitud aprobada';
        let texto = response?.mensaje || 'La solicitud avanzó correctamente a la siguiente etapa.';

        if (tipoAccion === 'validacion_tics') {
          titulo = 'Validación TICS aprobada';
          texto = 'La validación técnica fue aprobada. Ya puede finalizar el proceso TICS.';
        }

        if (tipoAccion === 'finalizacion_tics') {
          titulo = 'Proceso TICS finalizado';
          texto = response?.mensaje || 'La solicitud fue finalizada correctamente.';
        }

        Swal.fire({
          title: titulo,
          text: texto,
          icon: 'success',
          confirmButtonText: 'Entendido',
          confirmButtonColor: '#1d4ed8',
          background: '#ffffff',
          color: '#0f172a'
        }).then(() => {
          this.cargarDetalle();
        });
      },
      error: (err: any) => {
        this.procesando = false;
        this.procesandoAprobacion = false;
        this.procesandoFinalizacion = false;

        if (err.status === 401 || err.status === 403) {
          this.authService.logout();
          this.router.navigate(['/auth/login']);
          return;
        }

        this.mostrarError(
          'No se pudo procesar la acción',
          err.error?.mensaje || 'No se pudo aprobar o finalizar la solicitud.'
        );
      }
    });
  }

  // =====================================================
  // RECHAZO
  // =====================================================

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
    this.procesandoRechazo = true;
    this.error = '';
    this.mensajeOk = '';

    this.solicitudesService.rechazarSolicitud(this.solicitud.id, motivo).subscribe({
      next: (response) => {
        this.procesando = false;
        this.procesandoRechazo = false;
        this.mostrarModalRechazo = false;
        this.motivoRechazo = '';
        this.documentoFirmadoCargado = false;

        const correoEnviado = response?.correo_enviado === true;

        Swal.fire({
          title: 'Solicitud rechazada',
          text: correoEnviado
            ? 'La solicitud fue rechazada correctamente y se notificó al correo del solicitante.'
            : response?.mensaje || 'La solicitud fue rechazada correctamente.',
          icon: 'success',
          confirmButtonText: 'Entendido',
          confirmButtonColor: '#1d4ed8',
          background: '#ffffff',
          color: '#0f172a'
        }).then(() => {
          this.cargarDetalle();
        });
      },
      error: (err: any) => {
        this.procesando = false;
        this.procesandoRechazo = false;

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

  // =====================================================
  // PERMISOS DE ACCIONES
  // =====================================================

  puedeAprobar(): boolean {
    if (!this.solicitud) {
      return false;
    }

    const estado = this.solicitud.estado;

    if (this.esAdmin()) {
      return estado === 'pendiente_firma_solicitante';
    }

    if (this.esJefe()) {
      return estado === 'pendiente_jefe_inmediato';
    }

    if (this.esAutoridad()) {
      return estado === 'pendiente_maxima_autoridad';
    }

    if (this.esTics()) {
      return false;
    }

    return false;
  }

  puedeAprobarValidacionTics(): boolean {
    if (!this.solicitud || !this.esTics()) {
      return false;
    }

    return this.solicitud.estado === 'pendiente_tics';
  }

  puedeFinalizarTics(): boolean {
    if (!this.solicitud || !this.esTics()) {
      return false;
    }

    return this.solicitud.estado === 'pendiente_ejecucion_tics';
  }

  puedeRechazar(): boolean {
    if (!this.solicitud) {
      return false;
    }

    const estado = this.solicitud.estado;

    if (this.esJefe()) {
      return estado === 'pendiente_jefe_inmediato';
    }

    if (this.esAutoridad()) {
      return estado === 'pendiente_maxima_autoridad';
    }

    if (this.esTics()) {
      return estado === 'pendiente_tics';
    }

    return false;
  }

  getTextoBotonAprobar(): string {
    if (!this.solicitud) {
      return 'Aprobar';
    }

    const textos: Record<string, string> = {
      pendiente_firma_solicitante: 'Validar firma y enviar a jefe',
      pendiente_jefe_inmediato: 'Aprobar como jefe inmediato',
      pendiente_maxima_autoridad: 'Aprobar como máxima autoridad'
    };

    return textos[this.solicitud.estado] || 'Aprobar solicitud';
  }

  // =====================================================
  // TEXTOS DE ESTADOS Y ETAPAS
  // =====================================================

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

    return etapas[etapa] || etapa || 'No registrada';
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

  // =====================================================
  // MENSAJES Y SESIÓN
  // =====================================================

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

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }
}