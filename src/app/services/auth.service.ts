import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

export interface LoginRequest {
  usuario: string;
  password: string;
}

export interface UsuarioLogin {
  id: number;
  nombres: string;
  apellidos: string;
  cedula: string;
  correo: string;
  usuario: string;
  cargo: string;
  area_unidad: string;
  dependencia: string;
  telefono_ext: string;
  rol: string;
}

export interface LoginResponse {
  estado: string;
  mensaje: string;
  token: string;
  usuario: UsuarioLogin;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private readonly API_URL = 'http://10.0.5.120:5050/api';

  private readonly TOKEN_KEY = 'auth_token_liberacion_web';
  private readonly USUARIO_KEY = 'usuario_liberacion_web';
  private readonly ROL_KEY = 'rol_liberacion_web';

  constructor(private http: HttpClient) {}

  login(credentials: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.API_URL}/auth/login`, credentials).pipe(
      tap(response => {
        if (response.estado === 'ok' && response.token && response.usuario) {
          localStorage.setItem(this.TOKEN_KEY, response.token);
          localStorage.setItem(this.USUARIO_KEY, JSON.stringify(response.usuario));
          localStorage.setItem(this.ROL_KEY, response.usuario.rol);
        }
      })
    );
  }

  logout(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USUARIO_KEY);
    localStorage.removeItem(this.ROL_KEY);
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  getUsuario(): UsuarioLogin | null {
    const usuarioGuardado = localStorage.getItem(this.USUARIO_KEY);

    if (!usuarioGuardado) {
      return null;
    }

    try {
      return JSON.parse(usuarioGuardado) as UsuarioLogin;
    } catch {
      this.logout();
      return null;
    }
  }

  getRol(): string | null {
    return localStorage.getItem(this.ROL_KEY);
  }

  isAuthenticated(): boolean {
    const token = this.getToken();
    const usuario = this.getUsuario();
    const rol = this.getRol();

    return !!token && !!usuario && !!rol;
  }

  isAdmin(): boolean {
    return this.getRol() === 'administrador';
  }

  isJefeInmediato(): boolean {
    return this.getRol() === 'jefe_inmediato';
  }

  isMaximaAutoridad(): boolean {
    return this.getRol() === 'maxima_autoridad';
  }

  isTics(): boolean {
    return this.getRol() === 'analista_tics';
  }

  tieneRol(rolesPermitidos: string[]): boolean {
    const rolActual = this.getRol();

    if (!rolActual) {
      return false;
    }

    return rolesPermitidos.includes(rolActual);
  }

  getRutaDashboardPorRol(): string {
    const rol = this.getRol();

    const rutas: Record<string, string> = {
      administrador: '/admin/dashboard',
      jefe_inmediato: '/jefe/dashboard',
      maxima_autoridad: '/autoridad/dashboard',
      analista_tics: '/tics/dashboard'
    };

    return rutas[rol || ''] || '/auth/login';
  }

  getNombreRol(): string {
    const rol = this.getRol();

    const nombres: Record<string, string> = {
      administrador: 'Administrador',
      jefe_inmediato: 'Jefe inmediato',
      maxima_autoridad: 'Máxima autoridad',
      analista_tics: 'Analista TICS'
    };

    return nombres[rol || ''] || 'Sin rol';
  }
}