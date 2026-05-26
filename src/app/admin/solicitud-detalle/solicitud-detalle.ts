import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import Swal from 'sweetalert2';

import { AuthService } from '../../services/auth.service';
import {
  DocumentoSolicitud,
  PaginaWebAdmin,
  RolFirmante,
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

  /*
    LOCAL:
    http://localhost:5050/api

    SERVIDOR CON NGINX:
    /api
  */
  readonly API_BASE = 'http://localhost:5050/api';

  solicitud: SolicitudAdmin | null = null;
  paginasWeb: PaginaWebAdmin[] = [];
  documentos: DocumentoSolicitud[] = [];

  cargando = false;
  procesando = false;
  procesandoRechazo = false;

  error = '';
  mensajeOk = '';
  motivoRechazo = '';

  documentoFirmadoCargado = false;

  // =====================================================
  // MODALES
  // =====================================================

  mostrarModalRechazo = false;
  mostrarModalFirmaElectronica = false;

  // =====================================================
  // PDF FIRMADO ELECTRÓNICAMENTE CON FIRMAEC
  // JEFE / AUTORIDAD / TICS
  // =====================================================

  archivoFirmadoElectronico: File | null = null;
  nombreArchivoFirmadoElectronico = '';
  urlVistaPreviaFirmadoElectronico = '';

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

        if (err.status === 401) {
          this.authService.logout();
          this.router.navigate(['/auth/login']);
          return;
        }

        if (err.status === 403) {
          this.mostrarError(
            'Acceso denegado',
            err.error?.mensaje || 'No tiene permisos para ver el detalle de esta solicitud.'
          );
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
      return 'Revisión administrativa';
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
      return 'bi bi-search';
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
      return '/admin/dashboard';
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

  // El jefe ha subido su propio documento firmado (rol_firmante = 'jefe_inmediato')
  get jefeHaSubidoDocumento(): boolean {
    return this.documentos.some(d => d.rol_firmante === 'jefe_inmediato');
  }

  // La autoridad ha subido su propio documento firmado
  get autoridadHaSubidoDocumento(): boolean {
    return this.documentos.some(d => d.rol_firmante === 'maxima_autoridad');
  }

  // TICS ha subido al menos un documento firmado
  get ticsHaSubidoDocumento(): boolean {
    return this.documentos.some(d => d.rol_firmante === 'analista_tics');
  }

  // =====================================================
  // DESCARGA DEL PDF GENERADO
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

        if (err.status === 401) {
          this.authService.logout();
          this.router.navigate(['/auth/login']);
          return;
        }

        if (err.status === 403) {
          this.mostrarError(
            'Acceso denegado',
            err.error?.mensaje || 'No tiene permisos para descargar este PDF.'
          );
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
  // DESCARGA DEL ÚLTIMO PDF FIRMADO ACTUAL
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

        const nombreArchivo =
          `${this.solicitud?.codigo_solicitud || 'solicitud'}_documento_firmado_actual.pdf`;

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

        if (err.status === 401) {
          this.authService.logout();
          this.router.navigate(['/auth/login']);
          return;
        }

        if (err.status === 403) {
          this.mostrarError(
            'Acceso denegado',
            err.error?.mensaje || 'No tiene permisos para descargar este documento.'
          );
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
  // MODAL PDF FIRMADO ELECTRÓNICAMENTE
  // JEFE / AUTORIDAD / TICS
  // =====================================================

  abrirModalFirmaElectronica(): void {
    if (this.esAdmin()) {
      this.mostrarError(
        'Acción no permitida',
        'El administrador solo puede revisar y descargar documentos.'
      );
      return;
    }

    if (!this.solicitud) {
      this.mostrarError(
        'Solicitud no encontrada',
        'No se encontró información de la solicitud.'
      );
      return;
    }

    if (this.estaFinalizada()) {
      this.mostrarError(
        'Proceso finalizado',
        'Esta solicitud ya fue finalizada. No se pueden subir más documentos.'
      );
      return;
    }

    this.error = '';
    this.mensajeOk = '';
    this.limpiarPdfFirmadoElectronico();

    this.mostrarModalFirmaElectronica = true;
  }

  cerrarModalFirmaElectronica(): void {
    if (this.procesando) {
      return;
    }

    this.mostrarModalFirmaElectronica = false;
    this.error = '';
    this.mensajeOk = '';
    this.limpiarPdfFirmadoElectronico();
  }
    // =====================================================
  // SELECCIÓN Y VISTA PREVIA DEL PDF FIRMADO
  // =====================================================

  seleccionarArchivoFirmadoElectronico(event: Event): void {
    this.error = '';
    this.mensajeOk = '';

    const input = event.target as HTMLInputElement;

    if (!input.files || input.files.length === 0) {
      return;
    }

    const archivo = input.files[0];

    const nombreArchivo = archivo.name.toLowerCase();
    const esPdfPorExtension = nombreArchivo.endsWith('.pdf');
    const esPdfPorMime = archivo.type === 'application/pdf' || archivo.type === '';

    if (!esPdfPorExtension || !esPdfPorMime) {
      this.mostrarError(
        'Archivo no permitido',
        'Solo se permite subir archivos PDF firmados electrónicamente.'
      );

      input.value = '';
      return;
    }

    const maxMb = 15;
    const maxBytes = maxMb * 1024 * 1024;

    if (archivo.size > maxBytes) {
      this.mostrarError(
        'Archivo demasiado grande',
        `El PDF firmado no puede superar ${maxMb} MB.`
      );

      input.value = '';
      return;
    }

    this.liberarVistaPreviaFirmadoElectronico();

    this.archivoFirmadoElectronico = archivo;
    this.nombreArchivoFirmadoElectronico = archivo.name;
    this.urlVistaPreviaFirmadoElectronico = URL.createObjectURL(archivo);

    this.mensajeOk = 'PDF firmado seleccionado correctamente. Revise el archivo antes de enviarlo.';
  }

  verPdfFirmadoElectronico(): void {
    if (!this.urlVistaPreviaFirmadoElectronico) {
      this.mostrarError(
        'PDF no seleccionado',
        'Primero seleccione un PDF firmado electrónicamente.'
      );
      return;
    }

    window.open(this.urlVistaPreviaFirmadoElectronico, '_blank', 'noopener,noreferrer');
  }

  quitarPdfFirmadoElectronico(): void {
    this.archivoFirmadoElectronico = null;
    this.nombreArchivoFirmadoElectronico = '';
    this.error = '';
    this.mensajeOk = '';

    this.liberarVistaPreviaFirmadoElectronico();
  }

  limpiarPdfFirmadoElectronico(): void {
    this.archivoFirmadoElectronico = null;
    this.nombreArchivoFirmadoElectronico = '';
    this.liberarVistaPreviaFirmadoElectronico();
  }

  liberarVistaPreviaFirmadoElectronico(): void {
    if (this.urlVistaPreviaFirmadoElectronico) {
      URL.revokeObjectURL(this.urlVistaPreviaFirmadoElectronico);
      this.urlVistaPreviaFirmadoElectronico = '';
    }
  }

  // =====================================================
  // SUBIR FIRMA ELECTRÓNICA
  // JEFE / AUTORIDAD / TICS
  // =====================================================

  async subirFirmaElectronica(): Promise<void> {
    if (this.esAdmin()) {
      this.mostrarError(
        'Acción no permitida',
        'El administrador solo puede revisar y descargar documentos.'
      );
      return;
    }

    if (!this.solicitud?.id) {
      this.mostrarError(
        'Solicitud no encontrada',
        'No se encontró el ID de la solicitud.'
      );
      return;
    }

    if (!this.archivoFirmadoElectronico) {
      this.mostrarError(
        'PDF requerido',
        'Debe seleccionar el PDF firmado electrónicamente con FirmaEC.'
      );
      return;
    }

    const resultado = await Swal.fire({
      title: 'Enviar PDF firmado',
      html: `
        <div style="text-align:center">
          <p style="margin:0 0 12px;color:#475569;">
            Verifique que el documento seleccionado sea el PDF correcto y que esté firmado electrónicamente con FirmaEC.
          </p>

          <strong style="display:inline-block;color:#1d4ed8;font-size:16px;margin-bottom:10px;">
            ${this.solicitud.codigo_solicitud}
          </strong>

          <div style="
            margin-top:12px;
            padding:12px;
            border-radius:14px;
            background:#f8fafc;
            border:1px solid #e2e8f0;
            color:#334155;
            font-size:14px;
          ">
            Archivo: <b>${this.nombreArchivoFirmadoElectronico}</b>
          </div>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, enviar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#15803d',
      cancelButtonColor: '#64748b',
      reverseButtons: true,
      background: '#ffffff',
      color: '#0f172a'
    });

    if (!resultado.isConfirmed) {
      return;
    }

    const rolFirmante: RolFirmante = this.esJefe()
      ? 'jefe_inmediato'
      : this.esAutoridad()
        ? 'maxima_autoridad'
        : 'analista_tics';

    this.procesando = true;
    this.error = '';
    this.mensajeOk = '';

    this.solicitudesService.subirPdfFirmadoElectronico(
      this.solicitud.id,
      this.archivoFirmadoElectronico,
      rolFirmante
    ).subscribe({
      next: (response) => {
        this.procesando = false;

        if (response.estado !== 'ok') {
          this.mostrarError(
            'No se pudo subir',
            response.mensaje || 'No se pudo subir el PDF firmado electrónicamente.'
          );
          return;
        }

        this.documentoFirmadoCargado = true;
        this.guardarDocumentoFirmadoLocal();

        this.limpiarPdfFirmadoElectronico();
        this.mostrarModalFirmaElectronica = false;

        Swal.fire({
          title: 'PDF firmado enviado',
          text: response.mensaje || 'El PDF firmado electrónicamente fue subido correctamente.',
          icon: 'success',
          confirmButtonText: 'Entendido',
          confirmButtonColor: '#15803d',
          background: '#ffffff',
          color: '#0f172a'
        }).then(() => {
          this.cargarDetalle();
        });
      },
      error: (err: any) => {
        this.procesando = false;

        if (err.status === 401) {
          this.authService.logout();
          this.router.navigate(['/auth/login']);
          return;
        }

        if (err.status === 403) {
          this.mostrarError(
            'Acceso denegado',
            err.error?.mensaje || 'No tiene permisos para subir la firma de esta solicitud.'
          );
          return;
        }

        this.mostrarError(
          'No se pudo subir',
          err.error?.mensaje ||
          err.error?.error ||
          'No se pudo subir el PDF firmado electrónicamente.'
        );
      }
    });
  }

  // =====================================================
  // APROBACIÓN GENERAL JEFE / AUTORIDAD
  // =====================================================

  async confirmarAprobacion(): Promise<void> {
    if (this.esAdmin()) {
      this.mostrarError(
        'Acción no permitida',
        'El administrador no aprueba solicitudes. Solo revisa el proceso.'
      );
      return;
    }

    if (!this.solicitud) {
      return;
    }

    if (!this.documentoFirmadoCargado) {
      Swal.fire({
        title: 'PDF firmado requerido',
        text: 'Antes de aprobar debe subir el PDF firmado electrónicamente con FirmaEC.',
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
  // TICS: APROBAR (valida + finaliza en un solo paso)
  // =====================================================

  async confirmarAprobacionTics(): Promise<void> {
    if (!this.solicitud || this.esAdmin()) {
      return;
    }

    if (!this.puedeAprobarValidacionTics()) {
      this.mostrarError(
        'Acción no disponible',
        'La solicitud no está en estado pendiente de validación TICS o falta subir el PDF firmado.'
      );
      return;
    }

    const resultado = await Swal.fire({
      title: 'Aprobar y finalizar proceso TICS',
      html: `
        <div style="text-align:center">
          <p style="margin:0 0 12px;color:#475569;line-height:1.6;">
            Esta acción aprobará la validación técnica y
            <strong>finalizará automáticamente</strong> la solicitud,
            notificando al solicitante por correo.
          </p>

          <strong style="display:inline-block;color:#1d4ed8;font-size:17px;margin-bottom:12px;">
            ${this.solicitud.codigo_solicitud}
          </strong>

          <div style="
            padding:12px;border-radius:14px;
            background:#f0fdf4;border:1px solid #bbf7d0;
            color:#166534;font-size:14px;
          ">
            <b>Solicitante:</b> ${this.solicitud.nombres_completos}<br>
            <b>Correo:</b> ${this.solicitud.correo_institucional}
          </div>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, aprobar y finalizar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#15803d',
      cancelButtonColor: '#64748b',
      reverseButtons: true,
      background: '#ffffff',
      color: '#0f172a'
    });

    if (resultado.isConfirmed) {
      this.aprobarTicsCompleto();
    }
  }

  // =====================================================
  // TICS: FINALIZAR (fallback si el estado quedó en pendiente_ejecucion_tics)
  // =====================================================

  async confirmarFinalizacionTics(): Promise<void> {
    if (!this.solicitud || this.esAdmin() || !this.puedeFinalizarTics()) {
      return;
    }

    const resultado = await Swal.fire({
      title: 'Finalizar proceso TICS',
      text: '¿Confirma que desea finalizar la solicitud y notificar al solicitante?',
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
  // TICS: APROBAR EN DOS PASOS ENCADENADOS
  // Paso 1: pendiente_tics → pendiente_ejecucion_tics
  // Paso 2: pendiente_ejecucion_tics → finalizada + correo
  // =====================================================

  aprobarTicsCompleto(): void {
    if (!this.solicitud) {
      return;
    }

    const solicitudId = this.solicitud.id;

    this.procesando = true;
    this.error = '';
    this.mensajeOk = '';

    // Paso 1: validar
    this.solicitudesService.aprobarSolicitud(solicitudId).subscribe({
      next: () => {
        // Paso 2: finalizar
        this.solicitudesService.aprobarSolicitud(solicitudId).subscribe({
          next: (response) => {
            this.procesando = false;

            const correoEnviado = response?.correo_enviado === true;
            const correoDestino = response?.solicitud?.correo_destino
              || this.solicitud?.correo_institucional || '';
            const errorCorreo = response?.error_correo;

            Swal.fire({
              title: 'Proceso TICS finalizado',
              html: `
                <div style="text-align:center">
                  <p style="margin:0 0 14px;color:#475569;line-height:1.6;">
                    La solicitud <strong style="color:#1d4ed8;">
                    ${this.solicitud?.codigo_solicitud}</strong>
                    fue finalizada correctamente.
                  </p>
                  ${correoEnviado ? `
                    <div style="
                      display:flex;align-items:center;gap:10px;
                      padding:14px 16px;border-radius:14px;
                      background:#f0fdf4;border:1px solid #bbf7d0;
                      text-align:left;
                    ">
                      <i class="bi bi-envelope-check-fill"
                         style="color:#16a34a;font-size:20px;flex-shrink:0;"></i>
                      <div>
                        <div style="color:#166534;font-weight:900;font-size:13px;">
                          Notificación enviada
                        </div>
                        <div style="color:#15803d;font-size:13px;margin-top:2px;">
                          Correo enviado a <strong>${correoDestino}</strong>
                        </div>
                      </div>
                    </div>
                  ` : `
                    <div style="
                      display:flex;align-items:center;gap:10px;
                      padding:14px 16px;border-radius:14px;
                      background:#fefce8;border:1px solid #fde047;
                      text-align:left;
                    ">
                      <i class="bi bi-exclamation-triangle-fill"
                         style="color:#ca8a04;font-size:20px;flex-shrink:0;"></i>
                      <div>
                        <div style="color:#854d0e;font-weight:900;font-size:13px;">
                          Correo no enviado
                        </div>
                        <div style="color:#92400e;font-size:13px;margin-top:2px;">
                          ${errorCorreo || 'No se pudo notificar al solicitante.'}
                        </div>
                      </div>
                    </div>
                  `}
                </div>
              `,
              icon: 'success',
              confirmButtonText: 'Entendido',
              confirmButtonColor: '#15803d',
              background: '#ffffff',
              color: '#0f172a'
            }).then(() => {
              this.cargarDetalle();
            });
          },
          error: (err: any) => {
            this.procesando = false;

            if (err.status === 401) {
              this.authService.logout();
              this.router.navigate(['/auth/login']);
              return;
            }

            this.mostrarError(
              'Error al finalizar',
              err.error?.mensaje || 'La validación fue aprobada pero no se pudo finalizar el proceso. Use el botón "Finalizar" para completarlo.'
            );
            this.cargarDetalle();
          }
        });
      },
      error: (err: any) => {
        this.procesando = false;

        if (err.status === 401) {
          this.authService.logout();
          this.router.navigate(['/auth/login']);
          return;
        }

        this.mostrarError(
          'No se pudo aprobar',
          err.error?.mensaje || 'No se pudo aprobar la validación TICS.'
        );
      }
    });
  }

  // =====================================================
  // APROBAR / AVANZAR FLUJO
  // =====================================================

  aprobar(tipoAccion: 'general' | 'finalizacion_tics' = 'general'): void {
    if (this.esAdmin()) {
      this.mostrarError(
        'Acción no permitida',
        'El administrador no puede avanzar el flujo. Solo revisa información y documentos.'
      );
      return;
    }

    if (!this.solicitud) {
      return;
    }

    const estadoAntes = this.solicitud.estado;

    this.procesando = true;
    this.error = '';
    this.mensajeOk = '';

    this.solicitudesService.aprobarSolicitud(this.solicitud.id).subscribe({
      next: (response) => {
        this.procesando = false;

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

        if (tipoAccion === 'finalizacion_tics') {
          const correoEnviado = response?.correo_enviado === true;
          const correoDestino  = response?.solicitud?.correo_destino || this.solicitud?.correo_institucional || '';
          const errorCorreo    = response?.error_correo;

          Swal.fire({
            title: 'Proceso TICS finalizado',
            html: `
              <div style="text-align:center">
                <p style="margin:0 0 14px;color:#475569;line-height:1.6;">
                  La solicitud <strong style="color:#1d4ed8;">${this.solicitud?.codigo_solicitud}</strong>
                  fue finalizada correctamente.
                </p>
                ${correoEnviado ? `
                  <div style="
                    display:flex;align-items:center;gap:10px;
                    padding:14px 16px;border-radius:14px;
                    background:#f0fdf4;border:1px solid #bbf7d0;
                    text-align:left;
                  ">
                    <i class="bi bi-envelope-check-fill" style="color:#16a34a;font-size:20px;flex-shrink:0;"></i>
                    <div>
                      <div style="color:#166534;font-weight:900;font-size:13px;">Notificación enviada</div>
                      <div style="color:#15803d;font-size:13px;margin-top:2px;">
                        Se envió un correo a <strong>${correoDestino}</strong>
                      </div>
                    </div>
                  </div>
                ` : `
                  <div style="
                    display:flex;align-items:center;gap:10px;
                    padding:14px 16px;border-radius:14px;
                    background:#fefce8;border:1px solid #fde047;
                    text-align:left;
                  ">
                    <i class="bi bi-exclamation-triangle-fill" style="color:#ca8a04;font-size:20px;flex-shrink:0;"></i>
                    <div>
                      <div style="color:#854d0e;font-weight:900;font-size:13px;">Correo no enviado</div>
                      <div style="color:#92400e;font-size:13px;margin-top:2px;">
                        ${errorCorreo || 'No se pudo enviar la notificación al solicitante.'}
                      </div>
                    </div>
                  </div>
                `}
              </div>
            `,
            icon: 'success',
            confirmButtonText: 'Entendido',
            confirmButtonColor: '#15803d',
            background: '#ffffff',
            color: '#0f172a'
          }).then(() => {
            this.cargarDetalle();
          });
          return;
        }

        const titulo = 'Solicitud aprobada';
        const texto = response?.mensaje || 'La solicitud avanzó correctamente a la siguiente etapa.';

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

        if (err.status === 401) {
          this.authService.logout();
          this.router.navigate(['/auth/login']);
          return;
        }

        if (err.status === 403) {
          this.mostrarError(
            'Acceso denegado',
            err.error?.mensaje || 'No tiene permisos para aprobar o finalizar esta solicitud.'
          );
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
    if (this.esAdmin()) {
      this.mostrarError(
        'Acción no permitida',
        'El administrador no rechaza solicitudes. Solo revisa el proceso.'
      );
      return;
    }

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
    if (this.esAdmin()) {
      this.mostrarError(
        'Acción no permitida',
        'El administrador no puede rechazar solicitudes.'
      );
      return;
    }

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

        if (err.status === 401) {
          this.authService.logout();
          this.router.navigate(['/auth/login']);
          return;
        }

        if (err.status === 403) {
          this.mostrarError(
            'Acceso denegado',
            err.error?.mensaje || 'No tiene permisos para rechazar esta solicitud.'
          );
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
    if (!this.solicitud || this.esAdmin()) {
      return false;
    }

    const estado = this.solicitud.estado;

    if (this.esJefe()) {
      return estado === 'pendiente_jefe_inmediato' && this.jefeHaSubidoDocumento;
    }

    if (this.esAutoridad()) {
      return estado === 'pendiente_maxima_autoridad' && this.autoridadHaSubidoDocumento;
    }

    return false;
  }

  puedeAprobarValidacionTics(): boolean {
    if (!this.solicitud || !this.esTics()) {
      return false;
    }

    return this.solicitud.estado === 'pendiente_tics' && this.ticsHaSubidoDocumento;
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

    if (this.esAdmin()) {
      return false;
    }

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

    if (this.esAdmin()) {
      return 'Solo revisión';
    }

    const textos: Record<string, string> = {
      pendiente_jefe_inmediato: 'Aprobar como jefe inmediato',
      pendiente_maxima_autoridad: 'Aprobar como máxima autoridad'
    };

    return textos[this.solicitud.estado] || 'Aprobar solicitud';
  }

  // =====================================================
  // TRACK BY
  // =====================================================

  trackByPagina(_index: number, pagina: PaginaWebAdmin): number {
    return pagina.id;
  }

  trackByDocumento(_index: number, documento: DocumentoSolicitud): number {
    return documento.id;
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
      finalizado: 'Finalizado',
      proceso_manual: 'Proceso manual'
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

  private mostrarError(titulo: string, mensaje: string): void {
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