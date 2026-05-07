import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import {
  SeguimientoResponse,
  SolicitudPublicaService
} from '../../services/solicitud-publica.service';

@Component({
  selector: 'app-seguimiento-solicitud',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './seguimiento-solicitud.html',
  styleUrl: './seguimiento-solicitud.scss'
})
export class SeguimientoSolicitud {

  codigo = '';
  cargando = false;
  error = '';
  resultado: SeguimientoResponse | null = null;

  constructor(private solicitudService: SolicitudPublicaService) {}

  limpiarCodigo(): void {
    this.codigo = this.codigo
      .toUpperCase()
      .replace(/\s/g, '')
      .replace(/[^A-Z0-9-]/g, '')
      .slice(0, 30);
  }

  consultar(): void {
    this.error = '';
    this.resultado = null;

    const codigoLimpio = this.codigo.trim().toUpperCase();

    if (!codigoLimpio) {
      this.error = 'Ingrese el código de solicitud.';
      return;
    }

    if (!/^INAMHI-WEB-\d{4}-\d{4}$/.test(codigoLimpio)) {
      this.error = 'El código debe tener el formato INAMHI-WEB-2026-0001.';
      return;
    }

    this.cargando = true;

    this.solicitudService.consultarSeguimiento(codigoLimpio).subscribe({
      next: (response) => {
        this.cargando = false;
        this.resultado = response;
      },
      error: (err) => {
        this.cargando = false;

        if (err.error?.mensaje) {
          this.error = err.error.mensaje;
          return;
        }

        this.error = 'No se pudo consultar la solicitud. Verifique la conexión con el servidor.';
      }
    });
  }

  getEstadoTexto(estado: string): string {
    const estados: Record<string, string> = {
      pendiente_firma_solicitante: 'Pendiente de firma del solicitante',
      pendiente_jefe_inmediato: 'Pendiente de aprobación del jefe inmediato',
      rechazada_jefe_inmediato: 'Rechazada por jefe inmediato',
      pendiente_maxima_autoridad: 'Pendiente de máxima autoridad',
      rechazada_maxima_autoridad: 'Rechazada por máxima autoridad',
      pendiente_tics: 'Pendiente de validación TICS',
      rechazada_tics: 'Rechazada por TICS',
      pendiente_ejecucion_tics: 'Pendiente de ejecución TICS',
      finalizada: 'Finalizada',
      anulada: 'Anulada'
    };

    return estados[estado] || estado;
  }

  getEtapaTexto(etapa: string): string {
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

  getEstadoClase(estado: string): string {
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
}