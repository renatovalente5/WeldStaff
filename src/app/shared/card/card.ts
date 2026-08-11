import { Component } from '@angular/core';

@Component({
  selector: 'app-card',
  standalone: true,
  template: `
    <div class="card">
      <ng-content></ng-content>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }
    .card {
      background: var(--bg-surface);
      padding: var(--spacing-lg);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-sm);
      transition: transform var(--transition-spring), box-shadow var(--transition-normal), border-color var(--transition-normal);
      height: 100%;
      border: 1px solid #e2e8f0;
      display: flex;
      flex-direction: column;
    }
    .card:hover {
      box-shadow: var(--shadow-lg), var(--shadow-glow);
      transform: translateY(var(--lift-hover));
      border-color: var(--accent-color);
    }
  `]
})
export class CardComponent { }
