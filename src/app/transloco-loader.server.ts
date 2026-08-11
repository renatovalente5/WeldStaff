import { Injectable } from '@angular/core';
import { Translation, TranslocoLoader } from '@jsverse/transloco';
import { Observable, of } from 'rxjs';

import en from '../assets/i18n/en.json';
import es from '../assets/i18n/es.json';
import fr from '../assets/i18n/fr.json';
import ptPT from '../assets/i18n/pt-PT.json';

/**
 * Carregador de traduções usado APENAS durante a pré-renderização estática.
 *
 * O TranslocoHttpLoader normal vai buscar `/assets/i18n/<lang>.json` por HTTP, o que não
 * funciona em Node: não há origem para resolver o caminho relativo nem servidor a servir os
 * assets. Aqui as traduções são importadas para o bundle do servidor, ficando disponíveis de
 * forma síncrona — assim o HTML pré-renderizado sai já com os textos, em vez de sair com as
 * chaves cruas ou vazio.
 *
 * O bundle do servidor não é publicado (outputMode: 'static'), por isso o peso destes JSON
 * não chega ao browser.
 */
const TRADUCOES: Record<string, Translation> = {
    'pt-PT': ptPT as Translation,
    en: en as Translation,
    fr: fr as Translation,
    es: es as Translation,
};

@Injectable({ providedIn: 'root' })
export class TranslocoDiskLoader implements TranslocoLoader {
    getTranslation(lang: string): Observable<Translation> {
        return of(TRADUCOES[lang] ?? TRADUCOES['pt-PT']);
    }
}
