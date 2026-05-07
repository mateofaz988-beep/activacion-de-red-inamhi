import { Component } from '@angular/core';
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
export class Login {

  usuario: string = '';
  password: string = '';

  cargando: boolean = false;
  error: string = '';

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  ingresar(): void {
    this.error = '';

    if (!this.usuario.trim()) {
      this.error = 'Ingrese su usuario institucional.';
      return;
    }

    if (!this.password.trim()) {
      this.error = 'Ingrese su contraseña.';
      return;
    }

    this.cargando = true;

    this.authService.login({
      usuario: this.usuario.trim(),
      password: this.password.trim()
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
          this.error = 'No se pudo conectar con el servidor.';
        }
      }
    });
  }
}