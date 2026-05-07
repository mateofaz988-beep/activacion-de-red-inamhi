import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SolicitudPublica } from './solicitud-publica';

describe('SolicitudPublica', () => {
  let component: SolicitudPublica;
  let fixture: ComponentFixture<SolicitudPublica>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SolicitudPublica],
    }).compileComponents();

    fixture = TestBed.createComponent(SolicitudPublica);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
