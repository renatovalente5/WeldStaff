import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { caminhoNaLingua } from '../../core/services/language';

/**
 * Um caminho do site na língua que está a ser vista: `'/contactos' | naLingua` dá
 * '/en/contactos' numa página inglesa. Impuro de propósito: a língua muda sem o caminho mudar.
 */
@Pipe({ name: 'naLingua', standalone: true, pure: false })
export class NaLinguaPipe implements PipeTransform {
    private readonly transloco = inject(TranslocoService);

    transform(caminho: string): string {
        return caminhoNaLingua(caminho, this.transloco.getActiveLang());
    }
}
