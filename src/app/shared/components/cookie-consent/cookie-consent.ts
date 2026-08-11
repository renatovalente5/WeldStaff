import { Component, afterNextRender } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

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

  constructor() {
    // O localStorage não existe durante a pré-renderização estática, por isso
    // a decisão de mostrar o banner só é tomada depois do render no browser.
    afterNextRender(() => {
      const consent = localStorage.getItem('cookie_consent');
      if (!consent) {
        // Small delay so banner doesn't flash on page load
        setTimeout(() => {
          this.isVisible = true;
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
    localStorage.setItem('cookie_consent', JSON.stringify({
      essential: true,
      functional: this.preferences.functional,
      timestamp: new Date().toISOString()
    }));
    this.isVisible = false;
    this.showPreferences = false;
  }

  togglePreferences(): void {
    this.showPreferences = !this.showPreferences;
  }

  static hasConsent(category: string): boolean {
    try {
      const consent = localStorage.getItem('cookie_consent');
      if (!consent) return false;
      const parsed = JSON.parse(consent);
      return parsed[category] === true;
    } catch {
      return false;
    }
  }

  static hasAnyConsent(): boolean {
    return localStorage.getItem('cookie_consent') !== null;
  }
}
