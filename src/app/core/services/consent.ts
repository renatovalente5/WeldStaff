/**
 * A ponte entre a escolha que o banner de cookies recolhe e o código que
 * guarda alguma coisa no browser.
 *
 * O site inteiro armazena exatamente duas coisas: a resposta ao banner
 * (`cookie_consent`) e a preferência de idioma (`lang`). A primeira é
 * essencial — sem ela não há como saber que a pergunta já foi feita. A
 * segunda é o que o banner descreve como «Funcionais: permitem
 * funcionalidades adicionais como preferência de idioma», e é por isso a
 * única coisa que a resposta do visitante governa.
 *
 * Sem estas funções o banner recolhia uma resposta que ninguém lia: carregar
 * em «Rejeitar» guardava `functional: false` e o idioma continuava a ser
 * escrito à mesma.
 */

export const CHAVE_CONSENTIMENTO = 'cookie_consent';

/** Categorias que o banner apresenta. As essenciais não são recusáveis. */
export type CategoriaCookies = 'essential' | 'functional';

/**
 * Envolvido em try/catch porque o localStorage atira em navegação privada de
 * alguns browsers e quando o utilizador bloqueia dados de sites — e nesse
 * caso a resposta certa é «não consentiu», não uma exceção.
 */
export function consentiu(categoria: CategoriaCookies): boolean {
    try {
        const bruto = localStorage.getItem(CHAVE_CONSENTIMENTO);
        if (!bruto) return false;
        return JSON.parse(bruto)[categoria] === true;
    } catch {
        return false;
    }
}

/** Se já houve resposta ao banner, seja ela qual for. */
export function jaRespondeu(): boolean {
    try {
        return localStorage.getItem(CHAVE_CONSENTIMENTO) !== null;
    } catch {
        return false;
    }
}
