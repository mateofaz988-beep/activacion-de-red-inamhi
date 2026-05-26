import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class Login implements OnInit {

  usuario: string = '';
  password: string = '';

  cargando: boolean = false;
  error: string = '';

  mostrarPassword: boolean = false;
  recordarUsuario: boolean = false;
  capsLockActivo: boolean = false;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const usuarioGuardado = localStorage.getItem('login_recordar_usuario');

    if (usuarioGuardado) {
      this.usuario = usuarioGuardado;
      this.recordarUsuario = true;
    }
  }

  toggleMostrarPassword(): void {
    this.mostrarPassword = !this.mostrarPassword;
  }

  detectarCapsLock(event: KeyboardEvent): void {
    if (event.getModifierState) {
      this.capsLockActivo = event.getModifierState('CapsLock');
    }
  }

  ingresar(): void {
    this.error = '';

    const usuarioTrimmed = this.usuario.trim();
    const passwordTrimmed = this.password.trim();

    if (!usuarioTrimmed) {
      this.error = 'Ingrese su usuario institucional.';
      return;
    }

    if (!passwordTrimmed) {
      this.error = 'Ingrese su contraseña.';
      return;
    }

    if (this.recordarUsuario) {
      localStorage.setItem('login_recordar_usuario', usuarioTrimmed);
    } else {
      localStorage.removeItem('login_recordar_usuario');
    }

    this.cargando = true;

    this.authService.login({
      usuario: usuarioTrimmed,
      password: passwordTrimmed
    }).subscribe({
      next: (response) => {
        this.cargando = false;

        const rol = response.usuario.rol;

        if (rol === 'administrador') {
          this.router.navigate(['/admin/dashboard']);
          return;
        }

        if (rol === 'jefe_inmediato') {
          this.router.navigate(['/jefe/dashboard']);
          return;
        }

        if (rol === 'maxima_autoridad') {
          this.router.navigate(['/autoridad/dashboard']);
          return;
        }

        if (rol === 'analista_tics') {
          this.router.navigate(['/tics/dashboard']);
          return;
        }

        this.router.navigate(['/']);
      },
      error: (err) => {
        this.cargando = false;

        if (err.error && err.error.mensaje) {
          this.error = err.error.mensaje;
        } else {
          this.error = 'No se pudo conectar con el servidor. Intente nuevamente.';
        }
      }
    });
  }
}
