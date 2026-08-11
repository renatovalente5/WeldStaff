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

    // Vários componentes chamam `translate()` de forma síncrona no ngOnInit. Sem
    // as traduções em cache, isso devolveria a chave crua e era ISSO que ficava
    // gravado no HTML estático (títulos e descrições incluídos). Carregar a língua
    // antes do arranque garante que o HTML pré-renderizado sai em português.
    provideAppInitializer(() => inject(TranslocoService).load(LINGUA_PRE_RENDERIZADA)),
  ]
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
