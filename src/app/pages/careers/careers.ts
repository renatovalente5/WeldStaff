import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router'; // For routerLink in modal
import { CareerService, Job } from '../../core/services/career';
import { SeoService } from '../../core/services/seo.service';

import { ScrollRevealDirective } from '../../shared/directives/scroll-reveal.directive';
import { staggerAnimation } from '../../core/animations/stagger-animations';
import { JobApplicationModalComponent } from './job-application-modal/job-application-modal';

import { TranslocoDirective, TranslocoService } from '@jsverse/transloco'; // Import TranslocoService
import { take } from 'rxjs/operators';

@Component({
  selector: 'app-careers',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslocoDirective, ScrollRevealDirective, JobApplicationModalComponent],
  templateUrl: './careers.html',
  styleUrl: './careers.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [staggerAnimation]
})
export class CareersComponent implements OnInit {
  jobs: Job[] = [];
  isLoadingJobs = true;

  isModalOpen = false;
  selectedJobTitle = '';

  constructor(
    private careerService: CareerService,
    private cdr: ChangeDetectorRef,
    private translocoService: TranslocoService,
    private seoService: SeoService
  ) { }

  ngOnInit(): void {
    this.updateSeoTags();

    this.translocoService.langChanges$.subscribe(() => {
      this.updateSeoTags();
    });

    this.loadJobs();
  }

  private updateSeoTags() {
    // selectTranslate só emite depois de o ficheiro de tradução estar carregado. Com o
    // translate() síncrono, um JSON que chegasse tarde deixava a chave crua
    // («careers.seo.title») no título e na description durante toda a sessão.
    this.translocoService.selectTranslate('careers.seo.title').pipe(take(1)).subscribe(titulo => {
      this.seoService.updateMetaTags({
        title: titulo,
        description: this.translocoService.translate('careers.seo.description'),
        keywords: 'Jobs Welders, Welder Job, Emprego Soldador, Vagas Soldadura, Profissão Soldador, Weld Staff Careers, Trabalho Metalomecânica, Welders',
        url: 'https://weldstaff.pt/careers',
        image: 'https://weldstaff.pt/assets/img/og.jpg'
      });

      this.seoService.setStructuredData({
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": "Carreiras WeldStaff",
        "description": "Vagas disponíveis para profissionais de soldadura e metalomecânica.",
        "url": "https://weldstaff.pt/careers"
      });
    });
  }

  loadJobs() {
    this.isLoadingJobs = true;
    this.careerService.getJobs().subscribe(jobs => {
      this.jobs = jobs;
      this.isLoadingJobs = false;
      this.cdr.markForCheck();
    });
  }

  openApplicationModal(job: Job) {
    // Translate the title key to get the actual string
    this.selectedJobTitle = this.translocoService.translate('careers.' + job.titleKey);
    this.isModalOpen = true;
    this.cdr.markForCheck();
  }

  closeApplicationModal() {
    this.isModalOpen = false;
    this.cdr.markForCheck();
  }

  onApplicationSubmit(event: { form: any, files: File[] }) {
    console.log('Application Submitted:', event);
    this.closeApplicationModal();
  }
}
