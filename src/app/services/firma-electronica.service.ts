
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/* =====================================================
   INTERFACES
===================================================== */

export interface InformacionCertificado {
  subject_cn: string;
  subject_o: string;
  issuer_cn: string;
  numero_serie: string;
  fecha_emision: string;
  fecha_expiracion: string;
  vigente: boolean;
  dias_restantes: number;
}

export interface ResultadoValidacionCertificado {
  estado: string;
  mensaje: string;
  info?: InformacionCertificado;
}

export interface FirmaDigitalResultado {
  id: number;
  modo: 'pyhanko' | 'firmaec';
  nombre_pdf: string;
  hash_sha256: string;
  validacion: string;
  certificado: {
    subject_cn: string;
    issuer_cn: string;
    numero_serie: string;
    vigente: boolean;
  };
}

export interface ResultadoFirmaDigital {
  estado: string;
  mensaje: string;
  firma?: FirmaDigitalResultado;
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
}

export interface FirmaRegistrada {
  id: number;
  rol_firmante: string;
  etapa: string;
  modo_firma: 'pyhanko' | 'firmaec';
  subject_cn: string;
  issuer_cn: string;
  numero_serie: string;
  nombre_pdf_firmado: string;
  hash_sha256_despues: string;
  firma_valida: boolean;
  resultado_validacion: string;
  observacion: string | null;
  created_at: string;
  nombres: string;
  apellidos: string;
}

export interface VersionDocumento {
  id: number;
  version: number;
  etapa: string;
  rol_firmante: string | null;
  tipo: string;
  nombre_archivo: string;
  hash_sha256: string | null;
  tamano_bytes: number | null;
  es_version_actual: boolean;
  created_at: string;
}

export interface HistorialFirmasResponse {
  estado: string;
  solicitud_id: number;
  firmas: FirmaRegistrada[];
  versiones: VersionDocumento[];
  total_firmas: number;
  total_versiones: number;
}

export interface VerificacionPublicaResponse {
  estado: string;
  solicitud: {
    codigo: string;
    solicitante: string;
    estado: string;
    etapa: string;
    fecha_registro: string;
  };
  firmantes: {
    rol: string;
    titular: string;
    emisor: string;
    serie: string;
    modo: string;
    valida: boolean;
    hash: string;
    fecha: string;
  }[];
  total_firmas: number;
  version_actual: {
    version: number;
    archivo: string;
    hash: string;
    fecha: string;
  } | null;
  url_verificacion: string;
}

/* =====================================================
   SERVICIO
===================================================== */

@Injectable({
  providedIn: 'root'
})
export class FirmaElectronicaService {

  private readonly API_BASE = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /* =====================================================
     HEADERS
  ===================================================== */

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('auth_token_liberacion_web') || '';
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  /* =====================================================
     VALIDAR CERTIFICADO .p12/.pfx
     Verifica si el certificado es válido y devuelve info
  ===================================================== */

  validarCertificado(
    solicitudId: number,
    certificado: File,
    password: string
  ): Observable<ResultadoValidacionCertificado> {
    const formData = new FormData();
    formData.append('certificado', certificado);
    formData.append('password', password);

    return this.http.post<ResultadoValidacionCertificado>(
      `${this.API_BASE}/admin/solicitudes/${solicitudId}/validar-certificado`,
      formData,
      { headers: this.getHeaders() }
    );
  }

  /* =====================================================
     FIRMAR PDF CON PYHANKO (.p12/.pfx → firma real)
     El backend firma criptográficamente el PDF
  ===================================================== */

  firmarConPyhanko(
    solicitudId: number,
    certificado: File,
    password: string,
    observacion: string = ''
  ): Observable<ResultadoFirmaDigital> {
    const formData = new FormData();
    formData.append('certificado', certificado);
    formData.append('password', password);
    if (observacion.trim()) {
      formData.append('observacion', observacion.trim());
    }

    return this.http.post<ResultadoFirmaDigital>(
      `${this.API_BASE}/admin/solicitudes/${solicitudId}/firmar-pyhanko`,
      formData,
      { headers: this.getHeaders() }
    );
  }

  /* =====================================================
     HISTORIAL DE FIRMAS DE UNA SOLICITUD
  ===================================================== */

  obtenerHistorialFirmas(solicitudId: number): Observable<HistorialFirmasResponse> {
    return this.http.get<HistorialFirmasResponse>(
      `${this.API_BASE}/admin/solicitudes/${solicitudId}/firmas`,
      { headers: this.getHeaders() }
    );
  }

  /* =====================================================
     VERIFICACIÓN PÚBLICA (sin token)
  ===================================================== */

  verificarDocumentoPublico(codigo: string): Observable<VerificacionPublicaResponse> {
    return this.http.get<VerificacionPublicaResponse>(
      `${this.API_BASE}/public/verificar/${encodeURIComponent(codigo)}`
    );
  }

  /* =====================================================
     DESCARGAR VERSIÓN ESPECÍFICA
  ===================================================== */

  descargarVersion(solicitudId: number, versionId: number): Observable<Blob> {
    return this.http.get(
      `${this.API_BASE}/admin/solicitudes/${solicitudId}/versiones/${versionId}/descargar`,
      { headers: this.getHeaders(), responseType: 'blob' }
    );
  }
}
