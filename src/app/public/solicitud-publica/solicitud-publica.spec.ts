import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
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

interface SubidaFirmaResponse {
  estado: string;
  mensaje: string;
  solicitud?: {
    codigo_solicitud: string;
    estado: string;
    etapa_actual: string;
  };
}

@Component({
  selector: 'app-solicitud-publica',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    HttpClientModule,
    RouterLink
  ],
  templateUrl: './solicitud-publica.html',
  styleUrl: './solicitud-publica.scss'
})
export class SolicitudPublica implements OnInit {

  /*
    LOCAL:
    http://localhost:5050/api

    SERVIDOR CON NGINX:
    /api
  */
  private readonly API_BASE = 'http://localhost:5050/api';

  private readonly API_PREPARAR_ELECTRONICO =
    `${this.API_BASE}/public/electronico/preparar`;

  formulario!: FormGroup;

  cargando = false;
  enviado = false;
  errorGeneral = '';
  codigoGenerado = '';

  mostrarModalIp = false;

  mostrarModalFirmaEc = false;
  preparandoFirmaEc = false;
  subiendoFirmaEc = false;

  codigoFirmaEc = '';
  urlDescargaFirmaEc = '';

  archivoFirmado: File | null = null;
  nombreArchivoFirmado = '';
  urlVistaPreviaFirmado = '';

  errorFirmaEc = '';
  exitoFirmaEc = '';

  pasoFirmaEc: 'generando' | 'descarga' | 'subida' | 'finalizado' = 'generando';

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
          Validators.maxLength(255),
          Validators.pattern(/^https?:\/\/.+/i)
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

  abrirModalFirmaEc(): void {
    this.errorGeneral = '';
    this.errorFirmaEc = '';
    this.exitoFirmaEc = '';

    if (this.formulario.invalid) {
      this.marcarFormularioComoTocado();
      this.errorGeneral = 'Revise los campos marcados antes de generar el formato para FirmaEC.';
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

    if (!this.codigoFirmaEc) {
      this.generarFormatoAutomaticoFirmaEc();
    }
  }

  cerrarModalFirmaEc(): void {
    if (this.preparandoFirmaEc || this.subiendoFirmaEc) {
      return;
    }

    this.mostrarModalFirmaEc = false;
    this.errorFirmaEc = '';
    this.exitoFirmaEc = '';
  }

  generarFormatoAutomaticoFirmaEc(): void {
    this.errorFirmaEc = '';
    this.exitoFirmaEc = '';
    this.pasoFirmaEc = 'generando';

    const payload = this.construirPayload();

    this.preparandoFirmaEc = true;

    this.http.post<PrepararFirmaResponse>(this.API_PREPARAR_ELECTRONICO, payload)
      .subscribe({
        next: (response) => {
          this.preparandoFirmaEc = false;

          if (response.estado !== 'ok') {
            this.errorFirmaEc = response.mensaje || 'No se pudo generar el formato.';
            return;
          }

          this.codigoFirmaEc =
            response.codigo_solicitud ||
            response.solicitud?.codigo_solicitud ||
            '';

          if (!this.codigoFirmaEc) {
            this.errorFirmaEc = 'El servidor no devolvió el código de solicitud.';
            return;
          }

          const urlBackend =
            response.url_descarga ||
            `/api/public/electronico/${this.codigoFirmaEc}/pdf`;

          this.urlDescargaFirmaEc = this.normalizarUrlBackend(urlBackend);
          this.codigoGenerado = this.codigoFirmaEc;
          this.pasoFirmaEc = 'descarga';

          this.exitoFirmaEc =
            'ID y formato generados correctamente. Descargue el PDF, fírmelo externamente con FirmaEC y suba el PDF firmado.';
        },
        error: (err) => {
          this.preparandoFirmaEc = false;

          if (err.status === 0) {
            this.errorFirmaEc = 'No se pudo conectar con el servidor.';
            return;
          }

          this.errorFirmaEc =
            err.error?.mensaje ||
            err.error?.error ||
            'No se pudo generar automáticamente el formato para FirmaEC.';
        }
      });
  }

  descargarFormatoFirmaEc(): void {
    this.errorFirmaEc = '';

    if (!this.codigoFirmaEc) {
      this.errorFirmaEc = 'Espere a que el sistema genere el ID único de la solicitud.';
      return;
    }

    const url = this.urlDescargaFirmaEc ||
      `${this.API_BASE}/public/electronico/${this.codigoFirmaEc}/pdf`;

    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.target = '_blank';
    enlace.rel = 'noopener noreferrer';
    enlace.download = `${this.codigoFirmaEc}.pdf`;

    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);

    this.pasoFirmaEc = 'descarga';
    this.exitoFirmaEc =
      'Formato PDF descargado. Ahora abra FirmaEC externamente, firme el documento y suba aquí el PDF firmado.';
  }

  seleccionarArchivoFirmado(event: Event): void {
    this.errorFirmaEc = '';
    this.exitoFirmaEc = '';
    this.archivoFirmado = null;
    this.nombreArchivoFirmado = '';

    this.liberarVistaPreviaFirmado();

    const input = event.target as HTMLInputElement;

    if (!input.files || input.files.length === 0) {
      return;
    }

    const archivo = input.files[0];

    const nombre = archivo.name.toLowerCase();
    const extensionPdf = nombre.endsWith('.pdf');
    const mimePdf = archivo.type === 'application/pdf' || archivo.type === '';

    if (!extensionPdf || !mimePdf) {
      this.errorFirmaEc = 'Solo se permite subir un archivo PDF firmado electrónicamente.';
      input.value = '';
      return;
    }

    const maxMb = 15;
    const maxBytes = maxMb * 1024 * 1024;

    if (archivo.size > maxBytes) {
      this.errorFirmaEc = `El PDF firmado no puede superar ${maxMb} MB.`;
      input.value = '';
      return;
    }

    this.archivoFirmado = archivo;
    this.nombreArchivoFirmado = archivo.name;
    this.urlVistaPreviaFirmado = URL.createObjectURL(archivo);
    this.pasoFirmaEc = 'subida';

    this.exitoFirmaEc =
      'PDF seleccionado correctamente. Revise el archivo antes de enviarlo al jefe inmediato.';
  }

  verPdfSubido(): void {
    this.errorFirmaEc = '';

    if (!this.urlVistaPreviaFirmado) {
      this.errorFirmaEc = 'Primero debe seleccionar un PDF firmado para poder visualizarlo.';
      return;
    }

    window.open(this.urlVistaPreviaFirmado, '_blank', 'noopener,noreferrer');
  }

  quitarPdfFirmado(): void {
    this.archivoFirmado = null;
    this.nombreArchivoFirmado = '';
    this.liberarVistaPreviaFirmado();
    this.pasoFirmaEc = 'descarga';
    this.exitoFirmaEc = 'Archivo retirado. Puede seleccionar nuevamente el PDF firmado correcto.';
  }

  liberarVistaPreviaFirmado(): void {
    if (this.urlVistaPreviaFirmado) {
      URL.revokeObjectURL(this.urlVistaPreviaFirmado);
      this.urlVistaPreviaFirmado = '';
    }
  }

  subirPdfFirmadoFirmaEc(): void {
    this.errorFirmaEc = '';
    this.exitoFirmaEc = '';

    if (!this.codigoFirmaEc) {
      this.errorFirmaEc = 'Espere a que el sistema genere el ID único de la solicitud.';
      return;
    }

    if (!this.archivoFirmado) {
      this.errorFirmaEc = 'Seleccione el PDF firmado electrónicamente con FirmaEC.';
      return;
    }

    if (!this.jefeAsignado) {
      this.errorFirmaEc = 'No existe jefe asignado para esta área. No se puede enviar la solicitud.';
      return;
    }

    const confirmar = window.confirm(
      'Verifique que el PDF seleccionado sea el documento correcto y que esté firmado electrónicamente con FirmaEC.\n\nAl enviarlo, la solicitud pasará únicamente al jefe responsable del área seleccionada.'
    );

    if (!confirmar) {
      return;
    }

    const formData = new FormData();
    formData.append('archivo', this.archivoFirmado);

    this.subiendoFirmaEc = true;

    this.http.post<SubidaFirmaResponse>(
      `${this.API_BASE}/public/electronico/${this.codigoFirmaEc}/subir-firmado`,
      formData
    ).subscribe({
      next: (response) => {
        this.subiendoFirmaEc = false;

        if (response.estado !== 'ok') {
          this.errorFirmaEc = response.mensaje || 'No se pudo subir el PDF firmado.';
          return;
        }

        this.pasoFirmaEc = 'finalizado';
        this.enviado = true;
        this.codigoGenerado = this.codigoFirmaEc;

        this.exitoFirmaEc =
          'PDF firmado subido correctamente. La solicitud fue enviada al jefe inmediato asignado.';

        this.formulario.reset();
        this.crearFormulario();
        this.cargarDirecciones();
        this.reiniciarCatalogosSeleccionados();

        this.archivoFirmado = null;
        this.nombreArchivoFirmado = '';
        this.liberarVistaPreviaFirmado();
      },
      error: (err) => {
        this.subiendoFirmaEc = false;

        if (err.status === 0) {
          this.errorFirmaEc = 'No se pudo conectar con el servidor.';
          return;
        }

        this.errorFirmaEc =
          err.error?.mensaje ||
          err.error?.error ||
          'No se pudo subir el PDF firmado con FirmaEC.';
      }
    });
  }

  reiniciarFlujoFirmaEc(): void {
    this.codigoFirmaEc = '';
    this.urlDescargaFirmaEc = '';
    this.archivoFirmado = null;
    this.nombreArchivoFirmado = '';
    this.errorFirmaEc = '';
    this.exitoFirmaEc = '';
    this.pasoFirmaEc = 'generando';
    this.liberarVistaPreviaFirmado();
    this.reiniciarCatalogosSeleccionados();
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

    if (control.hasError('pattern')) {
      return 'La URL debe iniciar con http:// o https://.';
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