import { Routes, CanActivateFn } from '@angular/router';
import { inject } from '@angular/core';
import { NotFoundComponent } from './pages/not-found/not-found';
import { LanguageService } from './core/services/language';

/** A língua de um grupo de rotas vem da morada; a guarda carrega-a antes de mostrar a página. */
function comLingua(lingua: string): CanActivateFn {
    return (_rota, estado) => inject(LanguageService).entrar(lingua, estado.url);
}

/**
 * As mesmas páginas em todas as línguas; o português fica na raiz, as outras com prefixo.
 *
 * Sem `title:` nas rotas: cada página põe o seu, traduzido, pelo SeoService. O título da rota
 * era português e o Angular repunha-o no fim de cada navegação que reaproveitasse a página —
 * de /en/careers?utm_source=… a «Careers» no menu, o separador ficava «Carreiras - WeldStaff».
 */
function paginas(): Routes {
    return [
        {
            path: '',
            loadComponent: () => import('./pages/home/home').then(m => m.HomeComponent),
            data: { animation: 'HomePage' }
        },
        {
            path: 'contactos',
            loadComponent: () => import('./pages/contact/contact').then(m => m.ContactComponent),
            data: { animation: 'ContactPage' }
        },
        {
            path: 'careers',
            loadComponent: () => import('./pages/careers/careers').then(m => m.CareersComponent),
            data: { animation: 'CareersPage' }
        },
        {
            path: 'privacidade',
            loadComponent: () => import('./pages/privacy/privacy').then(m => m.PrivacyComponent),
            data: { animation: 'LegalPage' }
        },
        {
            path: 'cookies',
            loadComponent: () => import('./pages/cookies/cookies').then(m => m.CookiesComponent),
            data: { animation: 'LegalPage' }
        },
        {
            path: 'termos',
            loadComponent: () => import('./pages/terms/terms').then(m => m.TermsComponent),
            data: { animation: 'LegalPage' }
        },
        {
            path: '**',
            component: NotFoundComponent
        }
    ];
}

// A ordem conta: os prefixos primeiro, porque o grupo português (path '') apanha tudo o
// resto — incluindo o '**' das páginas que não existem.
export const routes: Routes = [
    ...['en', 'fr', 'es'].map((lingua) => ({ path: lingua, canActivate: [comLingua(lingua)], children: paginas() })),
    { path: '', canActivate: [comLingua('pt-PT')], children: paginas() },
];
