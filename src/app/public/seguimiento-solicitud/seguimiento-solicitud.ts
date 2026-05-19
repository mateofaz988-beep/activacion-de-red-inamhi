import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import {
  SeguimientoResponse,
  SolicitudPublicaService
} from '../../services/solicitud-publica.service';

interface SolicitudManual {
  uuid_solicitud: string;
  nombres: string;
  apellidos: string;
  correo: string;
  estado: 'DESCARGADO' | 'PENDIENTE_SUBIDA' | 'FINALIZADO' | string;
}

interface ManualValidarResponse {
  estado: string;
  mensaje: string;
  solicitud: SolicitudManual;
  habilitar_subida: boolean;
}

interface ManualSubidaResponse {
  estado: string;
  mensaje: string;
}

@Component({
  selector: 'app-seguimiento-solicitud',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './seguimiento-solicitud.html',
  styleUrl: './seguimiento-solicitud.scss'
})
export class SeguimientoSolicitud {

  /*
    LOCAL:
    http://localhost:5050/api

    SERVIDOR CON NGINX:
    /api
  */
  private readonly API_URL = 'http://localhost:5050/api';

  codigo = '';

  cargando = false;
  error = '';

  resultado: SeguimientoResponse | null = null;
  resultadoManual: SolicitudManual | null = null;

  archivoManual: File | null = null;
  nombreArchivoManual = '';

  subiendoManual = false;
  errorArchivoManual = '';
  exitoManual = '';

  constructor(
    private solicitudService: SolicitudPublicaService,
    private http: HttpClient
  ) {}

  limpiarCodigo(): void {
    this.codigo = this.codigo
      .toUpperCase()
      .replace(/\s/g, '')
      .replace(/[^A-Z0-9-]/g, '')
      .slice(0, 35);
  }

  consultar(): void {
    this.error = '';
    this.exitoManual = '';
    this.errorArchivoManual = '';
    this.resultado = null;
    this.resultadoManual = null;
    this.archivoManual = null;
    this.nombreArchivoManual = '';

    const codigoLimpio = this.codigo.trim().toUpperCase();

    if (!codigoLimpio) {
      this.error = 'Ingrese el código de solicitud.';
      return;
    }

    if (this.esCodigoManual(codigoLimpio)) {
      this.consultarManual(codigoLimpio);
      return;
    }

    if (this.esCodigoElectronico(codigoLimpio)) {
      this.consultarElectronico(codigoLimpio);
      return;
    }

    this.error = 'Código inválido. Use un código manual como MAN-65CA1D9A o un código electrónico como INAMHI-WEB-2026-0001.';
  }

  private consultarManual(codigoManual: string): void {
    this.cargando = true;

    this.http.get<ManualValidarResponse>(`${this.API_URL}/manual/validar/${codigoManual}`)
      .subscribe({
        next: (response) => {
          this.cargando = false;

          if (response.estado !== 'ok') {
            this.error = response.mensaje || 'No se pudo validar la solicitud manual.';
            return;
          }

          this.resultadoManual = response.solicitud;
        },
        error: (err) => {
          this.cargando = false;

          if (err.status === 0) {
            this.error = 'No se pudo conectar con el servidor.';
            return;
          }

          this.error = err.error?.mensaje || 'No se encontró una solicitud manual con ese ID.';
        }
      });
  }

  private consultarElectronico(codigoElectronico: string): void {
    this.cargando = true;

    this.solicitudService.consultarSeguimiento(codigoElectronico).subscribe({
      next: (response) => {
        this.cargando = false;
        this.resultado = response;
      },
      error: (err) => {
        this.cargando = false;

        if (err.status === 0) {
          this.error = 'No se pudo conectar con el servidor.';
          return;
        }

        if (err.error?.mensaje) {
          this.error = err.error.mensaje;
          return;
        }

        this.error = 'No se pudo consultar la solicitud. Verifique la conexión con el servidor.';
      }
    });
  }

  esCodigoManual(codigo: string): boolean {
    return /^MAN-[A-Z0-9]{8}$/.test(codigo);
  }

  esCodigoElectronico(codigo: string): boolean {
    return /^INAMHI-WEB-\d{4}-\d{4}$/.test(codigo);
  }

  seleccionarArchivoManual(event: Event): void {
    this.errorArchivoManual = '';
    this.exitoManual = '';
    this.archivoManual = null;
    this.nombreArchivoManual = '';

    const input = event.target as HTMLInputElement;

    if (!input.files || input.files.length === 0) {
      return;
    }

    const archivo = input.files[0];

    const nombre = archivo.name.toLowerCase();
    const esPdfPorExtension = nombre.endsWith('.pdf');
    const esPdfPorMime = archivo.type === 'application/pdf' || archivo.type === '';

    if (!esPdfPorExtension || !esPdfPorMime) {
      this.errorArchivoManual = 'Solo se permite subir documentos en formato PDF.';
      input.value = '';
      return;
    }

    const maxMb = 10;
    const maxBytes = maxMb * 1024 * 1024;

    if (archivo.size > maxBytes) {
      this.errorArchivoManual = `El archivo no puede superar ${maxMb} MB.`;
      input.value = '';
      return;
    }

    this.archivoManual = archivo;
    this.nombreArchivoManual = archivo.name;
  }

  subirDocumentoManual(): void {
    this.errorArchivoManual = '';
    this.exitoManual = '';

    if (!this.resultadoManual) {
      this.errorArchivoManual = 'Primero debe validar el ID manual.';
      return;
    }

    if (this.resultadoManual.estado === 'FINALIZADO') {
      this.errorArchivoManual = 'Esta solicitud manual ya fue finalizada.';
      return;
    }

    if (!this.archivoManual) {
      this.errorArchivoManual = 'Debe seleccionar el PDF escaneado y firmado.';
      return;
    }

    const confirmar = window.confirm(
      'Confirme que el documento PDF ya está completamente lleno y firmado físicamente por el solicitante, jefe inmediato, máxima autoridad y TICS. Al subirlo, el proceso manual quedará FINALIZADO.'
    );

    if (!confirmar) {
      return;
    }

    const formData = new FormData();
    formData.append('archivo', this.archivoManual);

    this.subiendoManual = true;

    this.http.post<ManualSubidaResponse>(
      `${this.API_URL}/manual/${this.resultadoManual.uuid_solicitud}/subir`,
      formData
    ).subscribe({
      next: (response) => {
        this.subiendoManual = false;

        if (response.estado !== 'ok') {
          this.errorArchivoManual = response.mensaje || 'No se pudo subir el documento manual.';
          return;
        }

        this.exitoManual = 'Documento manual subido correctamente. El proceso quedó FINALIZADO.';
        this.resultadoManual = {
          ...this.resultadoManual!,
          estado: 'FINALIZADO'
        };

        this.archivoManual = null;
        this.nombreArchivoManual = '';
      },
      error: (err) => {
        this.subiendoManual = false;

        if (err.status === 0) {
          this.errorArchivoManual = 'No se pudo conectar con el servidor.';
          return;
        }

        this.errorArchivoManual = err.error?.mensaje || 'No se pudo subir el documento manual.';
      }
    });
  }

  getEstadoManualTexto(estado: string): string {
    const estados: Record<string, string> = {
      DESCARGADO: 'Documento descargado',
      PENDIENTE_SUBIDA: 'Pendiente de subir documento firmado',
      FINALIZADO: 'Finalizado'
    };

    return estados[estado] || estado;
  }

  getEstadoManualClase(estado: string): string {
    if (estado === 'FINALIZADO') {
      return 'finalizada';
    }

    return 'pendiente';
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