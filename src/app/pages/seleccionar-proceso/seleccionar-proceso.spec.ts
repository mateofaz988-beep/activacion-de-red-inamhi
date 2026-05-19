import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SeleccionarProceso } from './seleccionar-proceso';

describe('SeleccionarProceso', () => {
  let component: SeleccionarProceso;
  let fixture: ComponentFixture<SeleccionarProceso>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SeleccionarProceso],
    }).compileComponents();

    fixture = TestBed.createComponent(SeleccionarProceso);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
