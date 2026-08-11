import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslocoPipe],
  template: `
    <div class="container text-center section">
      <h1 class="error-code">404</h1>
      <h2 class="error-msg">{{ 'notFound.title' | transloco }}</h2>
      <p class="description">{{ 'notFound.text' | transloco }}</p>
      <div class="mt-md">
        <a routerLink="/" class="btn btn-primary">{{ 'notFound.back' | transloco }}</a>
      </div>
    </div>
  `,
  styles: [`
    .error-code {
      font-size: 6rem;
      font-weight: 800;
      color: var(--secondary-color);
      line-height: 1;
      margin-bottom: 1rem;
    }
    .error-msg {
      font-size: 2rem;
      color: var(--primary-color);
      margin-bottom: 1rem;
    }
    .description {
      color: var(--text-muted);
      margin-bottom: 2rem;
    }
    .mt-md { margin-top: 2rem; }
  `]
})
export class NotFoundComponent { }
