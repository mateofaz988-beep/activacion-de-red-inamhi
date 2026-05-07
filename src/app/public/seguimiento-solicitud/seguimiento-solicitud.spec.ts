import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SeguimientoSolicitud } from './seguimiento-solicitud';

describe('SeguimientoSolicitud', () => {
  let component: SeguimientoSolicitud;
  let fixture: ComponentFixture<SeguimientoSolicitud>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SeguimientoSolicitud],
    }).compileComponents();

    fixture = TestBed.createComponent(SeguimientoSolicitud);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
