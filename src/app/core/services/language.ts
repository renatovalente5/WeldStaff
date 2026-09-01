import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { TranslocoService } from '@jsverse/transloco';
import { consentiu } from './consent';

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

        // A preferência de idioma é a categoria «Funcionais» do banner, e por
        // isso só é gravada depois de o visitante a autorizar. Enquanto não
        // autorizar, a língua vale para a sessão e não deixa rasto.
        if (this.emBrowser && consentiu('functional')) {
            localStorage.setItem(this.LANG_KEY, lang);
        }
    }

    /**
     * Chamado pelo banner logo depois de o visitante responder: grava a língua
     * que ele está a ver se autorizou, e apaga o que estivesse gravado se
     * recusou. Sem isto, aceitar os cookies depois de trocar de idioma perdia
     * a escolha, e recusá-los deixava para trás o valor de uma visita anterior.
     */
    aplicarConsentimento(): void {
        if (!this.emBrowser) return;
        if (consentiu('functional')) {
            localStorage.setItem(this.LANG_KEY, this.getActiveLang());
        } else {
            localStorage.removeItem(this.LANG_KEY);
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
