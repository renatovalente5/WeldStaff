import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, ViewChild, afterNextRender } from '@angular/core';
import { Subscription } from 'rxjs';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonComponent } from '../../shared/button/button';

import { TranslocoPipe, TranslocoDirective } from '@jsverse/transloco';
import { ContactService } from '../../core/services/contact';
import { ScrollRevealDirective } from '../../shared/directives/scroll-reveal.directive';
import { staggerAnimation } from '../../core/animations/stagger-animations';
import { TurnstileComponent } from '../../shared/turnstile/turnstile.component';
import { environment } from '../../../environments/environment';
import { TranslocoService } from '@jsverse/transloco';
import { SeoService } from '../../core/services/seo.service';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ButtonComponent, TranslocoPipe, TranslocoDirective, ScrollRevealDirective, TurnstileComponent],
  templateUrl: './contact.html',
  styleUrl: './contact.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [staggerAnimation]
})
export class ContactComponent implements OnInit, OnDestroy {
  contactForm!: FormGroup;
  successMessage = '';
  errorMessage = '';
  isSubmitting = false;

  siteKey = environment.turnstileSiteKey;
  turnstileToken = '';

  @ViewChild(TurnstileComponent) turnstileWidget?: TurnstileComponent;
  /** Verdadeiro entre o pedido do desafio Turnstile e a chegada do token. */
  private aEsperarToken = false;
  private temporizadorToken?: ReturnType<typeof setTimeout>;
  private langSub?: Subscription;

  contactCards = [
    {
      id: 'phone',
      icon: '📞',
      titleKey: 'contacts.info.phoneLabel',
      valueKey: 'contacts.info.phoneValue',
      ctaKey: 'contacts.info.phoneDesc',
      href: 'tel:',
      hrefValue: 'contacts.info.phoneValue',
      ariaLabel: 'contacts.info.aria.call'
    },
    {
      id: 'email',
      icon: '✉️',
      titleKey: 'contacts.info.emailLabel',
      valueKey: 'contacts.info.emailValue',
      ctaKey: 'contacts.info.emailDesc',
      href: 'mailto:',
      hrefValue: 'contacts.info.emailValue',
      ariaLabel: 'contacts.info.aria.email'
    }
  ];

  constructor(
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef,
    private sanitizer: DomSanitizer,
    private contactService: ContactService,
    private translocoService: TranslocoService,
    private seoService: SeoService
  ) {
    this.contactForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(50)]],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(80)]],
      phone: ['', [Validators.required, Validators.maxLength(20)]],
      message: ['', [Validators.required, Validators.minLength(20), Validators.maxLength(1000)]],
      consent: [false, Validators.requiredTrue],
      website: [''] // Honeypot
    });

    // O `window` não existe na pré-renderização estática.
    afterNextRender(() => window.scrollTo(0, 0));
  }

  ngOnInit(): void {
    this.updateSeoTags();

    this.langSub = this.translocoService.langChanges$.subscribe(() => {
      this.updateSeoTags();
    });
  }

  ngOnDestroy(): void {
    this.langSub?.unsubscribe();
    clearTimeout(this.temporizadorToken);
  }

  private updateSeoTags() {
    this.seoService.updateMetaTags({
      title: this.translocoService.translate('contacts.seo.title'),
      description: this.translocoService.translate('contacts.seo.description'),
      keywords: 'Preciso Soldadores, Contactar WeldStaff, Contratar Soldadores, Weld Staff Contacts, Orçamento Soldadura, Welders for Hire',
      url: 'https://weldstaff.pt/contactos',
      image: 'https://weldstaff.pt/assets/img/og.jpg'
    });

    this.seoService.setStructuredData({
      "@context": "https://schema.org",
      "@type": "ContactPage",
      "name": "Contactos WeldStaff",
      "description": "Entre em contacto para serviços de soldadura e recrutamento.",
      "url": "https://weldstaff.pt/contactos"
    });
  }

  get f() { return this.contactForm.controls; }

  onTokenChange(token: string) {
    this.turnstileToken = token || '';

    // O envio ficou à espera do token: agora que chegou, segue.
    if (this.aEsperarToken && this.turnstileToken) {
      this.aEsperarToken = false;
      clearTimeout(this.temporizadorToken);
      this.enviarFormulario();
      return;
    }

    this.cdr.markForCheck();
  }

  onSubmit(): void {
    if (this.contactForm.invalid) {
      this.contactForm.markAllAsTouched();
      this.errorMessage = 'contacts.form.errors.required'; // Generic error or specific
      return;
    }

    this.isSubmitting = true;
    this.successMessage = '';
    this.errorMessage = '';

    // O widget está configurado com `execution: 'execute'`, ou seja, só emite o
    // token quando o desafio é pedido explicitamente. Sem esta chamada o payload
    // seguia com turnstileToken vazio e o Worker respondia 400 — era exatamente
    // o que acontecia desde fevereiro de 2026.
    //
    // Pede-se sempre um token NOVO: os tokens do Turnstile são de uso único e
    // reutilizá-los devolve 403 (timeout-or-duplicate) numa segunda tentativa.
    this.aEsperarToken = true;
    this.turnstileToken = '';
    this.turnstileWidget?.reset();
    this.turnstileWidget?.execute();

    // Se o Turnstile nunca responder (script bloqueado, hostname não autorizado),
    // não deixar o botão preso em «a enviar» para sempre.
    clearTimeout(this.temporizadorToken);
    this.temporizadorToken = setTimeout(() => {
      if (!this.aEsperarToken) return;
      this.aEsperarToken = false;
      this.isSubmitting = false;
      this.errorMessage = 'contacts.form.error';
      this.cdr.markForCheck();
    }, 20000);

    this.cdr.markForCheck();
  }

  private enviarFormulario(): void {
    const payload = {
      ...this.contactForm.getRawValue(),
      turnstileToken: this.turnstileToken
    };

    this.contactService.sendContactForm(payload).subscribe({
      next: (res: any) => {
        this.isSubmitting = false;
        if (res.ok) {
          this.successMessage = 'contacts.form.success';
          this.contactForm.reset();
        } else {
          this.errorMessage = this.mapWorkerError(res.error) || 'contacts.form.error';
        }
        // O token foi consumido; limpar e repor o widget para o envio seguinte.
        this.limparTurnstile();
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        this.isSubmitting = false;
        this.errorMessage = 'contacts.form.error';
        console.error(err);
        this.limparTurnstile();
        this.cdr.markForCheck();
      }
    });
  }

  private limparTurnstile(): void {
    this.turnstileToken = '';
    this.aEsperarToken = false;
    clearTimeout(this.temporizadorToken);
    this.turnstileWidget?.reset();
  }

  private mapWorkerError(error: string): string {
    if (!error) return '';
    if (error.includes('Campos obrigatórios')) return 'contacts.form.errors.required';
    if (error.includes('Email inválido')) return 'contacts.form.errors.email';
    if (error.includes('anti-bot')) return 'contacts.form.errors.bot';
    return '';
  }

  getSafeUrl(url: string): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  get mapEmbedUrl(): string {
    return 'https://maps.google.com/maps?q=Rua+Vasco+da+Gama+218,+3700-569+Arrifana&z=15&output=embed';
  }
}
