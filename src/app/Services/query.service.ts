import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { QueryRequestBody } from '../components/dashboard/dashboard.component';

@Injectable({
  providedIn: 'root'
})
export class QueryService {
  private queryBody = new BehaviorSubject<QueryRequestBody | null>(null);
  setQueryBody(body: QueryRequestBody) {
    this.queryBody.next(body);
  }
  getQueryBody() {
    return this.queryBody.asObservable();
  }
}