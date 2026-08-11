import { Component, OnInit, OnDestroy, afterNextRender } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { SeoService } from '../../core/services/seo.service';
import { ScrollRevealDirective } from '../../shared/directives/scroll-reveal.directive';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-terms',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslocoPipe, ScrollRevealDirective],
  templateUrl: './terms.html',
  styleUrl: './terms.scss'
})
export class TermsComponent implements OnInit, OnDestroy {
  private seoSub?: Subscription;

  constructor(
    private translocoService: TranslocoService,
    private seoService: SeoService
  ) {
    // O `window` não existe na pré-renderização estática.
    afterNextRender(() => window.scrollTo(0, 0));
  }

  ngOnInit(): void {
    this.updateSeo();
    this.seoSub = this.translocoService.langChanges$.subscribe(() => this.updateSeo());
  }

  ngOnDestroy(): void {
    this.seoSub?.unsubscribe();
  }

  private updateSeo(): void {
    this.seoService.updateMetaTags({
      title: this.translocoService.translate('terms.seo.title'),
      description: this.translocoService.translate('terms.seo.description'),
      url: 'https://weldstaff.pt/termos'
    });
  }
}
