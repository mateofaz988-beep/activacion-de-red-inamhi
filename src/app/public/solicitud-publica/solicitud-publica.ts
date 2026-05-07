import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { RouterLink } from '@angular/router';

import {
  SolicitudPublicaRequest,
  SolicitudPublicaService
} from '../../services/solicitud-publica.service';

@Component({
  selector: 'app-solicitud-publica',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './solicitud-publica.html',
  styleUrl: './solicitud-publica.scss'
})
export class SolicitudPublica {

  formulario: FormGroup;
  cargando = false;
  enviado = false;
  errorGeneral = '';
  codigoGenerado = '';

  private readonly patronNombres = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]+$/;
  private readonly patronTextoInstitucional = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ0-9\s.,#()/-]+$/;
  private readonly patronCedula = /^\d{10}$/;
  private readonly patronTelefono = /^\d{10}$/;
  private readonly patronCorreoInamhi = /^[a-zA-Z0-9._%+-]+@inamhi\.gob\.ec$/;
  private readonly patronUrl = /^https?:\/\/[^\s/$.?#].[^\s]*$/;
  private readonly patronIp =
    /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

  constructor(
    private fb: FormBuilder,
    private solicitudService: SolicitudPublicaService
  ) {
    this.formulario = this.fb.group({
      nombres_completos: [
        '',
        [
          Validators.required,
          Validators.minLength(5),
          Validators.maxLength(200),
          Validators.pattern(this.patronNombres),
          this.validarNombreCompleto
        ]
      ],
      cedula: [
        '',
        [
          Validators.required,
          Validators.pattern(this.patronCedula)
        ]
      ],
      correo_institucional: [
        '',
        [
          Validators.required,
          Validators.email,
          Validators.pattern(this.patronCorreoInamhi)
        ]
      ],
      telefono_ext: [
        '',
        [
          Validators.required,
          Validators.pattern(this.patronTelefono)
        ]
      ],
      dependencia: [
        '',
        [
          Validators.required,
          Validators.minLength(3),
          Validators.maxLength(150),
          Validators.pattern(this.patronTextoInstitucional)
        ]
      ],
      area_unidad: [
        '',
        [
          Validators.required,
          Validators.minLength(3),
          Validators.maxLength(150),
          Validators.pattern(this.patronTextoInstitucional)
        ]
      ],
      cargo: [
        '',
        [
          Validators.required,
          Validators.minLength(3),
          Validators.maxLength(150),
          Validators.pattern(this.patronTextoInstitucional)
        ]
      ],
      fecha_solicitud: [
        this.obtenerFechaActual(),
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
      nombre_usuario_externo: [''],
      direccion_ip: [
        '',
        [
          this.validarIpOpcional
        ]
      ],
      tiempo_vigencia_acceso: [
        '',
        [
          Validators.required,
          Validators.minLength(3),
          Validators.maxLength(100),
          Validators.pattern(/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ0-9\s.,/-]+$/)
        ]
      ],
      justificacion_necesidad_institucional: [
        '',
        [
          Validators.required,
          Validators.minLength(20),
          Validators.maxLength(2000),
          this.validarJustificacion
        ]
      ],
      paginas_web: this.fb.array([])
    });

    this.agregarPaginaWeb();

    this.formulario.get('tipo_usuario')?.valueChanges.subscribe((tipo) => {
      this.configurarValidacionesTipoUsuario(tipo);
    });
  }

  get paginasWeb(): FormArray {
    return this.formulario.get('paginas_web') as FormArray;
  }

  obtenerFechaActual(): string {
    const fecha = new Date();
    const year = fecha.getFullYear();
    const month = String(fecha.getMonth() + 1).padStart(2, '0');
    const day = String(fecha.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  crearPaginaWeb(): FormGroup {
    return this.fb.group({
      url_pagina: [
        '',
        [
          Validators.required,
          Validators.maxLength(255),
          Validators.pattern(this.patronUrl)
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

  agregarPaginaWeb(): void {
    if (this.paginasWeb.length >= 8) {
      this.errorGeneral = 'Solo se permiten máximo 8 páginas web.';
      return;
    }

    this.paginasWeb.push(this.crearPaginaWeb());
  }

  eliminarPaginaWeb(index: number): void {
    if (this.paginasWeb.length <= 1) {
      this.errorGeneral = 'Debe existir al menos una página web importante.';
      return;
    }

    this.paginasWeb.removeAt(index);
    this.errorGeneral = '';
  }

  configurarValidacionesTipoUsuario(tipo: string): void {
    const nombreExterno = this.formulario.get('nombre_usuario_externo');
    const direccionIp = this.formulario.get('direccion_ip');

    if (!nombreExterno || !direccionIp) {
      return;
    }

    if (tipo === 'externo') {
      nombreExterno.setValidators([
        Validators.required,
        Validators.minLength(5),
        Validators.maxLength(200),
        Validators.pattern(this.patronNombres),
        this.validarNombreCompleto
      ]);

      direccionIp.setValidators([
        Validators.required,
        this.validarIpObligatoria
      ]);
    } else {
      nombreExterno.clearValidators();
      nombreExterno.setValue('');

      direccionIp.setValidators([
        this.validarIpOpcional
      ]);
    }

    nombreExterno.updateValueAndValidity();
    direccionIp.updateValueAndValidity();
  }

  validarNombreCompleto(control: AbstractControl) {
    const valor = String(control.value || '').trim();

    if (!valor) {
      return null;
    }

    const palabras = valor.split(/\s+/).filter(Boolean);

    if (/\d/.test(valor)) {
      return { contieneNumeros: true };
    }

    if (/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/.test(valor)) {
      return { caracteresInvalidosNombre: true };
    }

    if (palabras.length < 2) {
      return { nombreIncompleto: true };
    }

    if (palabras.some((palabra) => palabra.length < 2)) {
      return { palabraMuyCorta: true };
    }

    return null;
  }

  validarJustificacion(control: AbstractControl) {
    const valor = String(control.value || '').trim();

    if (!valor) {
      return null;
    }

    const soloNumerosOSimbolos = /^[0-9\s.,;:()/-]+$/.test(valor);

    if (soloNumerosOSimbolos) {
      return { justificacionSinTexto: true };
    }

    const palabras = valor.split(/\s+/).filter(Boolean);

    if (palabras.length < 5) {
      return { justificacionMuyCorta: true };
    }

    return null;
  }

  validarIpObligatoria(control: AbstractControl) {
    const valor = String(control.value || '').trim();

    const patronIp =
      /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

    if (!valor) {
      return { ipRequerida: true };
    }

    return patronIp.test(valor) ? null : { ipInvalida: true };
  }

  validarIpOpcional(control: AbstractControl) {
    const valor = String(control.value || '').trim();

    if (!valor) {
      return null;
    }

    const patronIp =
      /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

    return patronIp.test(valor) ? null : { ipInvalida: true };
  }

  soloNumeros(event: KeyboardEvent): void {
    const tecla = event.key;

    const teclasPermitidas = [
      'Backspace',
      'Delete',
      'ArrowLeft',
      'ArrowRight',
      'Tab',
      'Home',
      'End'
    ];

    if (teclasPermitidas.includes(tecla)) {
      return;
    }

    if (!/^\d$/.test(tecla)) {
      event.preventDefault();
    }
  }

  soloLetras(event: KeyboardEvent): void {
    const tecla = event.key;

    const teclasPermitidas = [
      'Backspace',
      'Delete',
      'ArrowLeft',
      'ArrowRight',
      'Tab',
      'Home',
      'End',
      ' '
    ];

    if (teclasPermitidas.includes(tecla)) {
      return;
    }

    if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]$/.test(tecla)) {
      event.preventDefault();
    }
  }

  bloquearPegadoNoNumerico(event: ClipboardEvent, controlName: string, maxLength: number): void {
    const texto = event.clipboardData?.getData('text') || '';

    if (!/^\d+$/.test(texto)) {
      event.preventDefault();
      return;
    }

    const control = this.formulario.get(controlName);
    const valorActual = String(control?.value || '');

    if ((valorActual + texto).length > maxLength) {
      event.preventDefault();
    }
  }

  bloquearPegadoNoTexto(event: ClipboardEvent): void {
    const texto = event.clipboardData?.getData('text') || '';

    if (/[\d]/.test(texto) || /[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/.test(texto)) {
      event.preventDefault();
    }
  }

  limpiarSoloNumeros(controlName: string, maxLength: number): void {
    const control = this.formulario.get(controlName);

    if (!control) {
      return;
    }

    const limpio = String(control.value || '').replace(/\D/g, '').slice(0, maxLength);
    control.setValue(limpio, { emitEvent: false });
  }

  limpiarSoloLetras(controlName: string): void {
    const control = this.formulario.get(controlName);

    if (!control) {
      return;
    }

    const limpio = String(control.value || '')
      .replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, '')
      .replace(/\s+/g, ' ')
      .trimStart();

    control.setValue(limpio, { emitEvent: false });
  }

  limpiarTextoInstitucional(controlName: string): void {
    const control = this.formulario.get(controlName);

    if (!control) {
      return;
    }

    const limpio = String(control.value || '')
      .replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ0-9\s.,#()/-]/g, '')
      .replace(/\s+/g, ' ')
      .trimStart();

    control.setValue(limpio, { emitEvent: false });
  }

  limpiarTextoSimple(controlName: string): void {
    const control = this.formulario.get(controlName);

    if (!control) {
      return;
    }

    const limpio = String(control.value || '').replace(/\s+/g, ' ').trimStart();
    control.setValue(limpio, { emitEvent: false });
  }

  limpiarCorreoInstitucional(): void {
    const control = this.formulario.get('correo_institucional');

    if (!control) {
      return;
    }

    const limpio = String(control.value || '')
      .trim()
      .toLowerCase()
      .replace(/\s/g, '');

    control.setValue(limpio, { emitEvent: false });
  }

  limpiarIp(): void {
    const control = this.formulario.get('direccion_ip');

    if (!control) {
      return;
    }

    const limpio = String(control.value || '')
      .replace(/[^0-9.]/g, '')
      .slice(0, 15);

    control.setValue(limpio, { emitEvent: false });
  }

  limpiarUrlPagina(index: number): void {
    const control = this.paginasWeb.at(index).get('url_pagina');

    if (!control) {
      return;
    }

    const limpio = String(control.value || '').trim().replace(/\s/g, '');
    control.setValue(limpio, { emitEvent: false });
  }

  campoInvalido(nombre: string): boolean {
    const control = this.formulario.get(nombre);
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  paginaInvalida(index: number, campo: string): boolean {
    const control = this.paginasWeb.at(index).get(campo);
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  obtenerMensajeCampo(nombre: string): string {
    const control = this.formulario.get(nombre);

    if (!control || !control.errors) {
      return '';
    }

    if (control.errors['required']) {
      return 'Este campo es obligatorio.';
    }

    if (control.errors['minlength']) {
      return `Debe tener mínimo ${control.errors['minlength'].requiredLength} caracteres.`;
    }

    if (control.errors['maxlength']) {
      return `No puede superar ${control.errors['maxlength'].requiredLength} caracteres.`;
    }

    if (control.errors['email']) {
      return 'Ingrese un correo válido.';
    }

    if (control.errors['contieneNumeros']) {
      return 'No se permiten números en nombres o apellidos.';
    }

    if (control.errors['caracteresInvalidosNombre']) {
      return 'Solo se permiten letras, tildes, ñ y espacios.';
    }

    if (control.errors['nombreIncompleto']) {
      return 'Ingrese al menos un nombre y un apellido.';
    }

    if (control.errors['palabraMuyCorta']) {
      return 'Cada nombre o apellido debe tener al menos 2 letras.';
    }

    if (control.errors['justificacionSinTexto']) {
      return 'La justificación debe contener texto, no solo números o símbolos.';
    }

    if (control.errors['justificacionMuyCorta']) {
      return 'La justificación debe contener al menos 5 palabras.';
    }

    if (control.errors['pattern']) {
      if (nombre === 'cedula') {
        return 'La cédula debe tener exactamente 10 números.';
      }

      if (nombre === 'telefono_ext') {
        return 'El teléfono debe tener exactamente 10 números.';
      }

      if (nombre === 'correo_institucional') {
        return 'El correo debe terminar exactamente en @inamhi.gob.ec.';
      }

      if (nombre === 'nombres_completos' || nombre === 'nombre_usuario_externo') {
        return 'Solo se permiten letras y espacios. No use números ni símbolos.';
      }

      if (['dependencia', 'area_unidad', 'cargo'].includes(nombre)) {
        return 'Este campo contiene caracteres no permitidos.';
      }

      if (nombre === 'tiempo_vigencia_acceso') {
        return 'Ingrese una vigencia válida. Ejemplo: 6 meses, 30 días, 1 año.';
      }

      return 'Formato inválido.';
    }

    if (control.errors['ipRequerida']) {
      return 'La dirección IP es obligatoria.';
    }

    if (control.errors['ipInvalida']) {
      return 'Ingrese una dirección IPv4 válida. Ejemplo: 192.168.1.100';
    }

    return 'Campo inválido.';
  }

  obtenerMensajePagina(index: number, campo: string): string {
    const control = this.paginasWeb.at(index).get(campo);

    if (!control || !control.errors) {
      return '';
    }

    if (control.errors['required']) {
      return 'La URL es obligatoria.';
    }

    if (control.errors['maxlength']) {
      return `No puede superar ${control.errors['maxlength'].requiredLength} caracteres.`;
    }

    if (control.errors['pattern']) {
      return 'La URL debe iniciar con http:// o https:// y tener un dominio válido.';
    }

    return 'Campo inválido.';
  }

  marcarFormulario(): void {
    this.formulario.markAllAsTouched();

    this.paginasWeb.controls.forEach((control) => {
      control.markAllAsTouched();
    });
  }

  prepararPayload(): SolicitudPublicaRequest {
    const valor = this.formulario.value;

    return {
      nombres_completos: String(valor.nombres_completos).trim().replace(/\s+/g, ' '),
      cedula: String(valor.cedula).trim(),
      correo_institucional: String(valor.correo_institucional).trim().toLowerCase(),
      telefono_ext: String(valor.telefono_ext).trim(),
      dependencia: String(valor.dependencia).trim().replace(/\s+/g, ' '),
      area_unidad: String(valor.area_unidad).trim().replace(/\s+/g, ' '),
      cargo: String(valor.cargo).trim().replace(/\s+/g, ' '),
      fecha_solicitud: String(valor.fecha_solicitud).trim(),
      tipo_usuario: valor.tipo_usuario,
      nombre_usuario_externo: String(valor.nombre_usuario_externo || '').trim().replace(/\s+/g, ' '),
      direccion_ip: String(valor.direccion_ip || '').trim(),
      tiempo_vigencia_acceso: String(valor.tiempo_vigencia_acceso).trim().replace(/\s+/g, ' '),
      justificacion_necesidad_institucional: String(
        valor.justificacion_necesidad_institucional
      ).trim().replace(/\s+/g, ' '),
      paginas_web: valor.paginas_web.map((pagina: any) => ({
        url_pagina: String(pagina.url_pagina).trim(),
        descripcion: String(pagina.descripcion || '').trim().replace(/\s+/g, ' ')
      }))
    };
  }

  enviarSolicitud(): void {
    this.errorGeneral = '';
    this.enviado = false;
    this.codigoGenerado = '';

    if (this.formulario.invalid) {
      this.marcarFormulario();
      this.errorGeneral = 'Revise los campos marcados antes de enviar la solicitud.';
      return;
    }

    if (this.paginasWeb.length < 1) {
      this.errorGeneral = 'Debe ingresar al menos una página web importante.';
      return;
    }

    const payload = this.prepararPayload();

    this.cargando = true;

    this.solicitudService.registrarSolicitud(payload).subscribe({
      next: (response) => {
        this.cargando = false;
        this.enviado = true;
        this.codigoGenerado = response.solicitud.codigo_solicitud;

        this.formulario.reset({
          fecha_solicitud: this.obtenerFechaActual(),
          tipo_usuario: 'funcionario_inamhi'
        });

        this.paginasWeb.clear();
        this.agregarPaginaWeb();
      },
      error: (error) => {
        this.cargando = false;

        if (error.error?.errores) {
          const errores = error.error.errores;
          const mensajes = Object.values(errores).join(' ');
          this.errorGeneral = mensajes;
          return;
        }

        if (error.error?.mensaje) {
          this.errorGeneral = error.error.mensaje;
          return;
        }

        this.errorGeneral = 'No se pudo registrar la solicitud. Verifique la conexión con el servidor.';
      }
    });
  }
}