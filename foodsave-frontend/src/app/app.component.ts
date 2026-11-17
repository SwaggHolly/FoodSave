import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
// 1. Importa la ruta de tu componente recién creado
import { TechStatusWidgetComponent } from './components/tech-status-widget/tech-status-widget.component';

@Component({
  selector: 'app-root',
  standalone: true,
  // 2. Agrégalo aquí en los imports:
  imports: [CommonModule, RouterOutlet, TechStatusWidgetComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'foodsave-frontend';
}