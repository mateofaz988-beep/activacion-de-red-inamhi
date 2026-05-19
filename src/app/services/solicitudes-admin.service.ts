import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
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
  documento: {
    id: number;
    solicitud_id: number;
    tipo_documento: string;
    nombre_archivo: string;
    rol_firmante: string;
    etapa: string;
    firmado: boolean;
    firma_validada: boolean;
  };
}

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
      {
        headers: this.getHeaders()
      }
    );
  }

  listarMisSolicitudes(q: string = ''): Observable<SolicitudesAdminResponse> {
    const query = q ? `?q=${encodeURIComponent(q)}` : '';

    return this.http.get<SolicitudesAdminResponse>(
      `${this.API_BASE}/mis-solicitudes${query}`,
      {
        headers: this.getHeaders()
      }
    );
  }

  /* =====================================================
     DETALLE DE SOLICITUD
  ===================================================== */

  obtenerSolicitudPorId(id: number): Observable<SolicitudDetalleResponse> {
    return this.http.get<SolicitudDetalleResponse>(
      `${this.API_URL}/${id}`,
      {
        headers: this.getHeaders()
      }
    );
  }

  /* =====================================================
     FLUJO: APROBAR / AVANZAR
  ===================================================== */

  aprobarSolicitud(id: number): Observable<FlujoSolicitudResponse> {
    return this.http.put<FlujoSolicitudResponse>(
      `${this.API_URL}/${id}/aprobar`,
      {},
      {
        headers: this.getHeaders()
      }
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
      {
        motivo
      },
      {
        headers: this.getHeaders()
      }
    );
  }

  /* =====================================================
     DESCARGA DE PDF GENERADO
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
     DESCARGA DE PDF FIRMADO ACTUAL
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

  descargarDocumentoActualSolicitud(id: number): Observable<Blob> {
    return this.descargarDocumentoFirmadoActual(id);
  }

  /* =====================================================
     SUBIDA DE PDF FIRMADO MANUALMENTE
  ===================================================== */

  subirDocumentoFirmado(
    solicitudId: number,
    archivo: File,
    tipoDocumento: string,
    observacion: string = ''
  ): Observable<SubirDocumentoResponse> {
    const formData = new FormData();

    formData.append('archivo', archivo);
    formData.append('tipo_documento', tipoDocumento);
    formData.append('observacion', observacion);

    return this.http.post<SubirDocumentoResponse>(
      `${this.API_URL}/${solicitudId}/documentos`,
      formData,
      {
        headers: this.getHeaders()
      }
    );
  }

  /* =====================================================
     FIRMA ELECTRÓNICA AUTOMÁTICA
     Envía imagen PNG/JPG/JPEG al backend.
     El backend coloca la firma dentro del PDF.
  ===================================================== */

  subirFirmaElectronica(
    solicitudId: number,
    imagenFirma: File
  ): Observable<SubirDocumentoResponse> {
    const formData = new FormData();

    /*
      IMPORTANTE:
      El nombre del campo debe ser exactamente "firma",
      porque así lo espera el endpoint Flask:
      request.files["firma"]
    */
    formData.append('firma', imagenFirma);

    return this.http.post<SubirDocumentoResponse>(
      `${this.API_URL}/${solicitudId}/firma-electronica`,
      formData,
      {
        headers: this.getHeaders()
      }
    );
  }

  /* =====================================================
     UTILIDAD OPCIONAL PARA DESCARGAR BLOB
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