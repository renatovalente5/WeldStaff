import { Injectable, Inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslocoService } from '@jsverse/transloco';
import { caminhoNaLingua } from './language';

const ORIGEM = 'https://weldstaff.pt';
const LINGUAS = ['pt-PT', 'en', 'fr', 'es'];
const LOCALES: Record<string, string> = { 'pt-PT': 'pt_PT', en: 'en_GB', fr: 'fr_FR', es: 'es_ES' };

@Injectable({
    providedIn: 'root'
})
export class SeoService {

    constructor(
        private titleService: Title,
        private metaService: Meta,
        private transloco: TranslocoService,
        @Inject(DOCUMENT) private doc: Document
    ) { }

    /**
     * As páginas passam a morada portuguesa (https://weldstaff.pt/careers); aqui passa à da
     * língua que está a ser vista (https://weldstaff.pt/en/careers). Moradas de fora ficam iguais.
     */
    private naLingua(url: string, lingua: string): string {
        if (!url.startsWith(ORIGEM)) return url;
        const localizado = caminhoNaLingua(url.slice(ORIGEM.length) || '/', lingua);
        return ORIGEM + localizado;
    }

    /**
     * As quatro versões da página, e a portuguesa como x-default. É isto que diz ao Google
     * que /careers e /en/careers são a mesma página noutra língua, e não conteúdo repetido.
     */
    private definirAlternativas(urlPortugues: string) {
        this.doc.head.querySelectorAll('link[rel="alternate"][hreflang]').forEach((l) => l.remove());
        for (const [codigo, lingua] of [...LINGUAS.map((l) => [l, l]), ['x-default', 'pt-PT']]) {
            const link = this.doc.createElement('link');
            link.setAttribute('rel', 'alternate');
            link.setAttribute('hreflang', codigo);
            link.setAttribute('href', this.naLingua(urlPortugues, lingua));
            this.doc.head.appendChild(link);
        }
    }

    updateTitle(title: string) {
        this.titleService.setTitle(title);
    }

    updateMetaTags(config: {
        title?: string;
        description?: string;
        keywords?: string;
        image?: string;
        url?: string;
        type?: string;
    }) {
        // Title
        if (config.title) {
            this.updateTitle(config.title);
            this.metaService.updateTag({ property: 'og:title', content: config.title });
            this.metaService.updateTag({ name: 'twitter:title', content: config.title });
        }

        // Description
        if (config.description) {
            this.metaService.updateTag({ name: 'description', content: config.description });
            this.metaService.updateTag({ property: 'og:description', content: config.description });
            this.metaService.updateTag({ name: 'twitter:description', content: config.description });
        }

        // Keywords
        if (config.keywords) {
            this.metaService.updateTag({ name: 'keywords', content: config.keywords });
        }

        // Image
        if (config.image) {
            this.metaService.updateTag({ property: 'og:image', content: config.image });
            this.metaService.updateTag({ name: 'twitter:image', content: config.image });
        }

        // URL — a canónica é a da língua em que a página está; as alternativas, as quatro.
        if (config.url) {
            const lingua = this.transloco.getActiveLang();
            const canonica = this.naLingua(config.url, lingua);
            this.metaService.updateTag({ property: 'og:url', content: canonica });
            this.metaService.updateTag({ property: 'og:locale', content: LOCALES[lingua] ?? 'pt_PT' });
            this.createCanonicalLink(canonica);
            this.definirAlternativas(config.url);
        }

        // Type
        if (config.type) {
            this.metaService.updateTag({ property: 'og:type', content: config.type });
        } else {
            this.metaService.updateTag({ property: 'og:type', content: 'website' });
        }

        // Twitter Card
        this.metaService.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    }

    createCanonicalLink(url: string) {
        let link: HTMLLinkElement = this.doc.querySelector("link[rel='canonical']") || this.doc.createElement('link');
        link.setAttribute('rel', 'canonical');
        this.doc.head.appendChild(link);
        link.setAttribute('href', url);
    }

    setStructuredData(data: any) {
        // Remove any previously added structured data script
        const existing = this.doc.head.querySelector('script[data-structured]');
        if (existing) {
            existing.remove();
        }

        // A página (ContactPage, CollectionPage…) tem a morada da língua; a Organization não.
        if (typeof data?.url === 'string' && data['@type'] !== 'Organization') {
            data = { ...data, url: this.naLingua(data.url, this.transloco.getActiveLang()) };
        }

        const script = this.doc.createElement('script');
        script.type = 'application/ld+json';
        script.setAttribute('data-structured', 'true');
        script.text = JSON.stringify(data);
        this.doc.head.appendChild(script);
    }
}
