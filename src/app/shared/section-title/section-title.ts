import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-section-title',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="section-title text-center" [class.dark-theme]="theme === 'dark'">
      <h2 class="title">{{ title }}</h2>
      <p *ngIf="subtitle" class="subtitle">{{ subtitle }}</p>
      <div class="divider"></div>
    </div>
  `,
  styles: [`
    .section-title {
      margin-bottom: var(--spacing-lg);
    }
    .title {
      font-size: 2.25rem;
      font-weight: 700;
      color: var(--primary-color);
      margin-bottom: var(--spacing-xs);
    }
    .subtitle {
      color: var(--text-muted);
      font-size: 1.125rem;
      max-width: 600px;
      margin: 0 auto var(--spacing-sm);
    }
    .divider {
      width: 60px;
      height: 4px;
      background-color: var(--secondary-color);
      margin: 0 auto;
      border-radius: 2px;
    }

    /* Dark Theme */
    .dark-theme .title {
      color: white;
    }
    .dark-theme .subtitle {
      color: #cbd5e1; /* Slate 300 */
    }
  `]
})
export class SectionTitleComponent {
  @Input() title: string = '';
  @Input() subtitle: string = '';
  @Input() theme: 'light' | 'dark' = 'light';
}
