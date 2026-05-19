import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

interface RespuestaManual {
  estado: string;
  mensaje: string;
  uuid_solicitud: string;
  fecha: string;
  hora: string;
  url_descarga: string;
}

@Component({
  selector: 'app-seleccionar-proceso',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink
  ],
  templateUrl: './seleccionar-proceso.html',
  styleUrl: './seleccionar-proceso.scss'
})
export class SeleccionarProceso {

  private readonly API_URL = 'http://localhost:5050/api';

  modalManualAbierto = false;

  cargandoManual = false;
  errorManual = '';
  exitoManual = '';

  manualForm = {
    nombres: '',
    apellidos: '',
    correo: ''
  };

  solicitudManualGenerada: RespuestaManual | null = null;

  constructor(
    private router: Router,
    private http: HttpClient
  ) {}

  abrirModalManual(): void {
    this.modalManualAbierto = true;
    this.errorManual = '';
    this.exitoManual = '';
    this.solicitudManualGenerada = null;

    this.manualForm = {
      nombres: '',
      apellidos: '',
      correo: ''
    };
  }

  cerrarModalManual(): void {
    if (this.cargandoManual) {
      return;
    }

    this.modalManualAbierto = false;
    this.errorManual = '';
    this.exitoManual = '';
  }

  irProcesoElectronico(): void {
    this.router.navigate(['/public/solicitud']);
  }

  volverInicio(): void {
    this.router.navigate(['/']);
  }

  irSeguimiento(): void {
    this.router.navigate(['/public/seguimiento']);
  }

  validarCorreo(correo: string): boolean {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    return regex.test(correo.trim());
  }

  formularioManualValido(): boolean {
    const nombres = this.manualForm.nombres.trim();
    const apellidos = this.manualForm.apellidos.trim();
    const correo = this.manualForm.correo.trim();

    return (
      nombres.length >= 2 &&
      apellidos.length >= 2 &&
      this.validarCorreo(correo)
    );
  }

  generarSolicitudManual(): void {
    this.errorManual = '';
    this.exitoManual = '';
    this.solicitudManualGenerada = null;

    const nombres = this.manualForm.nombres.trim();
    const apellidos = this.manualForm.apellidos.trim();
    const correo = this.manualForm.correo.trim().toLowerCase();

    if (nombres.length < 2) {
      this.errorManual = 'Ingrese un nombre válido.';
      return;
    }

    if (apellidos.length < 2) {
      this.errorManual = 'Ingrese un apellido válido.';
      return;
    }

    if (!this.validarCorreo(correo)) {
      this.errorManual = 'Ingrese un correo electrónico válido.';
      return;
    }

    this.cargandoManual = true;

    const payload = {
      nombres,
      apellidos,
      correo
    };

    this.http.post<RespuestaManual>(`${this.API_URL}/manual/registrar`, payload)
      .subscribe({
        next: (response) => {
          this.cargandoManual = false;

          if (response.estado !== 'ok') {
            this.errorManual = response.mensaje || 'No se pudo generar la solicitud manual.';
            return;
          }

          this.solicitudManualGenerada = response;
          this.exitoManual = 'Solicitud manual generada correctamente. Guarde su ID y descargue el documento vacío.';

          this.descargarDocumentoManual();
        },
        error: (err) => {
          this.cargandoManual = false;

          if (err.status === 0) {
            this.errorManual = 'No se pudo conectar con el servidor.';
            return;
          }

          this.errorManual = err.error?.mensaje || 'No se pudo registrar la solicitud manual.';
        }
      });
  }

  descargarDocumentoManual(): void {
    if (!this.solicitudManualGenerada?.url_descarga) {
      return;
    }

    const url = this.normalizarUrlDescarga(this.solicitudManualGenerada.url_descarga);
    window.open(url, '_blank');
  }

  normalizarUrlDescarga(url: string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    return `${this.API_URL.replace('/api', '')}${url}`;
  }

  copiarId(): void {
    if (!this.solicitudManualGenerada?.uuid_solicitud) {
      return;
    }

    navigator.clipboard.writeText(this.solicitudManualGenerada.uuid_solicitud)
      .then(() => {
        this.exitoManual = 'ID copiado correctamente.';
      })
      .catch(() => {
        this.errorManual = 'No se pudo copiar el ID. Cópielo manualmente.';
      });
  }

  limpiarSoloLetras(campo: 'nombres' | 'apellidos'): void {
    this.manualForm[campo] = this.manualForm[campo]
      .replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, '')
      .replace(/\s+/g, ' ');
  }
}