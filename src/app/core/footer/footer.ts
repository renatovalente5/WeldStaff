import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';

import { TranslocoPipe } from '@jsverse/transloco';
import { NaLinguaPipe } from '../../shared/pipes/na-lingua.pipe';
import { caminhoNaLingua, caminhoSemLingua, linguaDoCaminho } from '../services/language';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslocoPipe, NaLinguaPipe],
  templateUrl: './footer.html',
  styleUrl: './footer.scss'
})
export class FooterComponent {
  currentYear = new Date().getFullYear();

  constructor(private router: Router) { }

  scrollTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
  }

  scrollToAbout() {
    const doScroll = () => {
      const el = document.getElementById('about');
      if (el) {
        const top = el.getBoundingClientRect().top + window.scrollY - 90;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    };

    const inicio = caminhoNaLingua('/', linguaDoCaminho(this.router.url));
    if (caminhoSemLingua(this.router.url).split(/[?#]/)[0] === '/') {
      doScroll();
    } else {
      this.router.navigateByUrl(inicio).then(() => setTimeout(doScroll, 150));
    }
  }
}
