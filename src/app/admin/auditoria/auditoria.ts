import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import Swal from 'sweetalert2';

import { AuthService } from '../../services/auth.service';

export interface AuditoriaRegistro {
  id: number;
  usuario_id: number | null;
  solicitud_id: number | null;
  usuario?: string | null;
  nombres?: string | null;
  apellidos?: string | null;
  codigo_solicitud?: string | null;
  modulo: string;
  accion: string;
  descripcion: string;
  datos_anteriores?: any;
  datos_nuevos?: any;
  ip_origen: string | null;
  user_agent: string | null;
  created_at: string;
}

@Component({
  selector: 'app-auditoria',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    RouterLinkActive
  ],
  templateUrl: './auditoria.html',
  styleUrl: './auditoria.scss'
})
export class Auditoria implements OnInit {

  private readonly API_BASE = 'http://127.0.0.1:5050/api';
  private readonly API_URL = `${this.API_BASE}/admin/auditoria`;

  registros: AuditoriaRegistro[] = [];
  registrosFiltrados: AuditoriaRegistro[] = [];

  cargando = false;
  error = '';

  textoBusqueda = '';
  filtroModulo = '';
  filtroAccion = '';
  fechaDesde = '';
  fechaHasta = '';

  totalRegistros = 0;
  totalSolicitudes = 0;
  totalUsuarios = 0;
  totalDocumentos = 0;
  totalSistema = 0;

  modulos = [
    { valor: '', texto: 'Todos los módulos' },
    { valor: 'auth', texto: 'Autenticación' },
    { valor: 'solicitudes', texto: 'Solicitudes' },
    { valor: 'documentos', texto: 'Documentos' },
    { valor: 'usuarios', texto: 'Usuarios' },
    { valor: 'reportes', texto: 'Reportes' },
    { valor: 'sistema', texto: 'Sistema' }
  ];

  acciones = [
    { valor: '', texto: 'Todas las acciones' },
    { valor: 'login', texto: 'Inicio de sesión' },
    { valor: 'crear', texto: 'Crear' },
    { valor: 'actualizar', texto: 'Actualizar' },
    { valor: 'eliminar', texto: 'Eliminar' },
    { valor: 'aprobar', texto: 'Aprobar' },
    { valor: 'rechazar', texto: 'Rechazar' },
    { valor: 'subir_documento_firmado', texto: 'Subir documento firmado' },
    { valor: 'descargar_pdf', texto: 'Descargar PDF' },
    { valor: 'cambiar_estado', texto: 'Cambiar estado' }
  ];

  registroSeleccionado: AuditoriaRegistro | null = null;
  mostrarModalDetalle = false;

  constructor(
    private http: HttpClient,
    private router: Router,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.cargarAuditoria();
  }

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('auth_token_liberacion_web') || '';

    return new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
  }

  cargarAuditoria(): void {
    this.cargando = true;
    this.error = '';

    this.http.get<any>(
      this.API_URL,
      {
        headers: this.getHeaders()
      }
    ).subscribe({
      next: (response) => {
        this.cargando = false;
        this.registros = response.auditoria || response.registros || [];
        this.aplicarFiltros();
      },
      error: (err) => {
        this.cargando = false;

        if (err.status === 401 || err.status === 403) {
          this.authService.logout();
          this.router.navigate(['/auth/login']);
          return;
        }

        this.error = err.error?.mensaje || 'No se pudo cargar la auditoría del sistema.';
      }
    });
  }

  aplicarFiltros(): void {
    const busqueda = this.textoBusqueda.trim().toLowerCase();

    this.registrosFiltrados = this.registros.filter((registro) => {
      const coincideModulo = this.filtroModulo
        ? registro.modulo === this.filtroModulo
        : true;

      const coincideAccion = this.filtroAccion
        ? registro.accion === this.filtroAccion
        : true;

      const coincideBusqueda = busqueda
        ? this.obtenerTextoBusqueda(registro).includes(busqueda)
        : true;

      const coincideFecha = this.validarRangoFecha(registro.created_at);

      return coincideModulo && coincideAccion && coincideBusqueda && coincideFecha;
    });

    this.calcularResumen();
  }

  obtenerTextoBusqueda(registro: AuditoriaRegistro): string {
    return `
      ${registro.id}
      ${registro.usuario_id || ''}
      ${registro.solicitud_id || ''}
      ${registro.usuario || ''}
      ${registro.nombres || ''}
      ${registro.apellidos || ''}
      ${registro.codigo_solicitud || ''}
      ${registro.modulo || ''}
      ${registro.accion || ''}
      ${registro.descripcion || ''}
      ${registro.ip_origen || ''}
      ${registro.created_at || ''}
    `.toLowerCase();
  }

  validarRangoFecha(fechaRegistro: string): boolean {
    if (!this.fechaDesde && !this.fechaHasta) {
      return true;
    }

    const fecha = this.normalizarFecha(fechaRegistro);

    if (!fecha) {
      return true;
    }

    if (this.fechaDesde && fecha < this.fechaDesde) {
      return false;
    }

    if (this.fechaHasta && fecha > this.fechaHasta) {
      return false;
    }

    return true;
  }

  normalizarFecha(fecha: string): string {
    if (!fecha) {
      return '';
    }

    return String(fecha).slice(0, 10);
  }

  calcularResumen(): void {
    this.totalRegistros = this.registrosFiltrados.length;

    this.totalSolicitudes = this.registrosFiltrados.filter((registro) =>
      registro.modulo === 'solicitudes'
    ).length;

    this.totalUsuarios = this.registrosFiltrados.filter((registro) =>
      registro.modulo === 'usuarios'
    ).length;

    this.totalDocumentos = this.registrosFiltrados.filter((registro) =>
      registro.modulo === 'documentos'
    ).length;

    this.totalSistema = this.registrosFiltrados.filter((registro) =>
      registro.modulo === 'sistema' || registro.modulo === 'auth'
    ).length;
  }

  limpiarFiltros(): void {
    this.textoBusqueda = '';
    this.filtroModulo = '';
    this.filtroAccion = '';
    this.fechaDesde = '';
    this.fechaHasta = '';
    this.aplicarFiltros();
  }

  abrirDetalle(registro: AuditoriaRegistro): void {
    this.registroSeleccionado = registro;
    this.mostrarModalDetalle = true;
  }

  cerrarDetalle(): void {
    this.registroSeleccionado = null;
    this.mostrarModalDetalle = false;
  }

  exportarCsv(): void {
    if (this.registrosFiltrados.length === 0) {
      Swal.fire({
        title: 'Sin datos',
        text: 'No existen registros para exportar.',
        icon: 'warning',
        confirmButtonText: 'Entendido',
        confirmButtonColor: '#d97706'
      });
      return;
    }

    const encabezados = [
      'ID',
      'Usuario ID',
      'Usuario',
      'Solicitud ID',
      'Código solicitud',
      'Módulo',
      'Acción',
      'Descripción',
      'IP origen',
      'Fecha'
    ];

    const filas = this.registrosFiltrados.map((registro) => [
      String(registro.id),
      String(registro.usuario_id || ''),
      this.getUsuarioTexto(registro),
      String(registro.solicitud_id || ''),
      String(registro.codigo_solicitud || ''),
      this.getModuloTexto(registro.modulo),
      this.getAccionTexto(registro.accion),
      registro.descripcion || '',
      registro.ip_origen || '',
      registro.created_at || ''
    ]);

    const contenido = [
      encabezados,
      ...filas
    ]
      .map((fila) => fila.map((valor) => this.escaparCsv(valor)).join(';'))
      .join('\n');

    const blob = new Blob(['\ufeff' + contenido], {
      type: 'text/csv;charset=utf-8;'
    });

    const url = window.URL.createObjectURL(blob);
    const enlace = document.createElement('a');

    const fechaActual = new Date().toISOString().slice(0, 10);

    enlace.href = url;
    enlace.download = `auditoria-inamhi-${fechaActual}.csv`;
    enlace.click();

    window.URL.revokeObjectURL(url);
  }

  escaparCsv(valor: string): string {
    const texto = String(valor || '').replace(/"/g, '""');
    return `"${texto}"`;
  }

  imprimirAuditoria(): void {
    window.print();
  }

  getUsuarioTexto(registro: AuditoriaRegistro): string {
    const nombres = `${registro.nombres || ''} ${registro.apellidos || ''}`.trim();

    if (nombres) {
      return nombres;
    }

    if (registro.usuario) {
      return registro.usuario;
    }

    if (registro.usuario_id) {
      return `Usuario ID ${registro.usuario_id}`;
    }

    return 'Sistema / Público';
  }

  getModuloTexto(modulo: string): string {
    const modulos: Record<string, string> = {
      auth: 'Autenticación',
      solicitudes: 'Solicitudes',
      documentos: 'Documentos',
      usuarios: 'Usuarios',
      reportes: 'Reportes',
      sistema: 'Sistema'
    };

    return modulos[modulo] || modulo;
  }

  getAccionTexto(accion: string): string {
    const acciones: Record<string, string> = {
      login: 'Inicio de sesión',
      crear: 'Crear',
      actualizar: 'Actualizar',
      eliminar: 'Eliminar',
      aprobar: 'Aprobar',
      rechazar: 'Rechazar',
      subir_documento_firmado: 'Subir documento firmado',
      descargar_pdf: 'Descargar PDF',
      cambiar_estado: 'Cambiar estado'
    };

    return acciones[accion] || accion;
  }

  getModuloClase(modulo: string): string {
    const clases: Record<string, string> = {
      auth: 'auth',
      solicitudes: 'solicitudes',
      documentos: 'documentos',
      usuarios: 'usuarios',
      reportes: 'reportes',
      sistema: 'sistema'
    };

    return clases[modulo] || 'normal';
  }

  getAccionClase(accion: string): string {
    if (accion.includes('aprobar')) {
      return 'aprobar';
    }

    if (accion.includes('rechazar')) {
      return 'rechazar';
    }

    if (accion.includes('crear') || accion.includes('subir')) {
      return 'crear';
    }

    if (accion.includes('actualizar') || accion.includes('cambiar')) {
      return 'actualizar';
    }

    if (accion.includes('eliminar')) {
      return 'eliminar';
    }

    if (accion.includes('login')) {
      return 'login';
    }

    return 'normal';
  }

  formatearJson(valor: any): string {
    if (!valor) {
      return 'Sin datos';
    }

    try {
      if (typeof valor === 'string') {
        return JSON.stringify(JSON.parse(valor), null, 2);
      }

      return JSON.stringify(valor, null, 2);
    } catch {
      return String(valor);
    }
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }
}