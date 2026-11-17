import { TestBed } from '@angular/core/testing';

import { Foodsave } from './foodsave';

describe('Foodsave', () => {
  let service: Foodsave;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Foodsave);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
