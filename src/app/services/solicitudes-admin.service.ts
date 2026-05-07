import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

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
}

export interface FlujoSolicitudResponse {
  estado: string;
  mensaje: string;
  solicitud: {
    id: number;
    codigo_solicitud: string;
    estado_anterior: string;
    estado_actual: string;
    etapa_actual: string;
    motivo?: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class SolicitudesAdminService {

  private readonly API_BASE = 'http://127.0.0.1:5050/api';
  private readonly API_URL = `${this.API_BASE}/admin/solicitudes`;

  constructor(private http: HttpClient) {}

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('auth_token_liberacion_web') || '';

    return new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
  }

  listarSolicitudes(estado: string = '', q: string = ''): Observable<SolicitudesAdminResponse> {
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

  obtenerSolicitudPorId(id: number): Observable<SolicitudDetalleResponse> {
    return this.http.get<SolicitudDetalleResponse>(
      `${this.API_URL}/${id}`,
      {
        headers: this.getHeaders()
      }
    );
  }

  aprobarSolicitud(id: number): Observable<FlujoSolicitudResponse> {
    return this.http.put<FlujoSolicitudResponse>(
      `${this.API_URL}/${id}/aprobar`,
      {},
      {
        headers: this.getHeaders()
      }
    );
  }

  rechazarSolicitud(id: number, motivo: string): Observable<FlujoSolicitudResponse> {
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
}