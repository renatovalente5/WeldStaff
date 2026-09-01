import { ChangeDetectorRef, Component, afterNextRender, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/services/language';
import { CHAVE_CONSENTIMENTO, consentiu, jaRespondeu } from '../../../core/services/consent';

@Component({
  selector: 'app-cookie-consent',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslocoPipe],
  templateUrl: './cookie-consent.html',
  styleUrl: './cookie-consent.scss'
})
export class CookieConsentComponent {
  isVisible = false;
  showPreferences = false;

  preferences = {
    essential: true,    // Always on
    functional: true
  };

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly languageService = inject(LanguageService);

  constructor() {
    // O localStorage não existe durante a pré-renderização estática, por isso
    // a decisão de mostrar o banner só é tomada depois do render no browser.
    afterNextRender(() => {
      if (!jaRespondeu()) {
        // Small delay so banner doesn't flash on page load
        setTimeout(() => {
          this.isVisible = true;

          // É o markForCheck que faz o banner aparecer. Esta aplicação corre
          // sem zone.js (o Angular 21 é zoneless por omissão), pelo que a
          // deteção de alterações só acontece quando alguém a pede: sinais,
          // listeners declarados no template, async pipe ou este aviso. Um
          // setTimeout a mexer num campo simples não avisa ninguém, e o
          // isVisible ficava a true sem que o *ngIf alguma vez reavaliasse —
          // o banner nunca chegou a aparecer a ninguém.
          this.cdr.markForCheck();
        }, 800);
      }
    });
  }

  acceptAll(): void {
    this.preferences.functional = true;
    this.savePreferences();
  }

  rejectNonEssential(): void {
    this.preferences.functional = false;
    this.savePreferences();
  }

  savePreferences(): void {
    localStorage.setItem(CHAVE_CONSENTIMENTO, JSON.stringify({
      essential: true,
      functional: this.preferences.functional,
      timestamp: new Date().toISOString()
    }));

    // A resposta tem de ter efeito imediato, e não só na visita seguinte: é
    // aqui que a preferência de idioma passa a ser gravada, ou é apagada.
    this.languageService.aplicarConsentimento();

    this.isVisible = false;
    this.showPreferences = false;
  }

  togglePreferences(): void {
    this.showPreferences = !this.showPreferences;
  }

  static hasConsent(category: 'essential' | 'functional'): boolean {
    return consentiu(category);
  }

  static hasAnyConsent(): boolean {
    return jaRespondeu();
  }
}
