import { trigger, transition, style, query, animate, group } from '@angular/animations';

export const routeAnimations = trigger('routeAnimations', [
    transition('* <=> *', [
        // Grid handles layout overlap. 
        // We only animate opacity/transform, allowing the container to size naturally.
        query(':enter', [
            style({ opacity: 0, transform: 'translateY(15px)', zIndex: 1, gridArea: 'content' })
        ], { optional: true }),
        group([
            query(':leave', [
                animate('300ms cubic-bezier(0.4, 0.0, 0.2, 1)', style({ opacity: 0, transform: 'translateY(-15px)' }))
            ], { optional: true }),
            query(':enter', [
                animate('400ms cubic-bezier(0.175, 0.885, 0.32, 1.275)', style({ opacity: 1, transform: 'translateY(0)' })) // Spring ease on enter
            ], { optional: true })
        ])
    ])
]);
