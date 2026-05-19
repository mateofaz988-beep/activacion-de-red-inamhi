import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-inicio',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink
  ],
  templateUrl: './inicio.html',
  styleUrl: './inicio.scss'
})
export class Inicio {

  constructor(private router: Router) {}

  /**
   * Envía al usuario a la nueva ventana donde podrá elegir
   * entre proceso manual o proceso electrónico.
   */
  irASeleccionProceso(): void {
    this.router.navigate(['/seleccionar-proceso']);
  }

  /**
   * Envía al usuario a la ventana pública de seguimiento.
   */
  irASeguimiento(): void {
    this.router.navigate(['/public/seguimiento']);
  }

  /**
   * Envía al usuario al login administrativo.
   */
  irALoginAdmin(): void {
    this.router.navigate(['/auth/login']);
  }
}