import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { SeoService } from '../../core/services/seo.service';

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
export class NotFoundComponent implements OnInit, OnDestroy {
  private seoSub?: Subscription;

  constructor(
    private translocoService: TranslocoService,
    private seoService: SeoService
  ) { }

  // Era a única das sete páginas sem tratamento de SEO: o corpo aparecia
  // traduzido e o separador do browser ficava em português em qualquer língua.
  ngOnInit(): void {
    this.seoSub = this.translocoService
      .selectTranslate('notFound.title')
      .subscribe(titulo => this.seoService.updateTitle(`${titulo} - WeldStaff`));
  }

  ngOnDestroy(): void {
    this.seoSub?.unsubscribe();
  }
}
