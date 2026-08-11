import { Directive, ElementRef, Input, Renderer2, afterNextRender } from '@angular/core';

@Directive({
    selector: '[appCountUp]',
    standalone: true
})
export class CountUpDirective {
    @Input('appCountUp') targetValue: number = 0;
    @Input() duration: number = 2000; // ms
    @Input() prefix: string = '';
    @Input() suffix: string = '';

    private hasAnimated = false;

    constructor(private el: ElementRef, private renderer: Renderer2) {
        // O IntersectionObserver e o requestAnimationFrame não existem em Node.
        // No HTML pré-renderizado fica o valor que está no template; a contagem
        // arranca no browser, quando o elemento entra no ecrã.
        afterNextRender(() => this.createObserver());
    }

    private createObserver() {
        const options = {
            root: null,
            rootMargin: '0px',
            threshold: 0.2
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !this.hasAnimated) {
                    this.animate();
                    this.hasAnimated = true;
                    observer.unobserve(this.el.nativeElement);
                }
            });
        }, options);

        observer.observe(this.el.nativeElement);
    }

    private animate() {
        let startTimestamp: number | null = null;
        const startValue = 0;

        const step = (timestamp: number) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / this.duration, 1);

            // Easing function (easeOutExpo) for premium feel
            const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);

            const currentValue = Math.floor(easeProgress * (this.targetValue - startValue) + startValue);

            this.renderer.setProperty(
                this.el.nativeElement,
                'innerText',
                `${this.prefix}${currentValue}${this.suffix}`
            );

            if (progress < 1) {
                window.requestAnimationFrame(step);
            } else {
                // Ensure final value is exact
                this.renderer.setProperty(
                    this.el.nativeElement,
                    'innerText',
                    `${this.prefix}${this.targetValue}${this.suffix}`
                );
            }
        };

        window.requestAnimationFrame(step);
    }
}
