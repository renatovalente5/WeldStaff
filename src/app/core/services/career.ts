import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Job {
  id: number;
  titleKey: string;
  locationKey?: string;
  shortDescKey: string;
  longDescKey: string;
  tagsKey: string[]; // keys for chips
}

@Injectable({
  providedIn: 'root'
})
export class CareerService {

  private jobs: Job[] = [
    {
      id: 1,
      titleKey: 'jobs.foreman_piping.title',
      shortDescKey: 'jobs.foreman_piping.shortDesc',
      longDescKey: 'jobs.foreman_piping.longDesc',
      tagsKey: ['tags.immediate', 'tags.long_term', 'tags.documentation']
    },
    {
      id: 2,
      titleKey: 'jobs.welders_general.title',
      shortDescKey: 'jobs.welders_general.shortDesc',
      longDescKey: 'jobs.welders_general.longDesc',
      tagsKey: ['tags.immediate', 'tags.stable', 'tags.experience']
    },
    {
      id: 3,
      titleKey: 'jobs.helpers_ribatejo.title',
      shortDescKey: 'jobs.helpers_ribatejo.shortDesc',
      longDescKey: 'jobs.helpers_ribatejo.longDesc',
      tagsKey: ['tags.immediate', 'tags.accommodation', 'tags.short_term']
    },
    {
      id: 4,
      titleKey: 'jobs.pipefitters_general.title',
      shortDescKey: 'jobs.pipefitters_general.shortDesc',
      longDescKey: 'jobs.pipefitters_general.longDesc',
      tagsKey: ['tags.immediate', 'tags.long_term', 'tags.documentation']
    },
    {
      id: 5,
      titleKey: 'jobs.tig_inox_setubal.title',
      shortDescKey: 'jobs.tig_inox_setubal.shortDesc',
      longDescKey: 'jobs.tig_inox_setubal.longDesc',
      tagsKey: ['tags.immediate', 'tags.specialized', 'tags.certification']
    },
    {
      id: 6,
      titleKey: 'jobs.admin_aveiro.title',
      shortDescKey: 'jobs.admin_aveiro.shortDesc',
      longDescKey: 'jobs.admin_aveiro.longDesc',
      tagsKey: ['tags.immediate', 'tags.office', 'tags.organization']
    }
  ];

  constructor(private http: HttpClient) { }

  getJobs(): Observable<Job[]> {
    return new Observable(observer => {
      // Find jobs in Angular works synchronous if data is hardcoded
      observer.next(this.jobs);
      observer.complete();
    });
  }

  sendApplication(formData: FormData): Observable<any> {
    return this.http.post<{ ok: boolean; error?: string }>(`${environment.apiUrl}/apply`, formData);
  }
}
