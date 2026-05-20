import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule, HttpHeaders } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

import { AuthService, UsuarioLogin } from '../../services/auth.service';

type VistaAdmin = 'manuales' | 'electronicos';

interface RespuestaManualAdmin {
  estado: string;
  mensaje: string;
  total: number;
  solicitudes: ProcesoManualAdmin[];
}

interface ProcesoManualAdmin {
  id: number;
  uuid_solicitud: string;
  nombres: string;
  apellidos: string;
  correo: string;
  estado: 'DESCARGADO' | 'PENDIENTE_SUBIDA' | 'FINALIZADO' | string;
  documento_vacio: string | null;
  documento_escaneado: string | null;
  fecha_registro: string | null;
  hora_registro: string | null;
  created_at: string | null;
  updated_at: string | null;
  log_auditoria?: string;
  tiene_documento_firmado?: boolean;
}

interface RespuestaElectronicaAdmin {
  estado: string;
  mensaje: string;
  total: number;
  solicitudes: ProcesoElectronicoAdmin[];
}

interface ProcesoElectronicoAdmin {
  id: number;
  codigo_solicitud: string;
  nombres_completos: string;
  cedula: string;
  correo_institucional: string;
  telefono_ext?: string;
  dependencia: string;
  area_unidad: string;
  cargo: string;
  fecha_solicitud: string | null;
  tipo_usuario?: string;
  direccion_ip?: string | null;
  tiempo_vigencia_acceso?: string;
  justificacion_necesidad_institucional?: string;
  estado: string;
  etapa_actual: string;
  bloqueada?: boolean;
  created_at: string | null;
  updated_at: string | null;
  total_documentos?: number;
  ultimo_documento?: string | null;
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    HttpClientModule,
    RouterLink,
    RouterLinkActive
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class AdminDashboard implements OnInit {

  /*
    LOCAL:
    http://localhost:5050/api

    SERVIDOR CON NGINX:
    /api
  */
  private readonly API_URL = 'http://localhost:5050/api';

  usuario: UsuarioLogin | null = null;

  vistaActiva: VistaAdmin = 'electronicos';

  cargando = false;
  error = '';

  busqueda = '';
  filtroEstado = '';
  filtroEtapa = '';

  procesosManuales: ProcesoManualAdmin[] = [];
  procesosElectronicos: ProcesoElectronicoAdmin[] = [];

  totalManuales = 0;
  totalManualesPendientes = 0;
  totalManualesFinalizados = 0;

  totalElectronicos = 0;
  totalElectronicosPendientes = 0;
  totalElectronicosRechazados = 0;
  totalElectronicosFinalizados = 0;

  descargando = false;

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.usuario = this.authService.getUsuario();
    this.cargarVistaActiva();
  }

  // =====================================================
  // HEADERS / SEGURIDAD
  // =====================================================

  private obtenerHeaders(): HttpHeaders {
    const token = this.authService.getToken();

    return new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
  }

  private manejarErrorAutenticacion(err: any): boolean {
    if (err.status === 401 || err.status === 403) {
      this.authService.logout();
      this.router.navigate(['/auth/login']);
      return true;
    }

    return false;
  }

  // =====================================================
  // CAMBIO DE VISTA
  // =====================================================

  cambiarVista(vista: VistaAdmin): void {
    if (this.vistaActiva === vista) {
      return;
    }

    this.vistaActiva = vista;
    this.busqueda = '';
    this.filtroEstado = '';
    this.filtroEtapa = '';
    this.error = '';
    this.cargarVistaActiva();
  }

  cargarVistaActiva(): void {
    if (this.vistaActiva === 'manuales') {
      this.cargarProcesosManuales();
      return;
    }

    this.cargarProcesosElectronicos();
  }

  buscar(): void {
    this.cargarVistaActiva();
  }

  limpiarFiltros(): void {
    this.busqueda = '';
    this.filtroEstado = '';
    this.filtroEtapa = '';
    this.cargarVistaActiva();
  }

  // =====================================================
  // PROCESOS MANUALES
  // =====================================================

  cargarProcesosManuales(): void {
    this.cargando = true;
    this.error = '';

    const params: string[] = [];

    if (this.busqueda.trim()) {
      params.push(`q=${encodeURIComponent(this.busqueda.trim())}`);
    }

    if (this.filtroEstado.trim()) {
      params.push(`estado=${encodeURIComponent(this.filtroEstado.trim())}`);
    }

    const query = params.length ? `?${params.join('&')}` : '';

    this.http.get<RespuestaManualAdmin>(
      `${this.API_URL}/admin/manuales${query}`,
      {
        headers: this.obtenerHeaders()
      }
    ).subscribe({
      next: (response) => {
        this.cargando = false;

        if (response.estado !== 'ok') {
          this.error = response.mensaje || 'No se pudieron cargar los procesos manuales.';
          return;
        }

        this.procesosManuales = response.solicitudes || [];
        this.calcularEstadisticasManuales();
      },
      error: (err) => {
        this.cargando = false;

        if (this.manejarErrorAutenticacion(err)) {
          return;
        }

        this.error = err.error?.mensaje || 'No se pudieron cargar los procesos manuales.';
      }
    });
  }

  calcularEstadisticasManuales(): void {
    this.totalManuales = this.procesosManuales.length;

    this.totalManualesPendientes = this.procesosManuales.filter((item) =>
      item.estado === 'PENDIENTE_SUBIDA' || item.estado === 'DESCARGADO'
    ).length;

    this.totalManualesFinalizados = this.procesosManuales.filter((item) =>
      item.estado === 'FINALIZADO'
    ).length;
  }

  descargarManualVacio(item: ProcesoManualAdmin): void {
    if (!item?.uuid_solicitud) {
      return;
    }

    this.descargarArchivoProtegido(
      `${this.API_URL}/manual/${item.uuid_solicitud}/descargar`,
      `formato_manual_${item.uuid_solicitud}.pdf`
    );
  }

  descargarManualFirmado(item: ProcesoManualAdmin): void {
    if (!item?.uuid_solicitud) {
      return;
    }

    if (item.estado !== 'FINALIZADO' || !item.documento_escaneado) {
      this.error = 'Este proceso manual todavía no tiene documento firmado subido.';
      return;
    }

    this.descargarArchivoProtegido(
      `${this.API_URL}/admin/manuales/${item.uuid_solicitud}/descargar-firmado`,
      `documento_manual_firmado_${item.uuid_solicitud}.pdf`
    );
  }

  // =====================================================
  // PROCESOS ELECTRÓNICOS
  // =====================================================

  cargarProcesosElectronicos(): void {
    this.cargando = true;
    this.error = '';

    const params: string[] = [];

    if (this.busqueda.trim()) {
      params.push(`q=${encodeURIComponent(this.busqueda.trim())}`);
    }

    if (this.filtroEstado.trim()) {
      params.push(`estado=${encodeURIComponent(this.filtroEstado.trim())}`);
    }

    if (this.filtroEtapa.trim()) {
      params.push(`etapa=${encodeURIComponent(this.filtroEtapa.trim())}`);
    }

    const query = params.length ? `?${params.join('&')}` : '';

    /*
      Endpoint recomendado para el nuevo admin revisor:
      GET /api/admin/procesos-electronicos

      Si aún no lo tienes en Flask, créalo después.
    */
    this.http.get<RespuestaElectronicaAdmin>(
      `${this.API_URL}/admin/procesos-electronicos${query}`,
      {
        headers: this.obtenerHeaders()
      }
    ).subscribe({
      next: (response) => {
        this.cargando = false;

        if (response.estado !== 'ok') {
          this.error = response.mensaje || 'No se pudieron cargar los procesos electrónicos.';
          return;
        }

        this.procesosElectronicos = response.solicitudes || [];
        this.calcularEstadisticasElectronicos();
      },
      error: (err) => {
        this.cargando = false;

        if (this.manejarErrorAutenticacion(err)) {
          return;
        }

        this.error = err.error?.mensaje || 'No se pudieron cargar los procesos electrónicos.';
      }
    });
  }

  calcularEstadisticasElectronicos(): void {
    this.totalElectronicos = this.procesosElectronicos.length;

    this.totalElectronicosPendientes = this.procesosElectronicos.filter((item) =>
      item.estado.includes('pendiente')
    ).length;

    this.totalElectronicosRechazados = this.procesosElectronicos.filter((item) =>
      item.estado.includes('rechazada')
    ).length;

    this.totalElectronicosFinalizados = this.procesosElectronicos.filter((item) =>
      item.estado === 'finalizada'
    ).length;
  }

  descargarElectronicoActual(item: ProcesoElectronicoAdmin): void {
    if (!item?.codigo_solicitud) {
      return;
    }

    /*
      Endpoint recomendado:
      GET /api/admin/procesos-electronicos/<codigo_solicitud>/pdf-actual
    */
    this.descargarArchivoProtegido(
      `${this.API_URL}/admin/procesos-electronicos/${item.codigo_solicitud}/pdf-actual`,
      `documento_actual_${item.codigo_solicitud}.pdf`
    );
  }

  verDetalleElectronico(item: ProcesoElectronicoAdmin): void {
    if (!item?.codigo_solicitud) {
      return;
    }

    /*
      Más adelante podemos crear una vista completa de detalle.
      Por ahora redirecciona al detalle administrativo si ya existe.
    */
    this.router.navigate(['/admin/solicitudes', item.id]);
  }

  // =====================================================
  // DESCARGAS
  // =====================================================

  descargarArchivoProtegido(url: string, nombreArchivo: string): void {
    this.error = '';
    this.descargando = true;

    this.http.get(url, {
      headers: this.obtenerHeaders(),
      responseType: 'blob'
    }).subscribe({
      next: (blob) => {
        this.descargando = false;

        const archivoUrl = URL.createObjectURL(blob);
        const enlace = document.createElement('a');

        enlace.href = archivoUrl;
        enlace.download = nombreArchivo;
        enlace.target = '_blank';

        document.body.appendChild(enlace);
        enlace.click();
        document.body.removeChild(enlace);

        URL.revokeObjectURL(archivoUrl);
      },
      error: (err) => {
        this.descargando = false;

        if (this.manejarErrorAutenticacion(err)) {
          return;
        }

        this.error = err.error?.mensaje || 'No se pudo descargar el documento.';
      }
    });
  }

  // =====================================================
  // FECHAS
  // =====================================================

  obtenerFechaTabla(fecha: string | null | undefined): string {
    if (!fecha) {
      return 'Sin fecha';
    }

    const valor = String(fecha).trim();

    if (!valor) {
      return 'Sin fecha';
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
      const [anio, mes, dia] = valor.split('-');
      return `${dia}/${mes}/${anio}`;
    }

    const valorCompatible = valor.includes('T')
      ? valor
      : valor.replace(' ', 'T');

    const fechaObj = new Date(valorCompatible);

    if (Number.isNaN(fechaObj.getTime())) {
      return valor;
    }

    return fechaObj.toLocaleDateString('es-EC', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }

  obtenerHoraTabla(fecha: string | null | undefined): string {
    if (!fecha) {
      return 'Sin hora registrada';
    }

    const valor = String(fecha).trim();

    if (!valor) {
      return 'Sin hora registrada';
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
      return 'Sin hora registrada';
    }

    if (
      valor.endsWith('00:00:00') ||
      valor.includes('T00:00:00') ||
      valor.includes(' 00:00:00')
    ) {
      return 'Sin hora registrada';
    }

    const valorCompatible = valor.includes('T')
      ? valor
      : valor.replace(' ', 'T');

    const fechaObj = new Date(valorCompatible);

    if (Number.isNaN(fechaObj.getTime())) {
      return 'Sin hora registrada';
    }

    const hora = fechaObj.toLocaleTimeString('es-EC', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    if (hora === '00:00:00') {
      return 'Sin hora registrada';
    }

    return hora;
  }

  obtenerFechaManual(item: ProcesoManualAdmin): string {
    return item.fecha_registro || item.created_at || '';
  }

  obtenerHoraManual(item: ProcesoManualAdmin): string {
    if (item.hora_registro) {
      return item.hora_registro;
    }

    return this.obtenerHoraTabla(item.created_at);
  }

  obtenerFechaElectronica(item: ProcesoElectronicoAdmin): string {
    return item.created_at || item.fecha_solicitud || '';
  }

  // =====================================================
  // TEXTOS DE ESTADO / ETAPA
  // =====================================================

  getEstadoManualTexto(estado: string): string {
    const estados: Record<string, string> = {
      DESCARGADO: 'Documento descargado',
      PENDIENTE_SUBIDA: 'Pendiente de subir firmado',
      FINALIZADO: 'Finalizado'
    };

    return estados[estado] || estado;
  }

  getEstadoManualClase(estado: string): string {
    if (estado === 'FINALIZADO') {
      return 'finalizada';
    }

    return 'pendiente';
  }

  getEstadoElectronicoTexto(estado: string): string {
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

  getEstadoElectronicoClase(estado: string): string {
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

  getEtapaElectronicaTexto(etapa: string): string {
    const etapas: Record<string, string> = {
      registro_publico: 'Registro público',
      firma_solicitante: 'Firma del solicitante',
      jefe_inmediato: 'Jefe inmediato',
      maxima_autoridad: 'Máxima autoridad',
      tics: 'Validación TICS',
      ejecucion_tics: 'Ejecución TICS',
      finalizado: 'Finalizado'
    };

    return etapas[etapa] || etapa;
  }

  getDescripcionUbicacionProceso(item: ProcesoElectronicoAdmin): string {
    if (!item) {
      return 'Sin información';
    }

    if (item.estado === 'finalizada') {
      return 'Proceso finalizado correctamente.';
    }

    if (item.estado.includes('rechazada')) {
      return 'Proceso rechazado. Revise el detalle del trámite.';
    }

    const mapa: Record<string, string> = {
      firma_solicitante: 'Aún falta que el solicitante suba el PDF firmado.',
      jefe_inmediato: 'Está pendiente de revisión del jefe inmediato.',
      maxima_autoridad: 'Está pendiente de revisión de máxima autoridad.',
      tics: 'Está pendiente de validación por TICS.',
      ejecucion_tics: 'Está pendiente de ejecución técnica por TICS.',
      finalizado: 'Proceso finalizado.'
    };

    return mapa[item.etapa_actual] || 'Proceso en revisión institucional.';
  }

  // =====================================================
  // SESIÓN
  // =====================================================

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }
}