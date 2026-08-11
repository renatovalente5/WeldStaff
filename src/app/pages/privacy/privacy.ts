import { Component, OnInit, OnDestroy, afterNextRender } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { SeoService } from '../../core/services/seo.service';
import { ScrollRevealDirective } from '../../shared/directives/scroll-reveal.directive';
import { Subscription } from 'rxjs';
import { take } from 'rxjs/operators';

@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslocoPipe, ScrollRevealDirective],
  templateUrl: './privacy.html',
  styleUrl: './privacy.scss'
})
export class PrivacyComponent implements OnInit, OnDestroy {
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
    // selectTranslate só emite depois de o ficheiro de tradução estar carregado. Com o
    // translate() síncrono, um JSON que chegasse tarde deixava a chave crua
    // («privacy.seo.title») no título e na description durante toda a sessão.
    this.translocoService.selectTranslate('privacy.seo.title').pipe(take(1)).subscribe(titulo => {
      this.seoService.updateMetaTags({
        title: titulo,
        description: this.translocoService.translate('privacy.seo.description'),
        url: 'https://weldstaff.pt/privacidade'
      });
    });
  }
}
