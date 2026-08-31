import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { TranslocoService } from '@jsverse/transloco';

const LINGUAS_PERMITIDAS = ['pt-PT', 'en', 'fr', 'es'];
const LINGUA_PREDEFINIDA = 'pt-PT';

@Injectable({
    providedIn: 'root'
})
export class LanguageService {
    private readonly LANG_KEY = 'lang';
    private readonly emBrowser = isPlatformBrowser(inject(PLATFORM_ID));
    private readonly doc = inject(DOCUMENT);

    constructor(private translocoService: TranslocoService) {
        this.initLanguage();
    }

    private initLanguage() {
        // Durante a pré-renderização não há localStorage: fica a língua predefinida,
        // que é também a que o Google indexa (o site não tem URLs por língua).
        const savedLang = this.emBrowser ? localStorage.getItem(this.LANG_KEY) : null;

        const targetLang = savedLang && LINGUAS_PERMITIDAS.includes(savedLang)
            ? savedLang
            : LINGUA_PREDEFINIDA;

        this.setActiveLang(targetLang);
    }

    getActiveLang(): string {
        return this.translocoService.getActiveLang();
    }

    setActiveLang(lang: string) {
        this.translocoService.setActiveLang(lang);

        // Sem isto o <html lang> ficava preso em pt-PT: um visitante em English
        // tinha a página declarada como portuguesa e o leitor de ecrã lia inglês
        // com fonética portuguesa. Vai por DOCUMENT para correr na pré-renderização.
        this.doc.documentElement.lang = lang;

        if (this.emBrowser) {
            localStorage.setItem(this.LANG_KEY, lang);
        }
    }

    toggleLang() {
        this.setActiveLang(this.getNextLang());
    }

    getNextLangLabel(): string {
        const next = this.getNextLang();
        return next === 'pt-PT' ? 'PT' : next.toUpperCase();
    }

    private getNextLang(): string {
        const index = LINGUAS_PERMITIDAS.indexOf(this.getActiveLang());
        return LINGUAS_PERMITIDAS[(index + 1) % LINGUAS_PERMITIDAS.length];
    }
}
