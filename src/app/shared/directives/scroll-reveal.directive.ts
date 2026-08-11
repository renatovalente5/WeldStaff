import { Directive, ElementRef, OnDestroy, afterNextRender } from '@angular/core';

@Directive({
    selector: '[appScrollReveal]',
    standalone: true
})
export class ScrollRevealDirective implements OnDestroy {
    private observer: IntersectionObserver | undefined;

    constructor(private el: ElementRef) {
        // Tudo isto só corre no browser, por duas razões:
        // 1) o IntersectionObserver não existe em Node e rebentaria a pré-renderização;
        // 2) se o `opacity: 0` fosse aplicado no servidor, ficava gravado no HTML estático
        //    e o conteúdo aparecia invisível a quem não executa JavaScript.
        afterNextRender(() => this.ativar());
    }

    private ativar() {
        this.el.nativeElement.style.opacity = '0';
        this.el.nativeElement.style.transform = 'translateY(20px)';
        this.el.nativeElement.style.transition = 'opacity 0.6s cubic-bezier(0.4, 0.0, 0.2, 1), transform 0.6s cubic-bezier(0.4, 0.0, 0.2, 1)';

        const options = {
            root: null,
            threshold: 0.1,
            rootMargin: '0px'
        };

        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this.el.nativeElement.style.opacity = '1';
                    this.el.nativeElement.style.transform = 'translateY(0)';
                    if (this.observer) this.observer.unobserve(entry.target);
                }
            });
        }, options);

        this.observer.observe(this.el.nativeElement);
    }

    ngOnDestroy() {
        if (this.observer) {
            this.observer.disconnect();
        }
    }
}
