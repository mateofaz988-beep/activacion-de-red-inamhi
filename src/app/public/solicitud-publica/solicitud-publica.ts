import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { RouterLink } from '@angular/router';

interface Direccion {
  id: number;
  nombre: string;
  descripcion?: string | null;
  estado?: string;
}

interface Area {
  id: number;
  direccion_id: number;
  nombre: string;
  siglas?: string | null;
  descripcion?: string | null;
  estado?: string;
}

interface Cargo {
  id: number;
  area_id: number;
  nombre: string;
  descripcion?: string | null;
  estado?: string;
}

interface JefeAsignado {
  id?: number;
  usuario_id?: number | null;
  area_id?: number;
  nombres: string;
  apellidos?: string | null;
  correo?: string | null;
  cargo: string;
  tipo_responsable?: string;
}

interface CatalogoResponse<T> {
  estado: string;
  mensaje?: string;
  data?: T[];
  direcciones?: T[];
  areas?: T[];
  cargos?: T[];
}

interface JefeResponse {
  estado: string;
  mensaje?: string;
  jefe?: JefeAsignado | null;
}

interface PrepararFirmaResponse {
  estado: string;
  mensaje: string;
  codigo_solicitud?: string;
  solicitud?: {
    id?: number;
    codigo_solicitud: string;
    estado?: string;
    etapa_actual?: string;
  };
  url_descarga?: string;
}


import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-solicitud-publica',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    HttpClientModule,
    RouterLink
  ],
  templateUrl: './solicitud-publica.html',
  styleUrl: './solicitud-publica.scss'
})
export class SolicitudPublica implements OnInit {

  /*

    /api
  */
  private readonly API_BASE = environment.apiUrl;

  private readonly API_PREPARAR_ELECTRONICO =
    `${this.API_BASE}/public/electronico/preparar`;

  formulario!: FormGroup;

  cargando = false;
  enviado = false;
  errorGeneral = '';
  codigoGenerado = '';

  mostrarModalIp = false;

  // =====================================================
  // MODAL FIRMA DIGITAL (pyHanko)
  // =====================================================

  mostrarModalFirmaEc   = false;   // nombre mantenido para compatibilidad HTML
  preparandoFirmaEc     = false;   // generando la solicitud en BD
  subiendoFirmaEc       = false;   // (no usado en pyHanko, solo compatibilidad)

  mostrarToastEnviado   = false;
  mostrarConfirmEnvio   = false;   // no se usa en el nuevo flujo

  codigoFirmaEc         = '';
  urlDescargaFirmaEc    = '';      // mantenido para compatibilidad

  // pyHanko — certificado del solicitante
  certificadoPublico       : File | null = null;
  nombreCertificadoPublico = '';
  passwordCertificado      = '';
  mostrarPassword          = false;
  observacionFirma         = '';
  validandoCertificado     = false;
  firmandoDocumento        = false;
  infoCertificado          : any = null;
  certificadoValidado      = false;
  errorCertificado         = '';

  pasoFirma: 'preparando' | 'cert' | 'firmando' | 'finalizado' = 'preparando';

  // compat — campos de FirmaEC ya no usados
  archivoFirmado       : File | null = null;
  nombreArchivoFirmado = '';
  urlVistaPreviaFirmado= '';
  errorFirmaEc         = '';
  exitoFirmaEc         = '';
  pasoFirmaEc: 'generando'|'descarga'|'subida'|'finalizado' = 'generando';

  // =====================================================
  // CATÁLOGOS ORGANIZACIONALES
  // Dirección → Área → Cargo → Jefe asignado
  // =====================================================

  direcciones: Direccion[] = [];
  areas: Area[] = [];
  cargos: Cargo[] = [];

  jefeAsignado: JefeAsignado | null = null;

  nombreDireccionSeleccionada = '';
  nombreAreaSeleccionada = '';
  nombreCargoSeleccionado = '';

  cargandoDirecciones = false;
  cargandoAreas = false;
  cargandoCargos = false;
  cargandoJefe = false;

  constructor(
    private fb: FormBuilder,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    this.crearFormulario();
    this.cargarDirecciones();
  }

  // =====================================================
  // FECHA ACTUAL
  // =====================================================

  get fechaHoyTexto(): string {
    return new Date().toLocaleDateString('es-EC', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  }

  // =====================================================
  // FORMULARIO
  // =====================================================

  crearFormulario(): void {
    const fechaActual = new Date().toISOString().slice(0, 10);

    this.formulario = this.fb.group({
      nombres_completos: [
        '',
        [
          Validators.required,
          Validators.minLength(5),
          Validators.maxLength(200)
        ]
      ],
      cedula: [
        '',
        [
          Validators.required,
          Validators.pattern(/^[0-9]{10}$/)
        ]
      ],
      correo_institucional: [
        '',
        [
          Validators.required,
          Validators.email,
          Validators.maxLength(150)
        ]
      ],
      telefono_ext: [
        '',
        [
          Validators.required,
          Validators.pattern(/^[0-9]{10}$/)
        ]
      ],

      // =====================================================
      // NUEVOS CAMPOS POR CATÁLOGO SQL
      // =====================================================

      direccion_id: [
        '',
        [
          Validators.required
        ]
      ],
      area_id: [
        '',
        [
          Validators.required
        ]
      ],
      cargo_id: [
        '',
        [
          Validators.required
        ]
      ],

      fecha_solicitud: [
        fechaActual,
        [
          Validators.required
        ]
      ],
      tipo_usuario: [
        'funcionario_inamhi',
        [
          Validators.required
        ]
      ],
      nombre_usuario_externo: [
        '',
        [
          Validators.maxLength(200)
        ]
      ],
      direccion_ip: [
        '',
        [
          Validators.maxLength(15),
          Validators.pattern(/^$|^((25[0-5]|2[0-4][0-9]|1?[0-9]{1,2})\.){3}(25[0-5]|2[0-4][0-9]|1?[0-9]{1,2})$/)
        ]
      ],
      tiempo_vigencia_acceso: [
        '',
        [
          Validators.required
        ]
      ],
      justificacion_necesidad_institucional: [
        '',
        [
          Validators.required,
          Validators.minLength(20),
          Validators.maxLength(2000)
        ]
      ],
      paginas_web: this.fb.array([
        this.crearPaginaWeb()
      ])
    });

    this.formulario.get('tipo_usuario')?.valueChanges.subscribe((valor) => {
      this.actualizarValidacionUsuarioExterno(valor);
    });
  }

  crearPaginaWeb(): FormGroup {
    return this.fb.group({
      url_pagina: [
        '',
        [
          Validators.required,
          Validators.maxLength(255)
        ]
      ],
      descripcion: [
        '',
        [
          Validators.maxLength(255)
        ]
      ]
    });
  }

  get paginasWeb(): FormArray {
    return this.formulario.get('paginas_web') as FormArray;
  }

  // =====================================================
  // CATÁLOGOS: DIRECCIONES, ÁREAS, CARGOS Y JEFE
  // =====================================================

  cargarDirecciones(): void {
    this.cargandoDirecciones = true;
    this.errorGeneral = '';

    this.http.get<CatalogoResponse<Direccion>>(`${this.API_BASE}/public/catalogos/direcciones`)
      .subscribe({
        next: (response) => {
          this.cargandoDirecciones = false;

          if (response.estado !== 'ok') {
            this.errorGeneral = response.mensaje || 'No se pudieron cargar las direcciones.';
            return;
          }

          this.direcciones = response.direcciones || response.data || [];
        },
        error: (err) => {
          this.cargandoDirecciones = false;

          if (err.status === 0) {
            this.errorGeneral = 'No se pudo conectar con el servidor para cargar las direcciones.';
            return;
          }

          this.errorGeneral =
            err.error?.mensaje ||
            'No se pudieron cargar las direcciones institucionales.';
        }
      });
  }

  onDireccionSeleccionada(): void {
    const direccionId = Number(this.formulario.get('direccion_id')?.value || 0);

    this.areas = [];
    this.cargos = [];
    this.jefeAsignado = null;

    this.nombreDireccionSeleccionada = '';
    this.nombreAreaSeleccionada = '';
    this.nombreCargoSeleccionado = '';

    this.formulario.patchValue({
      area_id: '',
      cargo_id: ''
    });

    const direccion = this.direcciones.find((item) => Number(item.id) === direccionId);
    this.nombreDireccionSeleccionada = direccion?.nombre || '';

    if (!direccionId) {
      return;
    }

    this.cargarAreasPorDireccion(direccionId);
  }

  cargarAreasPorDireccion(direccionId: number): void {
    this.cargandoAreas = true;
    this.errorGeneral = '';

    this.http.get<CatalogoResponse<Area>>(
      `${this.API_BASE}/public/catalogos/direcciones/${direccionId}/areas`
    ).subscribe({
      next: (response) => {
        this.cargandoAreas = false;

        if (response.estado !== 'ok') {
          this.errorGeneral = response.mensaje || 'No se pudieron cargar las áreas.';
          return;
        }

        this.areas = response.areas || response.data || [];
      },
      error: (err) => {
        this.cargandoAreas = false;

        if (err.status === 0) {
          this.errorGeneral = 'No se pudo conectar con el servidor para cargar las áreas.';
          return;
        }

        this.errorGeneral =
          err.error?.mensaje ||
          'No se pudieron cargar las áreas de la dirección seleccionada.';
      }
    });
  }

  onAreaSeleccionada(): void {
    const areaId = Number(this.formulario.get('area_id')?.value || 0);

    this.cargos = [];
    this.jefeAsignado = null;

    this.nombreAreaSeleccionada = '';
    this.nombreCargoSeleccionado = '';

    this.formulario.patchValue({
      cargo_id: ''
    });

    const area = this.areas.find((item) => Number(item.id) === areaId);
    this.nombreAreaSeleccionada = area?.nombre || '';

    if (!areaId) {
      return;
    }

    this.cargarCargosPorArea(areaId);
    this.cargarJefePorArea(areaId);
  }

  cargarCargosPorArea(areaId: number): void {
    this.cargandoCargos = true;
    this.errorGeneral = '';

    this.http.get<CatalogoResponse<Cargo>>(
      `${this.API_BASE}/public/catalogos/areas/${areaId}/cargos`
    ).subscribe({
      next: (response) => {
        this.cargandoCargos = false;

        if (response.estado !== 'ok') {
          this.errorGeneral = response.mensaje || 'No se pudieron cargar los cargos.';
          return;
        }

        this.cargos = response.cargos || response.data || [];
      },
      error: (err) => {
        this.cargandoCargos = false;

        if (err.status === 0) {
          this.errorGeneral = 'No se pudo conectar con el servidor para cargar los cargos.';
          return;
        }

        this.errorGeneral =
          err.error?.mensaje ||
          'No se pudieron cargar los cargos del área seleccionada.';
      }
    });
  }

  cargarJefePorArea(areaId: number): void {
    this.cargandoJefe = true;
    this.errorGeneral = '';

    this.http.get<JefeResponse>(
      `${this.API_BASE}/public/catalogos/areas/${areaId}/jefe`
    ).subscribe({
      next: (response) => {
        this.cargandoJefe = false;

        if (response.estado !== 'ok') {
          this.jefeAsignado = null;
          this.errorGeneral = response.mensaje || 'No existe jefe configurado para el área seleccionada.';
          return;
        }

        this.jefeAsignado = response.jefe || null;

        if (!this.jefeAsignado) {
          this.errorGeneral = 'No existe jefe configurado para el área seleccionada.';
        }
      },
      error: (err) => {
        this.cargandoJefe = false;
        this.jefeAsignado = null;

        if (err.status === 0) {
          this.errorGeneral = 'No se pudo conectar con el servidor para cargar el jefe asignado.';
          return;
        }

        this.errorGeneral =
          err.error?.mensaje ||
          'No se pudo obtener el jefe asignado del área seleccionada.';
      }
    });
  }

  onCargoSeleccionado(): void {
    const cargoId = Number(this.formulario.get('cargo_id')?.value || 0);
    const cargo = this.cargos.find((item) => Number(item.id) === cargoId);

    this.nombreCargoSeleccionado = cargo?.nombre || '';
  }
    // =====================================================
  // MODAL IP
  // =====================================================

  abrirModalIp(): void {
    this.mostrarModalIp = true;
  }

  cerrarModalIp(): void {
    this.mostrarModalIp = false;
  }

  // =====================================================
  // URL BACKEND
  // =====================================================

  normalizarUrlBackend(url: string): string {
    if (!url) {
      return '';
    }

    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    const baseSinApi = this.API_BASE.replace('/api', '');

    if (url.startsWith('/api')) {
      return `${baseSinApi}${url}`;
    }

    if (url.startsWith('/')) {
      return `${baseSinApi}${url}`;
    }

    return `${this.API_BASE}/${url}`;
  }

  // =====================================================
  // MODAL FIRMAEC ASISTIDO
  // =====================================================

  // =====================================================
  // ABRIR / CERRAR MODAL FIRMA DIGITAL
  // =====================================================

  abrirModalFirmaEc(): void {
    this.errorGeneral    = '';
    this.errorCertificado = '';

    if (this.formulario.invalid) {
      this.marcarFormularioComoTocado();
      this.errorGeneral = 'Revise los campos marcados antes de continuar.';
      return;
    }

    if (!this.jefeAsignado) {
      this.errorGeneral = 'No existe un jefe asignado para el área seleccionada. No se puede continuar.';
      return;
    }

    if (this.paginasWeb.length < 1) {
      this.errorGeneral = 'Debe ingresar al menos una página web.';
      return;
    }

    this.mostrarModalFirmaEc = true;
    this.pasoFirma = 'preparando';

    if (!this.codigoFirmaEc) {
      this.generarSolicitudParaFirma();
    } else {
      this.pasoFirma = 'cert';
    }
  }

  cerrarModalFirmaEc(): void {
    if (this.preparandoFirmaEc || this.firmandoDocumento || this.validandoCertificado) {
      return;
    }
    this.mostrarModalFirmaEc  = false;
    this.errorCertificado     = '';
    this.errorFirmaEc         = '';
    this.infoCertificado      = null;
    this.certificadoValidado  = false;
  }

  // =====================================================
  // PASO 1: GENERAR SOLICITUD EN BD (sin PDF que descargar)
  // =====================================================

  generarSolicitudParaFirma(): void {
    this.errorCertificado = '';
    this.pasoFirma        = 'preparando';
    this.preparandoFirmaEc = true;

    const payload = this.construirPayload();

    this.http.post<PrepararFirmaResponse>(this.API_PREPARAR_ELECTRONICO, payload)
      .subscribe({
        next: (response) => {
          this.preparandoFirmaEc = false;

          if (response.estado !== 'ok') {
            this.errorCertificado = response.mensaje || 'No se pudo registrar la solicitud.';
            return;
          }

          this.codigoFirmaEc =
            response.codigo_solicitud ||
            response.solicitud?.codigo_solicitud || '';

          if (!this.codigoFirmaEc) {
            this.errorCertificado = 'El servidor no devolvió el código de solicitud.';
            return;
          }

          this.codigoGenerado = this.codigoFirmaEc;
          this.pasoFirma = 'cert';
        },
        error: (err) => {
          this.preparandoFirmaEc = false;

          if (err.status === 0) {
            this.errorCertificado = 'No se pudo conectar con el servidor.';
            return;
          }

          const errores = err.error?.errores;
          if (errores && typeof errores === 'object') {
            this.errorCertificado = Object.entries(errores).map(([k, v]) => `${k}: ${v}`).join(' | ');
          } else {
            this.errorCertificado = err.error?.mensaje || 'Error al registrar la solicitud.';
          }
        }
      });
  }

  // =====================================================
  // SELECCIÓN DEL CERTIFICADO .p12/.pfx
  // =====================================================

  seleccionarCertificadoPublico(event: Event): void {
    this.errorCertificado    = '';
    this.infoCertificado     = null;
    this.certificadoValidado = false;

    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) { return; }

    const archivo = input.files[0];
    const nombre  = archivo.name.toLowerCase();

    if (!nombre.endsWith('.p12') && !nombre.endsWith('.pfx')) {
      this.errorCertificado = 'Solo se aceptan archivos .p12 o .pfx.';
      input.value = '';
      return;
    }

    if (archivo.size > 5 * 1024 * 1024) {
      this.errorCertificado = 'El certificado no puede superar 5 MB.';
      input.value = '';
      return;
    }

    this.certificadoPublico        = archivo;
    this.nombreCertificadoPublico  = archivo.name;
  }

  toggleMostrarPassword(): void {
    this.mostrarPassword = !this.mostrarPassword;
  }

  // =====================================================
  // VALIDAR CERTIFICADO (opcional, antes de firmar)
  // =====================================================

  validarCertificadoPublico(): void {
    if (!this.certificadoPublico) {
      this.errorCertificado = 'Seleccione un certificado .p12 o .pfx.';
      return;
    }
    if (!this.passwordCertificado.trim()) {
      this.errorCertificado = 'Ingrese la contraseña del certificado.';
      return;
    }
    if (!this.codigoFirmaEc) {
      this.errorCertificado = 'Espere a que se genere el código de solicitud.';
      return;
    }

    this.validandoCertificado = true;
    this.errorCertificado     = '';
    this.infoCertificado      = null;
    this.certificadoValidado  = false;

    const formData = new FormData();
    formData.append('certificado', this.certificadoPublico);
    formData.append('password',    this.passwordCertificado);

    this.http.post<any>(
      `${this.API_BASE}/public/electronico/${this.codigoFirmaEc}/validar-certificado-publico`,
      formData
    ).subscribe({
      next: (res) => {
        this.validandoCertificado = false;
        if (res.estado === 'ok' && res.info) {
          this.infoCertificado    = res.info;
          this.certificadoValidado = true;
        } else {
          this.errorCertificado = res.mensaje || 'Error al validar el certificado.';
        }
      },
      error: (err) => {
        this.validandoCertificado = false;
        this.errorCertificado = err.error?.mensaje || 'No se pudo validar el certificado.';
      }
    });
  }

  // =====================================================
  // FIRMAR COMO SOLICITANTE — pyHanko
  // =====================================================

  firmarComoSolicitante(): void {
    if (!this.certificadoPublico) {
      this.errorCertificado = 'Seleccione un certificado .p12 o .pfx.';
      return;
    }
    if (!this.passwordCertificado.trim()) {
      this.errorCertificado = 'Ingrese la contraseña del certificado.';
      return;
    }
    if (!this.codigoFirmaEc) {
      this.errorCertificado = 'Espere a que se genere el código de solicitud.';
      return;
    }

    this.firmandoDocumento = true;
    this.pasoFirma         = 'firmando';
    this.errorCertificado  = '';

    const formData = new FormData();
    formData.append('certificado',  this.certificadoPublico);
    formData.append('password',     this.passwordCertificado);
    if (this.observacionFirma.trim()) {
      formData.append('observacion', this.observacionFirma.trim());
    }

    this.http.post<any>(
      `${this.API_BASE}/public/electronico/${this.codigoFirmaEc}/firmar-pyhanko-solicitante`,
      formData
    ).subscribe({
      next: (res) => {
        this.firmandoDocumento = false;

        if (res.estado !== 'ok') {
          this.errorCertificado = res.mensaje || 'No se pudo firmar el documento.';
          this.pasoFirma = 'cert';
          return;
        }

        this.pasoFirma    = 'finalizado';
        this.enviado      = true;

        this.formulario.reset();
        this.crearFormulario();
        this.cargarDirecciones();
        this.reiniciarCatalogosSeleccionados();
        this.reiniciarFlujoFirma();

        this.mostrarModalFirmaEc  = false;
        this.mostrarToastEnviado  = true;
        setTimeout(() => { this.mostrarToastEnviado = false; }, 4000);
      },
      error: (err) => {
        this.firmandoDocumento = false;
        this.pasoFirma = 'cert';

        if (err.status === 0) {
          this.errorCertificado = 'No se pudo conectar con el servidor.';
          return;
        }

        this.errorCertificado =
          err.error?.mensaje ||
          err.error?.error ||
          'Error al firmar el documento.';
      }
    });
  }

  reiniciarFlujoFirma(): void {
    this.certificadoPublico       = null;
    this.nombreCertificadoPublico = '';
    this.passwordCertificado      = '';
    this.mostrarPassword          = false;
    this.observacionFirma         = '';
    this.infoCertificado          = null;
    this.certificadoValidado      = false;
    this.errorCertificado         = '';
    this.pasoFirma                = 'preparando';
  }

  // Métodos de compat — ya no usados en el flujo principal
  cancelarConfirmEnvio(): void { this.mostrarConfirmEnvio = false; }
  liberarVistaPreviaFirmado(): void {
    if (this.urlVistaPreviaFirmado) {
      URL.revokeObjectURL(this.urlVistaPreviaFirmado);
      this.urlVistaPreviaFirmado = '';
    }
  }

  confirmarEnvioFirmaEc(): void {
    this.mostrarConfirmEnvio = false;
    /* no-op: el flujo ahora usa firmarComoSolicitante() */
  }
  subirPdfFirmadoFirmaEc(): void { /* no-op */ }
  descargarFormatoFirmaEc(): void {
    if (!this.codigoFirmaEc) { return; }
    const url = `${this.API_BASE}/public/electronico/${this.codigoFirmaEc}/pdf`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }
  reiniciarFlujoFirmaEc(): void {
    this.codigoFirmaEc         = '';
    this.urlDescargaFirmaEc    = '';
    this.errorFirmaEc          = '';
    this.exitoFirmaEc          = '';
    this.pasoFirmaEc           = 'generando';
    this.reiniciarCatalogosSeleccionados();
    this.reiniciarFlujoFirma();
  }

  reiniciarCatalogosSeleccionados(): void {
    this.areas = [];
    this.cargos = [];
    this.jefeAsignado = null;
    this.nombreDireccionSeleccionada = '';
    this.nombreAreaSeleccionada = '';
    this.nombreCargoSeleccionado = '';
  }

  // =====================================================
  // VALIDACIÓN USUARIO EXTERNO
  // =====================================================

  actualizarValidacionUsuarioExterno(tipoUsuario: string): void {
    const control = this.formulario.get('nombre_usuario_externo');

    if (!control) {
      return;
    }

    if (tipoUsuario === 'externo') {
      control.setValidators([
        Validators.required,
        Validators.minLength(5),
        Validators.maxLength(200)
      ]);
    } else {
      control.clearValidators();
      control.setValue('');
    }

    control.updateValueAndValidity();
  }

  // =====================================================
  // PÁGINAS WEB
  // =====================================================

  agregarPaginaWeb(): void {
    if (this.paginasWeb.length >= 8) {
      return;
    }

    this.paginasWeb.push(this.crearPaginaWeb());
  }

  eliminarPaginaWeb(index: number): void {
    if (this.paginasWeb.length <= 1) {
      return;
    }

    this.paginasWeb.removeAt(index);
  }

  paginaInvalida(index: number, campo: string): boolean {
    const control = this.paginasWeb.at(index).get(campo);

    if (!control) {
      return false;
    }

    return control.invalid && (control.dirty || control.touched);
  }

  obtenerMensajePagina(index: number, campo: string): string {
    const control = this.paginasWeb.at(index).get(campo);

    if (!control) {
      return '';
    }

    if (control.hasError('required')) {
      return 'Este campo es obligatorio.';
    }

    if (control.hasError('maxlength')) {
      return 'El texto ingresado supera el límite permitido.';
    }

    return 'Campo inválido.';
  }

  limpiarUrlPagina(index: number): void {
    const control = this.paginasWeb.at(index).get('url_pagina');

    if (!control) {
      return;
    }

    const valor = String(control.value || '')
      .trim()
      .replace(/\s+/g, '');

    control.setValue(valor, {
      emitEvent: false
    });
  }
    // =====================================================
  // VALIDACIONES GENERALES
  // =====================================================

  campoInvalido(campo: string): boolean {
    const control = this.formulario.get(campo);

    if (!control) {
      return false;
    }

    return control.invalid && (control.dirty || control.touched);
  }

  obtenerMensajeCampo(campo: string): string {
    const control = this.formulario.get(campo);

    if (!control) {
      return '';
    }

    if (control.hasError('required')) {
      return 'Este campo es obligatorio.';
    }

    if (control.hasError('email')) {
      return 'Ingrese un correo electrónico válido.';
    }

    if (control.hasError('minlength')) {
      return 'El texto ingresado es demasiado corto.';
    }

    if (control.hasError('maxlength')) {
      return 'El texto ingresado supera el límite permitido.';
    }

    if (control.hasError('pattern')) {
      return this.obtenerMensajePattern(campo);
    }

    return 'Campo inválido.';
  }

  obtenerMensajePattern(campo: string): string {
    const mensajes: Record<string, string> = {
      cedula: 'La cédula debe tener exactamente 10 números.',
      telefono_ext: 'El teléfono debe tener exactamente 10 números.',
      direccion_ip: 'Ingrese una dirección IP válida. Ejemplo: 192.168.1.100'
    };

    return mensajes[campo] || 'Formato inválido.';
  }

  marcarFormularioComoTocado(): void {
    Object.values(this.formulario.controls).forEach((control: AbstractControl) => {
      control.markAsTouched();
      control.updateValueAndValidity();
    });

    this.paginasWeb.controls.forEach((grupo) => {
      Object.values((grupo as FormGroup).controls).forEach((control) => {
        control.markAsTouched();
        control.updateValueAndValidity();
      });
    });
  }

  // =====================================================
  // LIMPIEZA DE CAMPOS
  // =====================================================

  limpiarTextoSimple(campo: string): void {
    const control = this.formulario.get(campo);

    if (!control) {
      return;
    }

    const valor = String(control.value || '')
      .replace(/[<>]/g, '')
      .replace(/\s{2,}/g, ' ')
      .trimStart();

    control.setValue(valor, {
      emitEvent: false
    });
  }

  limpiarSoloNumeros(campo: string, limite: number): void {
    const control = this.formulario.get(campo);

    if (!control) {
      return;
    }

    const valor = String(control.value || '')
      .replace(/\D/g, '')
      .slice(0, limite);

    control.setValue(valor, {
      emitEvent: false
    });
  }

  limpiarCorreoInstitucional(): void {
    const control = this.formulario.get('correo_institucional');

    if (!control) {
      return;
    }

    const valor = String(control.value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '');

    control.setValue(valor, {
      emitEvent: false
    });
  }

  limpiarIp(): void {
    const control = this.formulario.get('direccion_ip');

    if (!control) {
      return;
    }

    const valor = String(control.value || '')
      .replace(/[^0-9.]/g, '')
      .replace(/\.{2,}/g, '.')
      .slice(0, 15);

    control.setValue(valor, {
      emitEvent: false
    });
  }

  soloNumeros(event: KeyboardEvent): void {
    const teclasPermitidas = [
      'Backspace',
      'Delete',
      'Tab',
      'ArrowLeft',
      'ArrowRight',
      'Home',
      'End'
    ];

    if (teclasPermitidas.includes(event.key)) {
      return;
    }

    if (!/^[0-9]$/.test(event.key)) {
      event.preventDefault();
    }
  }

  // =====================================================
  // ENVÍO
  // =====================================================

  enviarSolicitud(): void {
    this.abrirModalFirmaEc();
  }

  construirPayload(): any {
    const valor = this.formulario.getRawValue();

    const direccionId = Number(valor.direccion_id || 0);
    const areaId = Number(valor.area_id || 0);
    const cargoId = Number(valor.cargo_id || 0);

    const direccion = this.direcciones.find((item) =>
      Number(item.id) === direccionId
    );

    const area = this.areas.find((item) =>
      Number(item.id) === areaId
    );

    const cargo = this.cargos.find((item) =>
      Number(item.id) === cargoId
    );

    return {
      nombres_completos: this.normalizarTexto(valor.nombres_completos),
      cedula: String(valor.cedula || '').trim(),
      correo_institucional: String(valor.correo_institucional || '').trim().toLowerCase(),
      telefono_ext: String(valor.telefono_ext || '').trim(),

      direccion_id: direccionId,
      area_id: areaId,
      cargo_id: cargoId,
      jefe_asignado_id: this.jefeAsignado?.usuario_id || null,
      jefe_area_personal_id: this.jefeAsignado?.id || null,

      dependencia: this.normalizarTexto(direccion?.nombre || this.nombreDireccionSeleccionada),
      area_unidad: this.normalizarTexto(area?.nombre || this.nombreAreaSeleccionada),
      cargo: this.normalizarTexto(cargo?.nombre || this.nombreCargoSeleccionado),

      fecha_solicitud: valor.fecha_solicitud,

      tipo_usuario: valor.tipo_usuario,
      nombre_usuario_externo:
        valor.tipo_usuario === 'externo'
          ? this.normalizarTexto(valor.nombre_usuario_externo)
          : null,

      direccion_ip: String(valor.direccion_ip || '').trim() || null,
      tiempo_vigencia_acceso: String(valor.tiempo_vigencia_acceso || '').trim(),

      justificacion_necesidad_institucional: this.normalizarTexto(
        valor.justificacion_necesidad_institucional
      ),

      paginas_web: (valor.paginas_web || []).map((pagina: any, index: number) => ({
        numero: index + 1,
        url_pagina: String(pagina.url_pagina || '').trim(),
        descripcion: this.normalizarTexto(pagina.descripcion || '')
      }))
    };
  }

  normalizarTexto(valor: string): string {
    return String(valor || '')
      .replace(/[<>]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
