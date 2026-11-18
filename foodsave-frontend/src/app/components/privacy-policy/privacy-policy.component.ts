import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-privacy-policy',
  standalone: true,
  templateUrl: './privacy-policy.component.html',
  styleUrl: './privacy-policy.component.scss'
})
export class PrivacyPolicyComponent {
  @Input() open = false;
  @Output() closed = new EventEmitter<void>();
}
