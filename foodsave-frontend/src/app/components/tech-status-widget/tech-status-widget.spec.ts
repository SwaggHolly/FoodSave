import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TechStatusWidget } from './tech-status-widget';

describe('TechStatusWidget', () => {
  let component: TechStatusWidget;
  let fixture: ComponentFixture<TechStatusWidget>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TechStatusWidget]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TechStatusWidget);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
