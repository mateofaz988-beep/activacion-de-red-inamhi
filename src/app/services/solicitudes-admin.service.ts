
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';

import { Observable } from 'rxjs';



/* =====================================================
   INTERFACES
===================================================== */

export interface PaginaWebAdmin {
  id: number;
  numero: number;
  url_pagina: string;
  descripcion: string;
}

export interface SolicitudAdmin {
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
  nombre_usuario_externo: string | null;
  direccion_ip: string | null;
  tiempo_vigencia_acceso: string;
  justificacion_necesidad_institucional: string;
  estado: string;
  etapa_actual: string;
  bloqueada: boolean;
  created_at: string;
  updated_at: string;
  total_paginas: number;

  documento_actual_id?: number | null;
  requiere_firma?: boolean | number;
  firma_actual_validada?: boolean | number;
}

export interface DocumentoSolicitud {
  id: number;
  solicitud_id: number;
  etapa: string;
  rol_firmante: string;
  usuario_id: number | null;
  tipo_documento: string;
  nombre_archivo: string;
  ruta_archivo: string;
  mime_type: string;
  firmado: boolean | number;
  firma_validada: boolean | number;
  observacion: string | null;
  created_at: string;
  updated_at: string;
}

export interface SolicitudesAdminResponse {
  estado: string;
  mensaje: string;
  total: number;
  solicitudes: SolicitudAdmin[];
}

export interface SolicitudManual {
  id: number;
  uuid_solicitud: string;
  nombres: string;
  apellidos: string;
  correo: string;
  estado: string;
  documento_vacio: string | null;
  documento_escaneado: string | null;
  fecha_registro: string | null;
  hora_registro: string | null;
  created_at: string;
  updated_at: string;
  log_auditoria?: string;
  tiene_documento_firmado: boolean;
}

export interface SolicitudesManualesResponse {
  estado: string;
  mensaje: string;
  total: number;
  solicitudes: SolicitudManual[];
}

export interface SolicitudDetalleResponse {
  estado: string;
  solicitud: SolicitudAdmin;
  paginas_web: PaginaWebAdmin[];
  documentos?: DocumentoSolicitud[];
  documento_firmado_cargado?: boolean;
}

export interface FlujoSolicitudResponse {
  estado: string;
  mensaje: string;

  correo_enviado?: boolean;
  error_correo?: string | null;

  solicitud: {
    id: number;
    codigo_solicitud: string;
    correo_destino?: string;

    estado_anterior: string;
    estado_actual: string;
    etapa_actual: string;
    motivo?: string;

    documento_firmado?: {
      id: number;
      tipo_documento: string;
      nombre_archivo: string;
    };
  };
}

export interface SubirDocumentoResponse {
  estado: string;
  mensaje: string;
  documento?: {
    id: number;
    solicitud_id: number;
    tipo_documento: string;
    nombre_archivo: string;
    rol_firmante: string;
    etapa: string;
    firmado: boolean;
    firma_validada: boolean;
  };
  correo_enviado?: boolean;
}

export type RolFirmante = 'jefe_inmediato' | 'maxima_autoridad' | 'analista_tics';

/* =====================================================
   SERVICIO
===================================================== */

@Injectable({
  providedIn: 'root'
})
export class SolicitudesAdminService {

  private readonly API_BASE = 'http://localhost:5050/api';
  private readonly API_URL = `${this.API_BASE}/admin/solicitudes`;

  constructor(private http: HttpClient) {}

  /* =====================================================
     HEADERS
  ===================================================== */

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('auth_token_liberacion_web') || '';

    return new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
  }

  /* =====================================================
     LISTAR SOLICITUDES
  ===================================================== */

  listarSolicitudes(
    estado: string = '',
    q: string = ''
  ): Observable<SolicitudesAdminResponse> {
    const params: string[] = [];

    if (estado) {
      params.push(`estado=${encodeURIComponent(estado)}`);
    }

    if (q) {
      params.push(`q=${encodeURIComponent(q)}`);
    }

    const query = params.length ? `?${params.join('&')}` : '';

    return this.http.get<SolicitudesAdminResponse>(
      `${this.API_URL}${query}`,
      { headers: this.getHeaders() }
    );
  }

  listarMisSolicitudes(
    q: string = '',
    estado: string = ''
  ): Observable<SolicitudesAdminResponse> {
    const params: string[] = [];

    if (q) {
      params.push(`q=${encodeURIComponent(q)}`);
    }

    if (estado) {
      params.push(`estado=${encodeURIComponent(estado)}`);
    }

    const query = params.length ? `?${params.join('&')}` : '';

    return this.http.get<SolicitudesAdminResponse>(
      `${this.API_BASE}/mis-solicitudes${query}`,
      { headers: this.getHeaders() }
    );
  }

  /* =====================================================
     DETALLE DE SOLICITUD
  ===================================================== */

  obtenerSolicitudPorId(id: number): Observable<SolicitudDetalleResponse> {
    return this.http.get<SolicitudDetalleResponse>(
      `${this.API_URL}/${id}`,
      { headers: this.getHeaders() }
    );
  }

  /* =====================================================
     FLUJO: APROBAR / AVANZAR
  ===================================================== */

  aprobarSolicitud(id: number): Observable<FlujoSolicitudResponse> {
    return this.http.put<FlujoSolicitudResponse>(
      `${this.API_URL}/${id}/aprobar`,
      {},
      { headers: this.getHeaders() }
    );
  }

  aprobarValidacionTics(id: number): Observable<FlujoSolicitudResponse> {
    return this.aprobarSolicitud(id);
  }

  finalizarProcesoTics(id: number): Observable<FlujoSolicitudResponse> {
    return this.aprobarSolicitud(id);
  }

  /* =====================================================
     FLUJO: RECHAZAR
  ===================================================== */

  rechazarSolicitud(
    id: number,
    motivo: string
  ): Observable<FlujoSolicitudResponse> {
    return this.http.put<FlujoSolicitudResponse>(
      `${this.API_URL}/${id}/rechazar`,
      { motivo },
      { headers: this.getHeaders() }
    );
  }

  /* =====================================================
     DESCARGA DE PDF GENERADO (lleno con datos)
  ===================================================== */

  descargarPdfSolicitud(id: number): Observable<Blob> {
    return this.http.get(
      `${this.API_URL}/${id}/pdf`,
      {
        headers: this.getHeaders(),
        responseType: 'blob'
      }
    );
  }

  /* =====================================================
     DESCARGA DEL ÚLTIMO DOCUMENTO FIRMADO
  ===================================================== */

  descargarDocumentoFirmadoActual(id: number): Observable<Blob> {
    return this.http.get(
      `${this.API_URL}/${id}/documento-actual`,
      {
        headers: this.getHeaders(),
        responseType: 'blob'
      }
    );
  }

  /* alias para compatibilidad con código existente */
  descargarDocumentoActualSolicitud(id: number): Observable<Blob> {
    return this.descargarDocumentoFirmadoActual(id);
  }

  /* =====================================================
     SUBIR PDF FIRMADO CON FIRMAEC
     Todos los roles usan /documentos (no auto-avanza el estado).
     El estado avanza solo cuando el rol presiona "Aprobar".
  ===================================================== */

  subirPdfFirmadoElectronico(
    solicitudId: number,
    archivo: File,
    _rolFirmante?: RolFirmante
  ): Observable<SubirDocumentoResponse> {
    const params = new URLSearchParams({
      tipo_documento: 'pdf_firmado_electronico',
      nombre_archivo: archivo.name || 'documento.pdf'
    }).toString();

    return this.http.post<SubirDocumentoResponse>(
      `${this.API_URL}/${solicitudId}/documentos?${params}`,
      archivo,
      { headers: this.getHeaders().set('Content-Type', 'application/octet-stream') }
    );
  }

  /* =====================================================
     SUBIR PDF FIRMADO (admin — cualquier tipo)
     Útil para cargas manuales del administrador.
  ===================================================== */

  subirDocumentoFirmado(
    solicitudId: number,
    archivo: File,
    tipoDocumento: string = 'pdf_firmado_electronico',
    observacion: string = ''
  ): Observable<SubirDocumentoResponse> {
    const paramsObj: Record<string, string> = {
      tipo_documento: tipoDocumento,
      nombre_archivo: archivo.name || 'documento.pdf'
    };
    if (observacion) {
      paramsObj['observacion'] = observacion;
    }
    const params = new URLSearchParams(paramsObj).toString();

    return this.http.post<SubirDocumentoResponse>(
      `${this.API_URL}/${solicitudId}/documentos?${params}`,
      archivo,
      { headers: this.getHeaders().set('Content-Type', 'application/octet-stream') }
    );
  }

  /* =====================================================
     SUBIR IMAGEN DE FIRMA ELECTRÓNICA AUTOMÁTICA
     El backend inserta la imagen dentro del PDF.
     Acepta PNG / JPG / JPEG — NO es un PDF.
  ===================================================== */

  subirImagenFirmaAutomatica(
    solicitudId: number,
    imagenFirma: File
  ): Observable<SubirDocumentoResponse> {
    const formData = new FormData();
    formData.append('firma', imagenFirma);

    return this.http.post<SubirDocumentoResponse>(
      `${this.API_URL}/${solicitudId}/firma-electronica`,
      formData,
      { headers: this.getHeaders() }
    );
  }

  /* =====================================================
     PROCESOS MANUALES (ADMIN)
  ===================================================== */

  listarSolicitudesManuales(
    estado: string = '',
    q: string = ''
  ): Observable<SolicitudesManualesResponse> {
    const params: string[] = [];

    if (estado) {
      params.push(`estado=${encodeURIComponent(estado)}`);
    }

    if (q) {
      params.push(`q=${encodeURIComponent(q)}`);
    }

    const query = params.length ? `?${params.join('&')}` : '';

    return this.http.get<SolicitudesManualesResponse>(
      `${this.API_BASE}/admin/manuales${query}`,
      { headers: this.getHeaders() }
    );
  }

  descargarDocumentoManualFirmado(uuid: string): Observable<Blob> {
    return this.http.get(
      `${this.API_BASE}/admin/manuales/${encodeURIComponent(uuid)}/descargar-firmado`,
      { headers: this.getHeaders(), responseType: 'blob' }
    );
  }

  /* =====================================================
     UTILIDAD: DESCARGAR BLOB COMO ARCHIVO
  ===================================================== */

  descargarBlob(
    blob: Blob,
    nombreArchivo: string,
    mimeType: string = 'application/pdf'
  ): void {
    const archivo = new Blob([blob], { type: mimeType });
    const url = window.URL.createObjectURL(archivo);
    const enlace = document.createElement('a');

    enlace.href = url;
    enlace.download = nombreArchivo;
    enlace.click();

    window.URL.revokeObjectURL(url);
  }
}
