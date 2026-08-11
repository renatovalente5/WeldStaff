import { Component, OnInit, OnDestroy, HostListener, ElementRef, PLATFORM_ID, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../services/language';
import { filter } from 'rxjs/operators';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, TranslocoPipe],
  templateUrl: './header.html',
  styleUrl: './header.scss'
})
export class HeaderComponent implements OnInit, OnDestroy {
  isLangDropdownOpen = false;
  isMobileMenuOpen = false;
  isScrolled = false;
  isHomePage = false;
  isTransparentPage = false;
  private routerSub!: Subscription;
  private readonly emBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  constructor(
    public languageService: LanguageService,
    private router: Router,
    private elementRef: ElementRef
  ) { }

  /** Em Node não há `window`; na pré-renderização assume-se o topo da página. */
  private get scrollPassouOTopo(): boolean {
    return this.emBrowser && window.scrollY > 50;
  }

  ngOnInit() {
    this.routerSub = this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event) => {
      this.isMobileMenuOpen = false;
      this.isLangDropdownOpen = false;

      const navEvent = event as NavigationEnd;
      const url = navEvent.urlAfterRedirects;

      // Only the home page uses the transparent navbar at the top
      this.isHomePage = url === '/' || url === '';
      this.isTransparentPage = this.isHomePage;

      if (!this.isTransparentPage) {
        this.isScrolled = true;
      } else {
        this.isScrolled = this.scrollPassouOTopo;
      }
    });

    // Initial route check
    const url = this.router.url;
    this.isHomePage = url === '/' || url === '';
    this.isTransparentPage = this.isHomePage;
    if (!this.isTransparentPage) {
      this.isScrolled = true;
    } else {
      this.isScrolled = this.scrollPassouOTopo;
    }
  }

  ngOnDestroy() {
    if (this.routerSub) {
      this.routerSub.unsubscribe();
    }
  }

  toggleDropdown() {
    this.isLangDropdownOpen = !this.isLangDropdownOpen;
  }

  toggleMobileMenu() {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }

  selectLang(lang: string) {
    this.languageService.setActiveLang(lang);
    this.isLangDropdownOpen = false;
  }

  @HostListener('window:resize', ['$event'])
  onResize(event: any) {
    if (this.emBrowser && window.innerWidth >= 992) {
      this.isMobileMenuOpen = false;
      this.isLangDropdownOpen = false;
    }
  }

  @HostListener('window:scroll', [])
  onWindowScroll() {
    if (this.isTransparentPage) {
      this.isScrolled = this.scrollPassouOTopo;
    }
    // On other pages, isScrolled stays true always
  }

  @HostListener('document:click', ['$event'])
  onClickOutside(event: MouseEvent) {
    const clickedInside = this.elementRef.nativeElement.querySelector('.lang-selector')?.contains(event.target);
    if (!clickedInside && this.isLangDropdownOpen) {
      this.isLangDropdownOpen = false;
    }
  }

  getFlag(lang: string): string {
    if (lang === 'pt-PT') return 'fi fi-pt';
    if (lang === 'en') return 'fi fi-gb';
    if (lang === 'fr') return 'fi fi-fr';
    if (lang === 'es') return 'fi fi-es';
    return 'fi fi-pt';
  }
}
