import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import Swal from 'sweetalert2';

import { AuthService } from '../../services/auth.service';

export interface UsuarioSistema {
  id: number;
  nombres: string;
  apellidos: string;
  cedula: string;
  correo: string;
  usuario: string;
  rol: string;
  cargo: string;
  area_unidad: string;
  dependencia: string;
  telefono_ext: string | null;
  estado: 'activo' | 'inactivo';
  ultimo_acceso: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface UsuarioFormulario {
  id?: number | null;
  nombres: string;
  apellidos: string;
  cedula: string;
  correo: string;
  usuario: string;
  password: string;
  rol: string;
  cargo: string;
  area_unidad: string;
  dependencia: string;
  telefono_ext: string;
  estado: 'activo' | 'inactivo';
}

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    RouterLinkActive
  ],
  templateUrl: './usuarios.html',
  styleUrl: './usuarios.scss'
})
export class Usuarios implements OnInit {

  private readonly API_BASE = 'http://10.0.5.120:5050/api';
  private readonly API_URL = `${this.API_BASE}/admin/usuarios`;

  usuarios: UsuarioSistema[] = [];
  usuariosFiltrados: UsuarioSistema[] = [];

  cargando = false;
  guardando = false;
  mostrarFormulario = false;
  usuarioEditando = false;

  error = '';

  textoBusqueda = '';
  filtroRol = '';
  filtroEstado = '';

  totalUsuarios = 0;
  totalActivos = 0;
  totalInactivos = 0;
  totalAdministradores = 0;

  formulario: UsuarioFormulario = this.obtenerFormularioVacio();

  constructor(
    private http: HttpClient,
    private router: Router,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.cargarUsuarios();
  }

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('auth_token_liberacion_web') || '';

    return new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
  }

  obtenerFormularioVacio(): UsuarioFormulario {
    return {
      id: null,
      nombres: '',
      apellidos: '',
      cedula: '',
      correo: '',
      usuario: '',
      password: '',
      rol: '',
      cargo: '',
      area_unidad: '',
      dependencia: '',
      telefono_ext: '',
      estado: 'activo'
    };
  }

  cargarUsuarios(): void {
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

        this.usuarios = response.usuarios || [];
        this.aplicarFiltros();
        this.calcularResumen();
      },
      error: (err) => {
        this.cargando = false;

        if (err.status === 401 || err.status === 403) {
          this.authService.logout();
          this.router.navigate(['/auth/login']);
          return;
        }

        this.error = err.error?.mensaje || 'No se pudieron cargar los usuarios.';
      }
    });
  }

  aplicarFiltros(): void {
    const busqueda = this.textoBusqueda.trim().toLowerCase();

    this.usuariosFiltrados = this.usuarios.filter((usuario) => {
      const coincideRol = this.filtroRol
        ? usuario.rol === this.filtroRol
        : true;

      const coincideEstado = this.filtroEstado
        ? usuario.estado === this.filtroEstado
        : true;

      const textoCompleto = `
        ${usuario.id}
        ${usuario.nombres}
        ${usuario.apellidos}
        ${usuario.cedula}
        ${usuario.correo}
        ${usuario.usuario}
        ${usuario.rol}
        ${usuario.cargo}
        ${usuario.area_unidad}
        ${usuario.dependencia}
        ${usuario.telefono_ext || ''}
        ${usuario.estado}
      `.toLowerCase();

      const coincideBusqueda = busqueda
        ? textoCompleto.includes(busqueda)
        : true;

      return coincideRol && coincideEstado && coincideBusqueda;
    });

    this.calcularResumen();
  }

  limpiarFiltros(): void {
    this.textoBusqueda = '';
    this.filtroRol = '';
    this.filtroEstado = '';
    this.aplicarFiltros();
  }

  calcularResumen(): void {
    this.totalUsuarios = this.usuarios.length;

    this.totalActivos = this.usuarios.filter(
      usuario => usuario.estado === 'activo'
    ).length;

    this.totalInactivos = this.usuarios.filter(
      usuario => usuario.estado === 'inactivo'
    ).length;

    this.totalAdministradores = this.usuarios.filter(
      usuario => usuario.rol === 'administrador'
    ).length;
  }

  abrirFormulario(): void {
    this.error = '';
    this.usuarioEditando = false;
    this.formulario = this.obtenerFormularioVacio();
    this.mostrarFormulario = true;
  }

  cerrarFormulario(): void {
    this.mostrarFormulario = false;
    this.usuarioEditando = false;
    this.formulario = this.obtenerFormularioVacio();
  }

  editarUsuario(usuario: UsuarioSistema): void {
    this.error = '';
    this.usuarioEditando = true;

    this.formulario = {
      id: usuario.id,
      nombres: usuario.nombres || '',
      apellidos: usuario.apellidos || '',
      cedula: usuario.cedula || '',
      correo: usuario.correo || '',
      usuario: usuario.usuario || '',
      password: '',
      rol: usuario.rol || '',
      cargo: usuario.cargo || '',
      area_unidad: usuario.area_unidad || '',
      dependencia: usuario.dependencia || '',
      telefono_ext: usuario.telefono_ext || '',
      estado: usuario.estado || 'activo'
    };

    this.mostrarFormulario = true;

    setTimeout(() => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }, 100);
  }

  guardarUsuario(): void {
    this.generarUsuarioAutomatico();

    const validacion = this.validarFormulario();

    if (validacion) {
      this.mostrarError('Formulario inválido', validacion);
      return;
    }

    this.guardando = true;
    this.error = '';

    const payload = this.prepararPayload();

    if (this.usuarioEditando && this.formulario.id) {
      this.actualizarUsuario(this.formulario.id, payload);
      return;
    }

    this.crearUsuario(payload);
  }

  crearUsuario(payload: any): void {
    this.http.post<any>(
      this.API_URL,
      payload,
      {
        headers: this.getHeaders()
      }
    ).subscribe({
      next: (response) => {
        this.guardando = false;

        Swal.fire({
          title: 'Usuario registrado',
          text: response.mensaje || 'El usuario fue registrado correctamente.',
          icon: 'success',
          confirmButtonText: 'Entendido',
          confirmButtonColor: '#1d4ed8'
        });

        this.cerrarFormulario();
        this.cargarUsuarios();
      },
      error: (err) => {
        this.guardando = false;

        if (err.status === 401 || err.status === 403) {
          this.authService.logout();
          this.router.navigate(['/auth/login']);
          return;
        }

        this.mostrarError(
          'No se pudo registrar',
          err.error?.mensaje || 'No se pudo registrar el usuario.'
        );
      }
    });
  }

  actualizarUsuario(id: number, payload: any): void {
    this.http.put<any>(
      `${this.API_URL}/${id}`,
      payload,
      {
        headers: this.getHeaders()
      }
    ).subscribe({
      next: (response) => {
        this.guardando = false;

        Swal.fire({
          title: 'Usuario actualizado',
          text: response.mensaje || 'El usuario fue actualizado correctamente.',
          icon: 'success',
          confirmButtonText: 'Entendido',
          confirmButtonColor: '#1d4ed8'
        });

        this.cerrarFormulario();
        this.cargarUsuarios();
      },
      error: (err) => {
        this.guardando = false;

        if (err.status === 401 || err.status === 403) {
          this.authService.logout();
          this.router.navigate(['/auth/login']);
          return;
        }

        this.mostrarError(
          'No se pudo actualizar',
          err.error?.mensaje || 'No se pudo actualizar el usuario.'
        );
      }
    });
  }

  async cambiarEstadoUsuario(usuario: UsuarioSistema): Promise<void> {
    const nuevoEstado = usuario.estado === 'activo' ? 'inactivo' : 'activo';
    const accion = nuevoEstado === 'activo' ? 'activar' : 'desactivar';

    const resultado = await Swal.fire({
      title: `¿Desea ${accion} este usuario?`,
      html: `
        <div style="text-align:center">
          <p style="margin:0 0 10px;color:#475569;">
            Usuario seleccionado:
          </p>

          <strong style="color:#1d4ed8;font-size:17px;">
            ${usuario.nombres} ${usuario.apellidos}
          </strong>

          <p style="margin:10px 0 0;color:#64748b;">
            Cuenta: ${usuario.usuario}
          </p>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: `Sí, ${accion}`,
      cancelButtonText: 'Cancelar',
      confirmButtonColor: nuevoEstado === 'activo' ? '#15803d' : '#dc2626',
      cancelButtonColor: '#64748b',
      reverseButtons: true
    });

    if (!resultado.isConfirmed) {
      return;
    }

    this.http.put<any>(
      `${this.API_URL}/${usuario.id}/estado`,
      {
        estado: nuevoEstado
      },
      {
        headers: this.getHeaders()
      }
    ).subscribe({
      next: (response) => {
        Swal.fire({
          title: 'Estado actualizado',
          text: response.mensaje || `El usuario fue ${nuevoEstado === 'activo' ? 'activado' : 'desactivado'} correctamente.`,
          icon: 'success',
          confirmButtonText: 'Entendido',
          confirmButtonColor: '#1d4ed8'
        });

        this.cargarUsuarios();
      },
      error: (err) => {
        if (err.status === 401 || err.status === 403) {
          this.authService.logout();
          this.router.navigate(['/auth/login']);
          return;
        }

        this.mostrarError(
          'No se pudo cambiar el estado',
          err.error?.mensaje || 'No se pudo actualizar el estado del usuario.'
        );
      }
    });
  }

  prepararPayload(): any {
    this.generarUsuarioAutomatico();

    const payload: any = {
      nombres: this.normalizarTexto(this.formulario.nombres),
      apellidos: this.normalizarTexto(this.formulario.apellidos),
      cedula: this.formulario.cedula.trim(),
      correo: this.formulario.correo.trim().toLowerCase(),
      usuario: this.formulario.usuario.trim().toLowerCase(),
      rol: this.formulario.rol,
      cargo: this.normalizarTexto(this.formulario.cargo),
      area_unidad: this.normalizarTexto(this.formulario.area_unidad),
      dependencia: this.normalizarTexto(this.formulario.dependencia),
      telefono_ext: this.formulario.telefono_ext.trim(),
      estado: this.formulario.estado
    };

    if (this.formulario.password.trim()) {
      payload.password = this.formulario.password.trim();
    }

    return payload;
  }

  validarFormulario(): string {
    const f = this.formulario;

    const nombres = this.normalizarTexto(f.nombres);
    const apellidos = this.normalizarTexto(f.apellidos);
    const cedula = f.cedula.trim();
    const correo = f.correo.trim().toLowerCase();
    const usuario = f.usuario.trim().toLowerCase();
    const password = f.password.trim();

    if (!nombres || nombres.length < 2) {
      return 'Ingrese los nombres del usuario.';
    }

    if (!this.validarSoloLetras(nombres)) {
      return 'Los nombres solo deben contener letras y espacios.';
    }

    if (!apellidos || apellidos.length < 2) {
      return 'Ingrese los apellidos del usuario.';
    }

    if (!this.validarSoloLetras(apellidos)) {
      return 'Los apellidos solo deben contener letras y espacios.';
    }

    if (!/^\d{10}$/.test(cedula)) {
      return 'La cédula debe tener exactamente 10 números.';
    }

    if (this.cedulaDuplicada()) {
      return 'Ya existe un usuario registrado con esta cédula.';
    }

    if (!this.validarCorreo(correo)) {
      return 'Ingrese un correo válido.';
    }

    if (this.correoDuplicado()) {
      return 'Ya existe un usuario registrado con este correo.';
    }

    if (!usuario) {
      return 'No se pudo generar el nombre de usuario. Verifique nombres y apellidos.';
    }

    if (this.usuarioDuplicado()) {
      this.generarUsuarioAutomatico(true);
    }

    if (!this.usuarioEditando && !password) {
      return 'Ingrese una contraseña para el nuevo usuario.';
    }

    if (password && password.length < 8) {
      return 'La contraseña debe tener mínimo 8 caracteres.';
    }

    if (!f.rol) {
      return 'Seleccione un rol.';
    }

    if (!f.estado) {
      return 'Seleccione un estado.';
    }

    if (!f.cargo.trim() || f.cargo.trim().length < 3) {
      return 'Ingrese el cargo del usuario.';
    }

    if (!f.area_unidad.trim() || f.area_unidad.trim().length < 3) {
      return 'Ingrese el área o unidad del usuario.';
    }

    if (!f.dependencia.trim() || f.dependencia.trim().length < 3) {
      return 'Ingrese la dependencia del usuario.';
    }

    if (f.telefono_ext.trim() && !/^\d{1,10}$/.test(f.telefono_ext.trim())) {
      return 'El teléfono o extensión solo debe contener números, máximo 10 dígitos.';
    }

    return '';
  }

  // =====================================================
  // AUTOGENERAR USUARIO Y DUPLICADOS
  // =====================================================

  generarUsuarioAutomatico(forzarUnico: boolean = false): void {
    const nombres = this.normalizarTexto(this.formulario.nombres);
    const apellidos = this.normalizarTexto(this.formulario.apellidos);

    if (!nombres || !apellidos) {
      this.formulario.usuario = '';
      return;
    }

    const primerNombre = nombres.split(' ')[0] || '';
    const primerApellido = apellidos.split(' ')[0] || '';

    if (!primerNombre || !primerApellido) {
      this.formulario.usuario = '';
      return;
    }

    const baseUsuario = this.limpiarParaUsuario(
      `${primerNombre.charAt(0)}${primerApellido}`
    );

    if (!baseUsuario) {
      this.formulario.usuario = '';
      return;
    }

    this.formulario.usuario = this.obtenerUsuarioUnico(baseUsuario, forzarUnico);
  }

  obtenerUsuarioUnico(baseUsuario: string, forzarUnico: boolean = true): string {
    let usuarioGenerado = baseUsuario;
    let contador = 2;

    while (this.existeUsuario(usuarioGenerado)) {
      usuarioGenerado = `${baseUsuario}${contador}`;
      contador++;
    }

    return usuarioGenerado;
  }

  existeUsuario(usuario: string): boolean {
    const usuarioNormalizado = usuario.trim().toLowerCase();
    const idActual = this.formulario.id;

    return this.usuarios.some((item) => {
      if (idActual && item.id === idActual) {
        return false;
      }

      return (item.usuario || '').trim().toLowerCase() === usuarioNormalizado;
    });
  }

  cedulaDuplicada(): boolean {
    const cedula = this.formulario.cedula.trim();
    const idActual = this.formulario.id;

    if (!cedula || cedula.length !== 10) {
      return false;
    }

    return this.usuarios.some((item) => {
      if (idActual && item.id === idActual) {
        return false;
      }

      return (item.cedula || '').trim() === cedula;
    });
  }

  correoDuplicado(): boolean {
    const correo = this.formulario.correo.trim().toLowerCase();
    const idActual = this.formulario.id;

    if (!correo || !this.validarCorreo(correo)) {
      return false;
    }

    return this.usuarios.some((item) => {
      if (idActual && item.id === idActual) {
        return false;
      }

      return (item.correo || '').trim().toLowerCase() === correo;
    });
  }

  usuarioDuplicado(): boolean {
    const usuario = this.formulario.usuario.trim().toLowerCase();
    const idActual = this.formulario.id;

    if (!usuario) {
      return false;
    }

    return this.usuarios.some((item) => {
      if (idActual && item.id === idActual) {
        return false;
      }

      return (item.usuario || '').trim().toLowerCase() === usuario;
    });
  }

  formularioTieneDuplicados(): boolean {
    return this.cedulaDuplicada() || this.correoDuplicado();
  }

  // =====================================================
  // LIMPIEZA Y VALIDACIÓN DE CAMPOS
  // =====================================================

  limpiarTextoCampo(campo: keyof UsuarioFormulario): void {
    const valor = String(this.formulario[campo] || '');

    const limpio = valor
      .replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñÜü0-9.,()\/\- ]/g, '')
      .replace(/\s{2,}/g, ' ');

    (this.formulario[campo] as string) = limpio;
  }

  limpiarSoloNumeros(campo: keyof UsuarioFormulario, maximo: number): void {
    const valor = String(this.formulario[campo] || '');
    const limpio = valor.replace(/\D/g, '').slice(0, maximo);

    (this.formulario[campo] as string) = limpio;
  }

  limpiarCorreo(): void {
    this.formulario.correo = this.formulario.correo
      .trim()
      .toLowerCase()
      .replace(/\s/g, '');
  }

  limpiarParaUsuario(texto: string): string {
    return texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/ñ/g, 'n')
      .replace(/[^a-z0-9]/g, '');
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

    if (!/^\d$/.test(event.key)) {
      event.preventDefault();
    }
  }

  validarSoloLetras(texto: string): boolean {
    return /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü ]+$/.test(texto.trim());
  }

  validarCorreo(correo: string): boolean {
    const patronCorreo = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return patronCorreo.test(correo.trim());
  }

  normalizarTexto(texto: string): string {
    return String(texto || '').trim().replace(/\s+/g, ' ');
  }

  getRolTexto(rol: string): string {
    const roles: Record<string, string> = {
      administrador: 'Administrador',
      jefe_inmediato: 'Jefe inmediato',
      maxima_autoridad: 'Máxima autoridad',
      analista_tics: 'Analista TICS'
    };

    return roles[rol] || rol;
  }

  getRolClase(rol: string): string {
    const clases: Record<string, string> = {
      administrador: 'administrador',
      jefe_inmediato: 'jefe',
      maxima_autoridad: 'autoridad',
      analista_tics: 'tics'
    };

    return clases[rol] || 'normal';
  }

  mostrarError(titulo: string, mensaje: string): void {
    Swal.fire({
      title: titulo,
      text: mensaje,
      icon: 'error',
      confirmButtonText: 'Entendido',
      confirmButtonColor: '#dc2626'
    });
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }
}