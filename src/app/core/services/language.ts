import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { GuardResult, RedirectCommand, Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { Observable, map, of } from 'rxjs';
import { consentiu } from './consent';

const LINGUAS_PERMITIDAS = ['pt-PT', 'en', 'fr', 'es'];
const LINGUA_PREDEFINIDA = 'pt-PT';

/**
 * Cada língua tem a sua morada: o português na raiz (as moradas que o Google já tinha), as
 * outras com prefixo — /en/careers, /fr/contactos. Antes a língua mudava só no browser e o
 * Google só conhecia a versão portuguesa; assim cada versão é uma página que se indexa.
 */
export const LINGUAS_COM_PREFIXO = ['en', 'fr', 'es'];

/** Separa o caminho do resto (?query#fragmento), que nunca leva o prefixo. */
function partir(url: string): [string, string] {
    const i = url.search(/[?#]/);
    return i === -1 ? [url, ''] : [url.slice(0, i), url.slice(i)];
}

/** '/en/contactos' → 'en'; tudo o que não tiver prefixo → 'pt-PT'. */
export function linguaDoCaminho(url: string): string {
    const primeiro = partir(url)[0].split('/')[1] ?? '';
    return LINGUAS_COM_PREFIXO.includes(primeiro) ? primeiro : LINGUA_PREDEFINIDA;
}

/** '/en/contactos' → '/contactos'; '/en' → '/'. Mantém ?query e #fragmento. */
export function caminhoSemLingua(url: string): string {
    const [caminho, resto] = partir(url);
    const partes = caminho.split('/');
    if (LINGUAS_COM_PREFIXO.includes(partes[1] ?? '')) partes.splice(1, 1);
    return (partes.join('/') || '/') + resto;
}

/** ('/contactos', 'en') → '/en/contactos'; ('/', 'en') → '/en'; em pt-PT fica igual. */
export function caminhoNaLingua(url: string, lingua: string): string {
    const [caminho, resto] = partir(caminhoSemLingua(url));
    if (!LINGUAS_COM_PREFIXO.includes(lingua)) return caminho + resto;
    return (caminho === '/' ? `/${lingua}` : `/${lingua}${caminho}`) + resto;
}

@Injectable({
    providedIn: 'root'
})
export class LanguageService {
    private readonly LANG_KEY = 'lang';
    private readonly emBrowser = isPlatformBrowser(inject(PLATFORM_ID));
    private readonly doc = inject(DOCUMENT);
    private readonly router = inject(Router);
    private primeiraNavegacao = true;

    /** A língua escolhida no seletor nesta visita, para a gravar se o visitante autorizar depois. */
    private escolhida: string | null = null;

    constructor(private translocoService: TranslocoService) { }

    /**
     * Chamado pela guarda de cada grupo de rotas (ver app.routes.ts): a língua é a da morada.
     * Carrega as traduções ANTES de a página se mostrar — na pré-renderização e no browser —,
     * para nunca aparecerem chaves cruas.
     *
     * Na primeira navegação no browser, quem já tinha escolhido outra língua (e autorizou que
     * ficasse guardada) e chega a uma morada portuguesa volta à sua. Só na primeira: depois,
     * escolher «PT» no seletor tem de levar ao português, e não devolvê-lo ao inglês. Uma
     * morada com língua (/en/termos) é sempre respeitada.
     */
    entrar(lingua: string, url: string): Observable<GuardResult> {
        const primeira = this.primeiraNavegacao;
        this.primeiraNavegacao = false;
        if (primeira && this.emBrowser && lingua === LINGUA_PREDEFINIDA && consentiu('functional')) {
            const guardada = localStorage.getItem(this.LANG_KEY);
            if (guardada && guardada !== LINGUA_PREDEFINIDA && LINGUAS_PERMITIDAS.includes(guardada)) {
                // replaceUrl: a morada portuguesa sai do histórico, e o «Voltar» leva ao sítio de
                // onde a pessoa veio, e não a uma página portuguesa que ela nunca pediu para ver.
                const destino = this.router.parseUrl(caminhoNaLingua(url, guardada));
                return of(new RedirectCommand(destino, { replaceUrl: true }));
            }
        }
        return this.translocoService.load(lingua).pipe(map(() => {
            this.ativar(lingua);
            return true;
        }));
    }

    getActiveLang(): string {
        return this.translocoService.getActiveLang();
    }

    /** Mostra o site nesta língua. Não mexe na preferência guardada: isso é só o seletor. */
    private ativar(lang: string) {
        this.translocoService.setActiveLang(lang);

        // Sem isto o <html lang> ficava preso em pt-PT: um visitante em English
        // tinha a página declarada como portuguesa e o leitor de ecrã lia inglês
        // com fonética portuguesa. Vai por DOCUMENT para correr na pré-renderização.
        this.doc.documentElement.lang = lang;
    }

    /**
     * A língua escolhida no seletor. É a única coisa que muda a preferência: abrir uma ligação
     * para /en/… (partilhada, ou vinda do Google) mostra o inglês, mas não faz do inglês a
     * língua de quem só lá foi parar.
     *
     * A preferência de idioma é a categoria «Funcionais» do banner, e por isso só é gravada
     * depois de o visitante a autorizar. Enquanto não autorizar, não deixa rasto.
     */
    guardarEscolha(lang: string) {
        if (!LINGUAS_PERMITIDAS.includes(lang)) return;
        this.escolhida = lang;
        if (this.emBrowser && consentiu('functional')) {
            localStorage.setItem(this.LANG_KEY, lang);
        }
    }

    /**
     * Chamado pelo banner logo depois de o visitante responder: grava a língua
     * que ele escolheu no seletor se autorizou, e apaga o que estivesse gravado se
     * recusou. Sem isto, aceitar os cookies depois de trocar de idioma perdia
     * a escolha, e recusá-los deixava para trás o valor de uma visita anterior.
     */
    aplicarConsentimento(): void {
        if (!this.emBrowser) return;
        if (!consentiu('functional')) {
            localStorage.removeItem(this.LANG_KEY);
        } else if (this.escolhida) {
            localStorage.setItem(this.LANG_KEY, this.escolhida);
        }
    }
}
