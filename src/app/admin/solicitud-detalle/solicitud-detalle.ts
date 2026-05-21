import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
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
  procesandoAprobacion = false;
  procesandoFinalizacion = false;
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
    private http: HttpClient,
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

  // =====================================================
  // DESCARGA DEL PDF GENERADO
  // Queda disponible para compatibilidad, pero el HTML
  // operativo ya no muestra este botón.
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
  // URL DE SUBIDA SEGÚN ROL
  // =====================================================

  obtenerUrlSubidaFirmaElectronica(): string {
    if (!this.solicitud?.id) {
      return '';
    }

    if (this.esJefe()) {
      return `${this.API_BASE}/solicitudes/${this.solicitud.id}/jefe/subir-firma`;
    }

    if (this.esAutoridad()) {
      return `${this.API_BASE}/solicitudes/${this.solicitud.id}/autoridad/subir-firma`;
    }

    if (this.esTics()) {
      return `${this.API_BASE}/solicitudes/${this.solicitud.id}/tics/subir-firma`;
    }

    return '';
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

    const url = this.obtenerUrlSubidaFirmaElectronica();

    if (!url) {
      this.mostrarError(
        'Ruta no configurada',
        'El rol actual no tiene una ruta configurada para subir firma electrónica.'
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

    const formData = new FormData();
    formData.append('archivo', this.archivoFirmadoElectronico);

    this.procesando = true;
    this.error = '';
    this.mensajeOk = '';

    this.http.post<any>(url, formData).subscribe({
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

        if (err.status === 401 || err.status === 403) {
          this.authService.logout();
          this.router.navigate(['/auth/login']);
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
  // COMPATIBILIDAD CON HTML ANTERIOR
  // Si tu HTML usa estos nombres, no tendrás error.
  // =====================================================

  seleccionarArchivoFirmaElectronica(event: Event): void {
    this.seleccionarArchivoFirmadoElectronico(event);
  }

  verPdfFirmaElectronica(): void {
    this.verPdfFirmadoElectronico();
  }

  quitarPdfFirmaElectronica(): void {
    this.quitarPdfFirmadoElectronico();
  }

  liberarVistaPreviaFirmaElectronica(): void {
    this.liberarVistaPreviaFirmadoElectronico();
  }

  subirPdfFirmadoElectronico(): void {
    this.subirFirmaElectronica();
  }

  subirPdfFirmaElectronica(): void {
    this.subirFirmaElectronica();
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
  // TICS: APROBAR VALIDACIÓN
  // =====================================================

  async confirmarAprobacionTics(): Promise<void> {
    if (this.esAdmin()) {
      this.mostrarError(
        'Acción no permitida',
        'El administrador no aprueba validaciones TICS. Solo revisa el proceso.'
      );
      return;
    }

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
        title: 'PDF firmado requerido',
        text: 'Para aprobar la validación TICS debe subir el PDF firmado electrónicamente con FirmaEC.',
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
    if (this.esAdmin()) {
      this.mostrarError(
        'Acción no permitida',
        'El administrador no finaliza procesos. Solo revisa información y documentos.'
      );
      return;
    }

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
        title: 'PDF firmado requerido',
        text: 'Para finalizar el proceso TICS debe existir un PDF firmado electrónicamente cargado.',
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
      return false;
    }

    if (this.esJefe()) {
      return estado === 'pendiente_jefe_inmediato';
    }

    if (this.esAutoridad()) {
      return estado === 'pendiente_maxima_autoridad';
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