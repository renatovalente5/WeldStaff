import { Component, ElementRef, EventEmitter, HostBinding, Input, NgZone, OnDestroy, Output, ViewChild, afterNextRender } from '@angular/core';

declare global {
    interface Window {
        turnstile?: {
            render: (el: HTMLElement, options: any) => string;
            reset: (widgetId?: string) => void;
            remove: (widgetId: string) => void;
            execute: (widgetId: string, options?: any) => void;
        };
    }
}

// O widget fica no sítio, invisível e com 0 px de altura, até a Cloudflare pedir um
// clique (appearance: 'interaction-only'). Antes vivia fora do ecrã: o widget está em modo
// «managed», e quando a Cloudflare pedia a caixa a quem a devia marcar, ela não se via.
@Component({
    selector: 'app-turnstile',
    template: `<div #container></div>`,
    styles: [`:host { display: block; } :host(.a-pedir-interacao) { margin: 0 0 1rem; }`],
})
export class TurnstileComponent implements OnDestroy {
    @Input({ required: true }) siteKey!: string;
    @Output() tokenChange = new EventEmitter<string>();
    /** true quando a Cloudflare mostra a caixa e espera um clique; false quando deixa de esperar. */
    @Output() interacao = new EventEmitter<boolean>();

    @HostBinding('class.a-pedir-interacao') aPedirInteracao = false;

    @ViewChild('container', { static: true }) container!: ElementRef<HTMLElement>;

    private widgetId?: string;
    private destroyed = false;

    constructor(private zone: NgZone) {
        // O `window` não existe durante a pré-renderização estática; o widget
        // do Turnstile só pode ser montado depois do render no browser.
        afterNextRender(() => this.waitForTurnstileAndRender());
    }

    private waitForTurnstileAndRender() {
        const tryRender = () => {
            if (this.destroyed) return;

            if (window.turnstile?.render) {
                this.renderWidget();
                return;
            }

            // tenta novamente daqui a 150ms
            setTimeout(tryRender, 150);
        };

        tryRender();
    }

    private renderWidget() {
        this.zone.runOutsideAngular(() => {
            this.widgetId = window.turnstile!.render(this.container.nativeElement, {
                sitekey: this.siteKey,
                theme: 'light',
                // «invisible» não existe no Turnstile (só normal, flexible e compact) e lançava um
                // TurnstileError em todas as páginas. Flexible ocupa a largura do formulário.
                size: 'flexible',
                appearance: 'interaction-only',
                execution: 'execute', // Do NOT challenge automatically on render
                callback: (token: string) => {
                    this.zone.run(() => this.tokenChange.emit(token));
                },
                'expired-callback': () => {
                    this.zone.run(() => this.tokenChange.emit(''));
                },
                'error-callback': () => {
                    this.zone.run(() => this.tokenChange.emit(''));
                },
                'before-interactive-callback': () => {
                    this.zone.run(() => this.mudarInteracao(true));
                },
                'after-interactive-callback': () => {
                    this.zone.run(() => this.mudarInteracao(false));
                },
                // A pessoa não marcou a caixa a tempo: o desafio caducou.
                'timeout-callback': () => {
                    this.zone.run(() => { this.mudarInteracao(false); this.tokenChange.emit(''); });
                },
            });
        });
    }

    private mudarInteracao(valor: boolean) {
        this.aPedirInteracao = valor;
        this.interacao.emit(valor);
    }

    /** Trigger the Turnstile challenge manually (call on form submit) */
    execute(): void {
        if (this.widgetId && window.turnstile?.execute) {
            window.turnstile.execute(this.widgetId);
        }
    }

    /** Reset the widget (e.g. after a failed submit) */
    reset(): void {
        if (this.widgetId && window.turnstile?.reset) {
            window.turnstile.reset(this.widgetId);
        }
    }

    ngOnDestroy(): void {
        this.destroyed = true;
        if (this.widgetId && window.turnstile?.remove) {
            window.turnstile.remove(this.widgetId);
        }
    }
}
