import { Component, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectionStrategy, afterNextRender } from '@angular/core';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SectionTitleComponent } from '../../shared/section-title/section-title';
import { ScrollRevealDirective } from '../../shared/directives/scroll-reveal.directive';
import { staggerAnimation } from '../../core/animations/stagger-animations';
import { CountUpDirective } from '../../shared/directives/count-up.directive';

import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { SeoService } from '../../core/services/seo.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink, SectionTitleComponent, TranslocoPipe, ScrollRevealDirective, CountUpDirective],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [staggerAnimation]
})
export class HomeComponent implements OnInit, OnDestroy {
  @ViewChild('heroVideo') heroVideo?: ElementRef<HTMLVideoElement>;
  private seoSub?: Subscription;

  constructor(
    private translocoService: TranslocoService,
    private seoService: SeoService
  ) {
    // O vídeo e o `document` só existem no browser: em Node isto rebentaria
    // a pré-renderização estática.
    afterNextRender(() => this.iniciarVideoHero());
  }

  ngOnInit(): void {
    this.refreshSeo();

    // Re-run whenever the active language changes
    this.seoSub = this.translocoService.langChanges$.subscribe(() => {
      this.refreshSeo();
    });
  }

  ngOnDestroy(): void {
    this.seoSub?.unsubscribe();
  }

  private refreshSeo(): void {
    // selectTranslate waits for the translation file to be fully loaded
    // before emitting, so the translated strings are always up-to-date.
    this.translocoService
      .selectTranslate('home.seo.title')
      .subscribe(title => {
        const description = this.translocoService.translate('home.seo.description');
        this.updateSeoTags(title, description);
      });
  }

  scrollToContent(): void {
    const aboutSection = document.getElementById('about');
    if (aboutSection) {
      const headerHeight = 90;
      const top = aboutSection.getBoundingClientRect().top + window.scrollY - headerHeight;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  }

  private updateSeoTags(title: string, description: string) {
    this.seoService.updateMetaTags({
      title,
      description,
      keywords: 'WeldStaff, Weld Staff, Weld, Welders, Jobs Welders, Welder Job, Soldadores, Profissão Soldador, Preciso Soldadores, Recrutamento Industrial, Portugal, Outsourcing Soldadura',
      image: 'https://weldstaff.pt/assets/img/og.jpg',
      url: 'https://weldstaff.pt/',
      type: 'website'
    });

    // Organization Structured Data
    this.seoService.setStructuredData({
      "@context": "https://schema.org",
      "@type": "Organization",
      "name": "WeldStaff",
      "url": "https://weldstaff.pt",
      "logo": "https://weldstaff.pt/assets/img/weldstaff_logo.png",
      "description": "Especialistas em outsourcing de soldadura em Portugal.",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "Rua Vasco da Gama 218",
        "addressLocality": "Santa Maria da Feira",
        "addressRegion": "Aveiro",
        "postalCode": "3700-569",
        "addressCountry": "PT"
      },
      "contactPoint": {
        "@type": "ContactPoint",
        "telephone": "+351-938-939-951",
        "contactType": "customer service"
      }
    });
  }

  private iniciarVideoHero(): void {
    const video = this.heroVideo?.nativeElement;
    if (!video) return;

    // Force mute (required for iOS autoplay)
    video.muted = true;
    video.volume = 0;

    // Explicitly call play() — iOS Safari sometimes ignores the autoplay attribute
    this.playVideo(video);

    // Resume video when user returns to the page (e.g. after switching tabs)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.playVideo(video);
      }
    });
  }

  private playVideo(video: HTMLVideoElement): void {
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // Autoplay was blocked — try again once user interacts with the page
        const resumeOnInteraction = () => {
          video.play().catch(() => { });
          document.removeEventListener('touchstart', resumeOnInteraction);
          document.removeEventListener('click', resumeOnInteraction);
        };
        document.addEventListener('touchstart', resumeOnInteraction, { once: true });
        document.addEventListener('click', resumeOnInteraction, { once: true });
      });
    }
  }
}
