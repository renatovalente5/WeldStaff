import { ApplicationConfig, provideBrowserGlobalErrorListeners, isDevMode, provideAppInitializer, inject, PLATFORM_ID } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter, withInMemoryScrolling } from '@angular/router';

import { routes } from './app.routes';
import { provideHttpClient } from '@angular/common/http';
import { TranslocoHttpLoader } from './transloco-loader';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { linguaDoCaminho } from './core/services/language';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideAnimationsAsync(),
    provideRouter(routes, withInMemoryScrolling({
      anchorScrolling: 'enabled',
      scrollPositionRestoration: 'enabled'
    })), provideHttpClient(), provideTransloco({
      config: {
        availableLangs: ['pt-PT', 'en', 'fr', 'es'],
        defaultLang: 'pt-PT',
        // Remove this option if your application doesn't support changing language in runtime.
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: TranslocoHttpLoader
    }), provideClientHydration(withEventReplay()),

    // O cabeçalho e o rodapé ficam fora das rotas e são hidratados logo no arranque. Sem a
    // língua da morada já carregada, as traduções deles ficavam vazias até o JSON chegar (o
    // menu e o rodapé piscavam em branco em todas as páginas) e, em /en, passavam pelo
    // português antes do inglês. No servidor quem carrega é o app.config.server.ts.
    provideAppInitializer(() => {
      if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
      const transloco = inject(TranslocoService);
      const lingua = linguaDoCaminho(inject(DOCUMENT).location.pathname);
      transloco.setActiveLang(lingua);
      return firstValueFrom(transloco.load(lingua));
    })
  ]
};
