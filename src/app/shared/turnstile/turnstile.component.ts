import { Component, ElementRef, EventEmitter, Input, NgZone, OnDestroy, Output, ViewChild, afterNextRender } from '@angular/core';

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

@Component({
    selector: 'app-turnstile',
    template: `<div #container style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;"></div>`,
})
export class TurnstileComponent implements OnDestroy {
    @Input({ required: true }) siteKey!: string;
    @Output() tokenChange = new EventEmitter<string>();

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
                size: 'invisible',
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
            });
        });
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
