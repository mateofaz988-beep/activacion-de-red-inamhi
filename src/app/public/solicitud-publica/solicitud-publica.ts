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

  private readonly API_URL = 'http://127.0.0.1:5050/api/public/solicitudes';

  formulario!: FormGroup;

  cargando = false;
  enviado = false;
  errorGeneral = '';
  codigoGenerado = '';

  // Modal de ayuda para IP
  mostrarModalIp = false;

  constructor(
    private fb: FormBuilder,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    this.crearFormulario();
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
      dependencia: [
        '',
        [
          Validators.required,
          Validators.minLength(3),
          Validators.maxLength(150)
        ]
      ],
      area_unidad: [
        '',
        [
          Validators.required,
          Validators.minLength(3),
          Validators.maxLength(150)
        ]
      ],
      cargo: [
        '',
        [
          Validators.required,
          Validators.minLength(3),
          Validators.maxLength(150)
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
          Validators.required,
          Validators.minLength(3),
          Validators.maxLength(100)
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
  // MODAL IP
  // =====================================================

  abrirModalIp(): void {
    this.mostrarModalIp = true;
  }

  cerrarModalIp(): void {
    this.mostrarModalIp = false;
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
    this.errorGeneral = '';

    if (this.formulario.invalid) {
      this.marcarFormularioComoTocado();
      this.errorGeneral = 'Revise los campos marcados antes de enviar la solicitud.';
      return;
    }

    if (this.paginasWeb.length < 1) {
      this.errorGeneral = 'Debe ingresar al menos una página web.';
      return;
    }

    const payload = this.construirPayload();

    this.cargando = true;

    this.http.post<any>(this.API_URL, payload).subscribe({
      next: (response) => {
        this.cargando = false;

        this.codigoGenerado =
          response?.codigo_solicitud ||
          response?.solicitud?.codigo_solicitud ||
          response?.codigo ||
          'Código no disponible';

        this.enviado = true;
        this.errorGeneral = '';

        this.formulario.reset();
        this.crearFormulario();
      },
      error: (err) => {
        this.cargando = false;

        this.errorGeneral =
          err.error?.mensaje ||
          err.error?.error ||
          'No se pudo registrar la solicitud. Intente nuevamente.';
      }
    });
  }

  construirPayload(): any {
    const valor = this.formulario.getRawValue();

    return {
      nombres_completos: this.normalizarTexto(valor.nombres_completos),
      cedula: String(valor.cedula || '').trim(),
      correo_institucional: String(valor.correo_institucional || '').trim().toLowerCase(),
      telefono_ext: String(valor.telefono_ext || '').trim(),
      dependencia: this.normalizarTexto(valor.dependencia),
      area_unidad: this.normalizarTexto(valor.area_unidad),
      cargo: this.normalizarTexto(valor.cargo),
      fecha_solicitud: valor.fecha_solicitud,

      tipo_usuario: valor.tipo_usuario,
      nombre_usuario_externo:
        valor.tipo_usuario === 'externo'
          ? this.normalizarTexto(valor.nombre_usuario_externo)
          : null,

      direccion_ip: String(valor.direccion_ip || '').trim() || null,
      tiempo_vigencia_acceso: this.normalizarTexto(valor.tiempo_vigencia_acceso),
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