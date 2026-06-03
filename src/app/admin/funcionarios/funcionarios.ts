import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import Swal from 'sweetalert2';

import { AuthService } from '../../services/auth.service';

// =====================================================
// INTERFACES
// =====================================================

export interface Funcionario {
  id: number;
  nombres: string; apellidos: string;
  cedula: string | null; correo: string | null;
  cargo: string; tipo_responsable: string;
  estado: 'activo' | 'inactivo';
  area_id: number; area_nombre: string;
  direccion_id: number; direccion_nombre: string;
  usuario_id: number | null; usuario_sistema: string | null;
  created_at: string; updated_at: string;
}

export interface Direccion {
  id: number; nombre: string;
  estado: 'activo' | 'inactivo';
  created_at?: string; updated_at?: string;
}

export interface AreaEstructura {
  id: number; nombre: string;
  estado: 'activo' | 'inactivo';
  direccion_id: number; direccion_nombre: string;
  created_at?: string; updated_at?: string;
}

export interface CargoEstructura {
  id: number; nombre: string;
  estado: 'activo' | 'inactivo';
  area_id: number; area_nombre: string;
  direccion_nombre: string;
  created_at?: string; updated_at?: string;
}

// Catálogos para dropdowns
export interface CatDir  { id: number; nombre: string; }
export interface CatArea { id: number; nombre: string; direccion_id: number; }

type Vista = 'funcionarios' | 'direcciones' | 'areas' | 'cargos';

// =====================================================
// COMPONENTE
// =====================================================

import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-funcionarios',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive],
  templateUrl: './funcionarios.html',
  styleUrl: './funcionarios.scss'
})
export class Funcionarios implements OnInit {

  private readonly API = environment.apiUrl;

  vistaActiva: Vista = 'funcionarios';

  // ── catálogos para dropdowns ──────────────────────
  catDirecciones: CatDir[]  = [];
  catAreas: CatArea[]       = [];
  catAreasFiltradas: CatArea[] = [];

  // ─────────────────────────────────────────────────
  //  FUNCIONARIOS
  // ─────────────────────────────────────────────────
  funcionarios: Funcionario[]          = [];
  funcionariosFiltrados: Funcionario[] = [];
  cargandoFunc = false;
  errorFunc    = '';
  busqFunc = ''; filtroTipoFunc = ''; filtroEstFunc = '';
  totalFunc = 0; totalFuncAct = 0; totalFuncInact = 0; totalJefes = 0;

  mostrarModalFunc = false; modoEdFunc = false;
  mostrarConfFunc  = false; itemElimFunc: Funcionario | null = null;
  guardandoFunc    = false;
  erroresFunc: Record<string, string> = {};

  formFunc = this.funcVacio();

  // ─────────────────────────────────────────────────
  //  DIRECCIONES
  // ─────────────────────────────────────────────────
  direcciones: Direccion[]          = [];
  direccionesFiltradas: Direccion[] = [];
  cargandoDir = false;
  errorDir     = '';
  busqDir = ''; filtroEstDir = '';
  totalDir = 0; totalDirAct = 0;

  mostrarModalDir = false; modoEdDir = false;
  mostrarConfDir  = false; itemElimDir: Direccion | null = null;
  guardandoDir    = false;
  erroresDir: Record<string, string> = {};
  formDir = this.dirVacio();

  // ─────────────────────────────────────────────────
  //  ÁREAS
  // ─────────────────────────────────────────────────
  areas: AreaEstructura[]          = [];
  areasFiltradas: AreaEstructura[] = [];
  cargandoArea = false;
  errorArea     = '';
  busqArea = ''; filtroEstArea = ''; filtroDirArea = '';
  totalArea = 0; totalAreaAct = 0;

  mostrarModalArea = false; modoEdArea = false;
  mostrarConfArea  = false; itemElimArea: AreaEstructura | null = null;
  guardandoArea    = false;
  erroresArea: Record<string, string> = {};
  formArea = this.areaVacio();

  // ─────────────────────────────────────────────────
  //  CARGOS
  // ─────────────────────────────────────────────────
  cargos: CargoEstructura[]          = [];
  cargosFiltrados: CargoEstructura[] = [];
  cargandoCargo = false;
  errorCargo     = '';
  busqCargo = ''; filtroEstCargo = ''; filtroAreaCargo = '';
  totalCargo = 0; totalCargoAct = 0;

  mostrarModalCargo = false; modoEdCargo = false;
  mostrarConfCargo  = false; itemElimCargo: CargoEstructura | null = null;
  guardandoCargo    = false;
  erroresCargo: Record<string, string> = {};
  formCargo = this.cargoVacio();

  // ── áreas filtradas por dirección en el form de área/cargo ──
  areasFormArea: CatArea[]  = [];
  areasFormCargo: CatArea[] = [];

  constructor(
    private http: HttpClient,
    private router: Router,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.cargarCatalogos();
    this.cambiarVista('funcionarios');
  }

  // =====================================================
  // HEADERS
  // =====================================================

  private h(): HttpHeaders {
    return new HttpHeaders({
      Authorization: `Bearer ${localStorage.getItem('auth_token_liberacion_web') || ''}`
    });
  }

  // =====================================================
  // CATÁLOGOS (para dropdowns)
  // =====================================================

  cargarCatalogos(): void {
    this.http.get<any>(`${this.API}/admin/catalogo/direcciones`, { headers: this.h() })
      .subscribe({ next: r => { if (r.estado === 'ok') { this.catDirecciones = r.direcciones; } } });
    this.http.get<any>(`${this.API}/admin/catalogo/areas`, { headers: this.h() })
      .subscribe({ next: r => { if (r.estado === 'ok') { this.catAreas = r.areas; } } });
  }

  // =====================================================
  // NAVEGACIÓN POR TABS
  // =====================================================

  cambiarVista(v: Vista): void {
    this.vistaActiva = v;
    if (v === 'funcionarios') this.cargarFuncionarios();
    if (v === 'direcciones')  this.cargarDirecciones();
    if (v === 'areas')        this.cargarAreas();
    if (v === 'cargos')       this.cargarCargos();
  }

  // =====================================================
  // ██ FUNCIONARIOS ██
  // =====================================================

  cargarFuncionarios(): void {
    this.cargandoFunc = true; this.errorFunc = '';
    const qs = this.buildQs({ q: this.busqFunc, tipo: this.filtroTipoFunc, estado: this.filtroEstFunc });
    this.http.get<any>(`${this.API}/admin/funcionarios${qs}`, { headers: this.h() }).subscribe({
      next: r => {
        this.cargandoFunc = false;
        if (r.estado === 'ok') {
          this.funcionarios = r.funcionarios;
          this.filtrarFuncionarios();
          this.calcResumenFunc();
        } else { this.errorFunc = r.mensaje; }
      },
      error: err => {
        this.cargandoFunc = false;
        if (err.status === 401) { this.authService.logout(); this.router.navigate(['/auth/login']); return; }
        this.errorFunc = err.error?.mensaje || 'Error al cargar personal.';
      }
    });
  }

  filtrarFuncionarios(): void {
    const q = this.busqFunc.toLowerCase();
    this.funcionariosFiltrados = this.funcionarios.filter(f =>
      (!q || [f.nombres, f.apellidos, f.cedula ?? '', f.cargo, f.area_nombre, f.direccion_nombre]
        .some(v => v.toLowerCase().includes(q))) &&
      (!this.filtroTipoFunc || f.tipo_responsable === this.filtroTipoFunc) &&
      (!this.filtroEstFunc  || f.estado === this.filtroEstFunc)
    );
  }

  calcResumenFunc(): void {
    this.totalFunc     = this.funcionarios.length;
    this.totalFuncAct  = this.funcionarios.filter(f => f.estado === 'activo').length;
    this.totalFuncInact = this.funcionarios.filter(f => f.estado === 'inactivo').length;
    this.totalJefes    = this.funcionarios.filter(f => f.tipo_responsable === 'jefe_area').length;
  }

  abrirNuevoFunc(): void {
    this.formFunc = this.funcVacio(); this.erroresFunc = {};
    this.areasFormArea = [...this.catAreas];
    this.modoEdFunc = false; this.mostrarModalFunc = true;
  }

  abrirEditarFunc(f: Funcionario): void {
    this.formFunc = { id: f.id, nombres: f.nombres, apellidos: f.apellidos,
      cedula: f.cedula ?? '', correo: f.correo ?? '', cargo: f.cargo,
      tipo_responsable: f.tipo_responsable, area_id: f.area_id,
      direccion_id: f.direccion_id, estado: f.estado };
    this.areasFormArea = f.direccion_id
      ? this.catAreas.filter(a => a.direccion_id === f.direccion_id)
      : [...this.catAreas];
    this.erroresFunc = {}; this.modoEdFunc = true; this.mostrarModalFunc = true;
  }

  cerrarModalFunc(): void { this.mostrarModalFunc = false; this.formFunc = this.funcVacio(); this.erroresFunc = {}; }

  onDirFuncChange(): void {
    const dId = this.formFunc.direccion_id;
    this.areasFormArea = dId ? this.catAreas.filter(a => a.direccion_id === Number(dId)) : [...this.catAreas];
    this.formFunc.area_id = null;
  }

  guardarFunc(): void {
    this.erroresFunc = {};
    if (!this.formFunc.nombres?.trim() || this.formFunc.nombres.trim().length < 2) this.erroresFunc['nombres'] = 'Mínimo 2 caracteres.';
    if (!this.formFunc.apellidos?.trim() || this.formFunc.apellidos.trim().length < 2) this.erroresFunc['apellidos'] = 'Mínimo 2 caracteres.';
    if (!this.formFunc.cargo?.trim() || this.formFunc.cargo.trim().length < 3) this.erroresFunc['cargo'] = 'Mínimo 3 caracteres.';
    if (!this.formFunc.area_id) this.erroresFunc['area_id'] = 'Seleccione un área.';
    if (this.formFunc.cedula && !/^\d{10}$/.test(this.formFunc.cedula)) this.erroresFunc['cedula'] = 'La cédula debe tener 10 dígitos.';
    if (this.formFunc.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.formFunc.correo)) this.erroresFunc['correo'] = 'Correo inválido.';
    if (Object.keys(this.erroresFunc).length) return;

    this.guardandoFunc = true;
    const payload = {
      nombres: this.formFunc.nombres.trim().toUpperCase(),
      apellidos: this.formFunc.apellidos.trim().toUpperCase(),
      cedula: this.formFunc.cedula?.trim() || null,
      correo: this.formFunc.correo?.trim().toLowerCase() || null,
      cargo: this.formFunc.cargo.trim().toUpperCase(),
      tipo_responsable: this.formFunc.tipo_responsable,
      area_id: Number(this.formFunc.area_id),
      estado: this.formFunc.estado
    };
    const es_ed = this.modoEdFunc && this.formFunc.id != null;
    const url = es_ed ? `${this.API}/admin/funcionarios/${this.formFunc.id}` : `${this.API}/admin/funcionarios`;
    const req$ = es_ed ? this.http.put<any>(url, payload, { headers: this.h() }) : this.http.post<any>(url, payload, { headers: this.h() });
    req$.subscribe({
      next: r => {
        this.guardandoFunc = false;
        if (r.estado === 'ok') { this.cerrarModalFunc(); this.cargarFuncionarios(); this.ok(r.mensaje); }
      },
      error: err => { this.guardandoFunc = false; this.err(err.error?.mensaje || 'Error al guardar.'); }
    });
  }

  confirmarElimFunc(f: Funcionario): void { this.itemElimFunc = f; this.mostrarConfFunc = true; }
  cancelarElimFunc(): void { this.itemElimFunc = null; this.mostrarConfFunc = false; }
  ejecutarElimFunc(): void {
    if (!this.itemElimFunc) return;
    this.http.delete<any>(`${this.API}/admin/funcionarios/${this.itemElimFunc.id}`, { headers: this.h() }).subscribe({
      next: r => { this.cancelarElimFunc(); if (r.estado === 'ok') { this.cargarFuncionarios(); this.ok(r.mensaje); } },
      error: err => { this.cancelarElimFunc(); this.err(err.error?.mensaje || 'Error al eliminar.'); }
    });
  }

  // =====================================================
  // ██ DIRECCIONES ██
  // =====================================================

  cargarDirecciones(): void {
    this.cargandoDir = true; this.errorDir = '';
    const qs = this.buildQs({ q: this.busqDir });
    this.http.get<any>(`${this.API}/admin/estructura/direcciones${qs}`, { headers: this.h() }).subscribe({
      next: r => {
        this.cargandoDir = false;
        if (r.estado === 'ok') {
          this.direcciones = r.direcciones;
          this.filtrarDir();
          this.totalDir    = this.direcciones.length;
          this.totalDirAct = this.direcciones.filter(d => d.estado === 'activo').length;
        } else { this.errorDir = r.mensaje; }
      },
      error: err => { this.cargandoDir = false; this.errorDir = err.error?.mensaje || 'Error al cargar.'; }
    });
  }

  filtrarDir(): void {
    const q = this.busqDir.toLowerCase();
    this.direccionesFiltradas = this.direcciones.filter(d =>
      (!q || d.nombre.toLowerCase().includes(q)) &&
      (!this.filtroEstDir || d.estado === this.filtroEstDir)
    );
  }

  abrirNuevoDir(): void { this.formDir = this.dirVacio(); this.erroresDir = {}; this.modoEdDir = false; this.mostrarModalDir = true; }
  abrirEditarDir(d: Direccion): void { this.formDir = { id: d.id, nombre: d.nombre, estado: d.estado }; this.erroresDir = {}; this.modoEdDir = true; this.mostrarModalDir = true; }
  cerrarModalDir(): void { this.mostrarModalDir = false; this.formDir = this.dirVacio(); this.erroresDir = {}; }

  guardarDir(): void {
    this.erroresDir = {};
    if (!this.formDir.nombre?.trim() || this.formDir.nombre.trim().length < 3) { this.erroresDir['nombre'] = 'Mínimo 3 caracteres.'; return; }
    this.guardandoDir = true;
    const payload = { nombre: this.formDir.nombre.trim().toUpperCase(), estado: this.formDir.estado };
    const es_ed = this.modoEdDir && this.formDir.id != null;
    const url = es_ed ? `${this.API}/admin/estructura/direcciones/${this.formDir.id}` : `${this.API}/admin/estructura/direcciones`;
    const req$ = es_ed ? this.http.put<any>(url, payload, { headers: this.h() }) : this.http.post<any>(url, payload, { headers: this.h() });
    req$.subscribe({
      next: r => {
        this.guardandoDir = false;
        if (r.estado === 'ok') { this.cerrarModalDir(); this.cargarDirecciones(); this.cargarCatalogos(); this.ok(r.mensaje); }
      },
      error: err => { this.guardandoDir = false; this.err(err.error?.mensaje || 'Error al guardar.'); }
    });
  }

  confirmarElimDir(d: Direccion): void { this.itemElimDir = d; this.mostrarConfDir = true; }
  cancelarElimDir(): void { this.itemElimDir = null; this.mostrarConfDir = false; }
  ejecutarElimDir(): void {
    if (!this.itemElimDir) return;
    this.http.delete<any>(`${this.API}/admin/estructura/direcciones/${this.itemElimDir.id}`, { headers: this.h() }).subscribe({
      next: r => { this.cancelarElimDir(); if (r.estado === 'ok') { this.cargarDirecciones(); this.cargarCatalogos(); this.ok(r.mensaje); } },
      error: err => { this.cancelarElimDir(); this.err(err.error?.mensaje || 'No se puede eliminar.'); }
    });
  }

  // =====================================================
  // ██ ÁREAS ██
  // =====================================================

  cargarAreas(): void {
    this.cargandoArea = true; this.errorArea = '';
    const qs = this.buildQs({ q: this.busqArea, direccion_id: this.filtroDirArea });
    this.http.get<any>(`${this.API}/admin/estructura/areas${qs}`, { headers: this.h() }).subscribe({
      next: r => {
        this.cargandoArea = false;
        if (r.estado === 'ok') {
          this.areas = r.areas;
          this.filtrarAreas();
          this.totalArea    = this.areas.length;
          this.totalAreaAct = this.areas.filter(a => a.estado === 'activo').length;
        } else { this.errorArea = r.mensaje; }
      },
      error: err => { this.cargandoArea = false; this.errorArea = err.error?.mensaje || 'Error al cargar.'; }
    });
  }

  filtrarAreas(): void {
    const q = this.busqArea.toLowerCase();
    this.areasFiltradas = this.areas.filter(a =>
      (!q || a.nombre.toLowerCase().includes(q) || a.direccion_nombre.toLowerCase().includes(q)) &&
      (!this.filtroEstArea  || a.estado === this.filtroEstArea) &&
      (!this.filtroDirArea  || a.direccion_id === Number(this.filtroDirArea))
    );
  }

  abrirNuevoArea(): void { this.formArea = this.areaVacio(); this.erroresArea = {}; this.areasFormArea = [...this.catAreas]; this.modoEdArea = false; this.mostrarModalArea = true; }
  abrirEditarArea(a: AreaEstructura): void {
    this.formArea = { id: a.id, nombre: a.nombre, estado: a.estado, direccion_id: a.direccion_id };
    this.erroresArea = {}; this.modoEdArea = true; this.mostrarModalArea = true;
  }
  cerrarModalArea(): void { this.mostrarModalArea = false; this.formArea = this.areaVacio(); this.erroresArea = {}; }

  guardarArea(): void {
    this.erroresArea = {};
    if (!this.formArea.nombre?.trim() || this.formArea.nombre.trim().length < 2) { this.erroresArea['nombre'] = 'Mínimo 2 caracteres.'; }
    if (!this.formArea.direccion_id) { this.erroresArea['direccion_id'] = 'Seleccione una dirección.'; }
    if (Object.keys(this.erroresArea).length) return;
    this.guardandoArea = true;
    const payload = { nombre: this.formArea.nombre.trim().toUpperCase(), direccion_id: Number(this.formArea.direccion_id), estado: this.formArea.estado };
    const es_ed = this.modoEdArea && this.formArea.id != null;
    const url = es_ed ? `${this.API}/admin/estructura/areas/${this.formArea.id}` : `${this.API}/admin/estructura/areas`;
    const req$ = es_ed ? this.http.put<any>(url, payload, { headers: this.h() }) : this.http.post<any>(url, payload, { headers: this.h() });
    req$.subscribe({
      next: r => {
        this.guardandoArea = false;
        if (r.estado === 'ok') { this.cerrarModalArea(); this.cargarAreas(); this.cargarCatalogos(); this.ok(r.mensaje); }
      },
      error: err => { this.guardandoArea = false; this.err(err.error?.mensaje || 'Error al guardar.'); }
    });
  }

  confirmarElimArea(a: AreaEstructura): void { this.itemElimArea = a; this.mostrarConfArea = true; }
  cancelarElimArea(): void { this.itemElimArea = null; this.mostrarConfArea = false; }
  ejecutarElimArea(): void {
    if (!this.itemElimArea) return;
    this.http.delete<any>(`${this.API}/admin/estructura/areas/${this.itemElimArea.id}`, { headers: this.h() }).subscribe({
      next: r => { this.cancelarElimArea(); if (r.estado === 'ok') { this.cargarAreas(); this.cargarCatalogos(); this.ok(r.mensaje); } },
      error: err => { this.cancelarElimArea(); this.err(err.error?.mensaje || 'No se puede eliminar.'); }
    });
  }

  // =====================================================
  // ██ CARGOS ██
  // =====================================================

  cargarCargos(): void {
    this.cargandoCargo = true; this.errorCargo = '';
    const qs = this.buildQs({ q: this.busqCargo, area_id: this.filtroAreaCargo });
    this.http.get<any>(`${this.API}/admin/estructura/cargos${qs}`, { headers: this.h() }).subscribe({
      next: r => {
        this.cargandoCargo = false;
        if (r.estado === 'ok') {
          this.cargos = r.cargos;
          this.filtrarCargos();
          this.totalCargo    = this.cargos.length;
          this.totalCargoAct = this.cargos.filter(c => c.estado === 'activo').length;
        } else { this.errorCargo = r.mensaje; }
      },
      error: err => { this.cargandoCargo = false; this.errorCargo = err.error?.mensaje || 'Error al cargar.'; }
    });
  }

  filtrarCargos(): void {
    const q = this.busqCargo.toLowerCase();
    this.cargosFiltrados = this.cargos.filter(c =>
      (!q || c.nombre.toLowerCase().includes(q) || c.area_nombre.toLowerCase().includes(q) || c.direccion_nombre.toLowerCase().includes(q)) &&
      (!this.filtroEstCargo  || c.estado === this.filtroEstCargo) &&
      (!this.filtroAreaCargo || c.area_id === Number(this.filtroAreaCargo))
    );
  }

  abrirNuevoCargo(): void {
    this.formCargo = this.cargoVacio(); this.erroresCargo = {};
    this.areasFormCargo = [...this.catAreas];
    this.modoEdCargo = false; this.mostrarModalCargo = true;
  }

  abrirEditarCargo(c: CargoEstructura): void {
    this.formCargo = { id: c.id, nombre: c.nombre, estado: c.estado, area_id: c.area_id, direccion_id: null };
    const area = this.catAreas.find(a => a.id === c.area_id);
    if (area) {
      this.formCargo.direccion_id = area.direccion_id;
      this.areasFormCargo = this.catAreas.filter(a => a.direccion_id === area.direccion_id);
    } else {
      this.areasFormCargo = [...this.catAreas];
    }
    this.erroresCargo = {}; this.modoEdCargo = true; this.mostrarModalCargo = true;
  }

  cerrarModalCargo(): void { this.mostrarModalCargo = false; this.formCargo = this.cargoVacio(); this.erroresCargo = {}; }

  onDirCargoChange(): void {
    const dId = this.formCargo.direccion_id;
    this.areasFormCargo = dId ? this.catAreas.filter(a => a.direccion_id === Number(dId)) : [...this.catAreas];
    this.formCargo.area_id = null;
  }

  guardarCargo(): void {
    this.erroresCargo = {};
    if (!this.formCargo.nombre?.trim() || this.formCargo.nombre.trim().length < 2) { this.erroresCargo['nombre'] = 'Mínimo 2 caracteres.'; }
    if (!this.formCargo.area_id) { this.erroresCargo['area_id'] = 'Seleccione un área.'; }
    if (Object.keys(this.erroresCargo).length) return;
    this.guardandoCargo = true;
    const payload = { nombre: this.formCargo.nombre.trim().toUpperCase(), area_id: Number(this.formCargo.area_id), estado: this.formCargo.estado };
    const es_ed = this.modoEdCargo && this.formCargo.id != null;
    const url = es_ed ? `${this.API}/admin/estructura/cargos/${this.formCargo.id}` : `${this.API}/admin/estructura/cargos`;
    const req$ = es_ed ? this.http.put<any>(url, payload, { headers: this.h() }) : this.http.post<any>(url, payload, { headers: this.h() });
    req$.subscribe({
      next: r => {
        this.guardandoCargo = false;
        if (r.estado === 'ok') { this.cerrarModalCargo(); this.cargarCargos(); this.ok(r.mensaje); }
      },
      error: err => { this.guardandoCargo = false; this.err(err.error?.mensaje || 'Error al guardar.'); }
    });
  }

  confirmarElimCargo(c: CargoEstructura): void { this.itemElimCargo = c; this.mostrarConfCargo = true; }
  cancelarElimCargo(): void { this.itemElimCargo = null; this.mostrarConfCargo = false; }
  ejecutarElimCargo(): void {
    if (!this.itemElimCargo) return;
    this.http.delete<any>(`${this.API}/admin/estructura/cargos/${this.itemElimCargo.id}`, { headers: this.h() }).subscribe({
      next: r => { this.cancelarElimCargo(); if (r.estado === 'ok') { this.cargarCargos(); this.ok(r.mensaje); } },
      error: err => { this.cancelarElimCargo(); this.err(err.error?.mensaje || 'No se puede eliminar.'); }
    });
  }

  limpiarDuplicados(): void {
    this.http.post<any>(`${this.API}/admin/estructura/limpiar-duplicados`, {}, { headers: this.h() }).subscribe({
      next: r => {
        if (r.estado === 'ok') {
          this.cargarAreas();
          this.cargarCargos();
          this.cargarCatalogos();
          this.ok(r.mensaje);
        } else {
          this.err(r.mensaje || 'No se pudo limpiar.');
        }
      },
      error: err => this.err(err.error?.mensaje || 'Error al limpiar duplicados.')
    });
  }

  // =====================================================
  // HELPERS
  // =====================================================

  private buildQs(params: Record<string, any>): string {
    const parts = Object.entries(params)
      .filter(([, v]) => v !== '' && v != null)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
    return parts.length ? `?${parts.join('&')}` : '';
  }

  private ok(msg: string): void {
    Swal.fire({ title: 'Éxito', text: msg, icon: 'success', confirmButtonText: 'OK', confirmButtonColor: '#15803d', background: '#ffffff', color: '#0f172a' });
  }

  private err(msg: string): void {
    Swal.fire({ title: 'Error', text: msg, icon: 'error', confirmButtonText: 'OK', confirmButtonColor: '#dc2626', background: '#ffffff', color: '#0f172a' });
  }

  getTipoTexto(tipo: string): string {
    return ({ jefe_area: 'Jefe de Área', analista_tics: 'Analista TICS', funcionario: 'Funcionario', responsable_tecnico: 'Resp. Técnico' } as Record<string, string>)[tipo] || tipo;
  }

  getTipoClase(tipo: string): string {
    return ({ jefe_area: 'jefe', analista_tics: 'tics', funcionario: 'func', responsable_tecnico: 'tecnico' } as Record<string, string>)[tipo] || 'func';
  }

  soloNumeros(e: KeyboardEvent): void {
    if (!['Backspace','Tab','ArrowLeft','ArrowRight','Delete'].includes(e.key) && !/^\d$/.test(e.key)) e.preventDefault();
  }

  limpiarNumeros(campo: 'cedula', max: number): void {
    (this.formFunc as any)[campo] = ((this.formFunc as any)[campo] || '').replace(/\D/g, '').slice(0, max);
  }

  logout(): void { this.authService.logout(); this.router.navigate(['/auth/login']); }

  // ── formas vacías ─────────────────────────────────
  private funcVacio() {
    return { id: null as number | null, nombres: '', apellidos: '', cedula: '', correo: '', cargo: '', tipo_responsable: 'funcionario', area_id: null as number | null, direccion_id: null as number | null, estado: 'activo' as 'activo' | 'inactivo' };
  }
  private dirVacio() {
    return { id: null as number | null, nombre: '', estado: 'activo' as 'activo' | 'inactivo' };
  }
  private areaVacio() {
    return { id: null as number | null, nombre: '', direccion_id: null as number | null, estado: 'activo' as 'activo' | 'inactivo' };
  }
  private cargoVacio() {
    return { id: null as number | null, nombre: '', area_id: null as number | null, direccion_id: null as number | null, estado: 'activo' as 'activo' | 'inactivo' };
  }
}
