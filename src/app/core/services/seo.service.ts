import { Injectable, Inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';

@Injectable({
    providedIn: 'root'
})
export class SeoService {

    constructor(
        private titleService: Title,
        private metaService: Meta,
        @Inject(DOCUMENT) private doc: Document
    ) { }

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

        // URL
        if (config.url) {
            this.metaService.updateTag({ property: 'og:url', content: config.url });
            this.createCanonicalLink(config.url);
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

        const script = this.doc.createElement('script');
        script.type = 'application/ld+json';
        script.setAttribute('data-structured', 'true');
        script.text = JSON.stringify(data);
        this.doc.head.appendChild(script);
    }
}
