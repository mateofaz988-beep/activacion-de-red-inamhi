import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface PaginaWebSolicitud {
  url_pagina: string;
  descripcion: string;
}

export interface SolicitudPublicaRequest {
  nombres_completos: string;
  cedula: string;
  correo_institucional: string;
  telefono_ext: string;
  dependencia: string;
  area_unidad: string;
  cargo: string;
  fecha_solicitud: string;
  tipo_usuario: 'funcionario_inamhi' | 'externo';
  nombre_usuario_externo: string;
  direccion_ip: string;
  tiempo_vigencia_acceso: string;
  justificacion_necesidad_institucional: string;
  paginas_web: PaginaWebSolicitud[];
}

export interface SolicitudPublicaResponse {
  estado: string;
  mensaje: string;
  solicitud: {
    id: number;
    codigo_solicitud: string;
    estado: string;
    etapa_actual: string;
    nombres_completos: string;
    correo_institucional: string;
  };
}

export interface SeguimientoResponse {
  estado: string;
  solicitud: {
    id: number;
    codigo_solicitud: string;
    nombres_completos: string;
    cedula: string;
    correo_institucional: string;
    dependencia: string;
    area_unidad: string;
    cargo: string;
    fecha_solicitud: string;
    tipo_usuario: string;
    tiempo_vigencia_acceso: string;
    justificacion_necesidad_institucional: string;
    estado: string;
    etapa_actual: string;
    bloqueada: boolean;
    created_at: string;
    updated_at: string;
  };
  paginas_web: PaginaWebSolicitud[];
}

@Injectable({
  providedIn: 'root'
})
export class SolicitudPublicaService {

  private readonly API_URL = 'http://10.0.5.120:5050/api/public/solicitudes';

  constructor(private http: HttpClient) {}

  registrarSolicitud(data: SolicitudPublicaRequest): Observable<SolicitudPublicaResponse> {
    return this.http.post<SolicitudPublicaResponse>(this.API_URL, data);
  }

  consultarSeguimiento(codigo: string): Observable<SeguimientoResponse> {
    return this.http.get<SeguimientoResponse>(`${this.API_URL}/seguimiento/${codigo}`);
  }
}