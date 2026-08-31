import { Routes } from '@angular/router';
import { NotFoundComponent } from './pages/not-found/not-found';

export const routes: Routes = [
    {
        path: '',
        loadComponent: () => import('./pages/home/home').then(m => m.HomeComponent),
        title: 'WeldStaff - Soluções de Soldadura',
        data: { animation: 'HomePage' }
    },
    {
        path: 'contactos',
        loadComponent: () => import('./pages/contact/contact').then(m => m.ContactComponent),
        title: 'Contactos - WeldStaff',
        data: { animation: 'ContactPage' }
    },
    {
        path: 'careers',
        loadComponent: () => import('./pages/careers/careers').then(m => m.CareersComponent),
        title: 'Carreiras - WeldStaff',
        data: { animation: 'CareersPage' }
    },
    {
        path: 'privacidade',
        loadComponent: () => import('./pages/privacy/privacy').then(m => m.PrivacyComponent),
        title: 'Política de Privacidade - WeldStaff',
        data: { animation: 'LegalPage' }
    },
    {
        path: 'cookies',
        loadComponent: () => import('./pages/cookies/cookies').then(m => m.CookiesComponent),
        title: 'Política de Cookies - WeldStaff',
        data: { animation: 'LegalPage' }
    },
    {
        path: 'termos',
        loadComponent: () => import('./pages/terms/terms').then(m => m.TermsComponent),
        title: 'Termos e Condições - WeldStaff',
        data: { animation: 'LegalPage' }
    },
    {
        path: '**',
        component: NotFoundComponent,
        title: 'Página não encontrada - WeldStaff'
    }
];
