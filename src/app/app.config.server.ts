import { mergeApplicationConfig, ApplicationConfig, provideAppInitializer, inject } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { TRANSLOCO_LOADER, TranslocoService } from '@jsverse/transloco';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';
import { TranslocoDiskLoader } from './transloco-loader.server';

const LINGUA_PRE_RENDERIZADA = 'pt-PT';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),

    // Substitui o carregador HTTP pelo que lê as traduções do bundle.
    // Vem depois do appConfig, por isso é este que vale na pré-renderização.
    { provide: TRANSLOCO_LOADER, useClass: TranslocoDiskLoader },

    // O cabeçalho e o rodapé pintam antes de a rota decidir a língua; com o português
    // já em cache nunca saem com chaves cruas. A língua de cada página (/en, /fr, /es)
    // é carregada pela guarda da rota (app.routes.ts) antes de a página se desenhar.
    provideAppInitializer(() => inject(TranslocoService).load(LINGUA_PRE_RENDERIZADA)),
  ]
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
