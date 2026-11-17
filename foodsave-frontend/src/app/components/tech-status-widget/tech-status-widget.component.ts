import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FoodsaveService } from '../../services/foodsave.service';
import { ProtocolStatus } from '../../models/product.model';

@Component({
  selector: 'app-tech-status-widget',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tech-status-widget.component.html',
  styleUrls: ['./tech-status-widget.component.scss']
})
export class TechStatusWidgetComponent implements OnInit {
  protocols: ProtocolStatus[] = [];

  constructor(private foodsaveService: FoodsaveService) {}

  ngOnInit(): void {
    this.foodsaveService.getProtocolsStatus().subscribe(data => {
      this.protocols = data;
    });
  }
}