import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

export interface ContactPayload {
  name: string;
  email: string;
  phone?: string;
  subject?: string;
  message: string;
  turnstileToken: string;
  website?: string; // honeypot
}

@Injectable({
  providedIn: 'root'
})
export class ContactService {

  constructor(private http: HttpClient) { }

  sendContactForm(payload: ContactPayload): Observable<any> {
    return this.http.post<{ ok: boolean; error?: string }>(`${environment.apiUrl}/contact`, payload);
  }
}
