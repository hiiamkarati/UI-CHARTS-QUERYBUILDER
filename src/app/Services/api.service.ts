import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ChartType } from 'chart.js';

export interface ApiQuery {
  id: number;
  queryName: string;
  sqlQuery: string;
  savedAt: string;
}

export interface FilterColumn {
  name: string;
  type: string;
  values: any[];
}

export interface Filter {
  column: string;
  operation: string;
  value?: string | number;
  values: (string | number)[];
  valueStart?: string | number;
  valueEnd?: string | number;
  availableOperations: string[];
  availableValues: any[];
  condition: string;
  isMultiSelectOpen?: boolean;
}

export interface SortColumn {
  column: string;
  order: 'asc' | 'desc';
}

export interface ApiChart {
  id: number;
  chartName: string;
  chartType: ChartType | 'bar_stacked' | 'histogram';
  queryId: number;
  createdAt: string;
  tableName: string;
  xAxisColumns: string[];
  yAxisColumns: string[];
  aggregateFunction: string;
  filters: Filter[];
  sortColumns: SortColumn[];
  dataLimit: number;
  saved: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private baseUrl = 'http://localhost:5000/api';
  http = inject(HttpClient);

  SaveSqlQuery(query: ApiQuery): Observable<ApiQuery> {
    return this.http.post<ApiQuery>(`${this.baseUrl}/Queries/save`, query).pipe(
      catchError((error) => {
        console.error('Save SQL Error:', error);
        return throwError(() => new Error(error.message || 'Failed to save SQL query'));
      })
    );
  }

  GetSqlHistory(): Observable<ApiQuery[]> {
    return this.http.post<ApiQuery[]>(`${this.baseUrl}/Queries/get-all`, {}).pipe(
      catchError((error) => {
        console.error('Get SQL History Error:', error);
        return throwError(() => new Error(error.message || 'Failed to fetch SQL history'));
      })
    );
  }

  SaveChart(chart: ApiChart): Observable<ApiChart> {
    return this.http.post<ApiChart>(`${this.baseUrl}/Charts/save`, chart).pipe(
      catchError((error) => {
        console.error('Save Chart Error:', error);
        return throwError(() => new Error(error.message || 'Failed to save chart'));
      })
    );
  }

  GetCharts(): Observable<ApiChart[]> {
    return this.http.post<ApiChart[]>(`${this.baseUrl}/Charts/get-all`, {}).pipe(
      catchError((error) => {
        console.error('Get Charts Error:', error);
        return throwError(() => new Error(error.message || 'Failed to fetch charts'));
      })
    );
  }

  GetTableApi(payload: any): Observable<string[]> {
    return this.http.post<string[]>(`${this.baseUrl}/dashboard/tables`, payload).pipe(
      catchError((error) => {
        console.error('Get Tables Error:', error);
        return throwError(() => new Error(error.message || 'Failed to fetch table names'));
      })
    );
  }

  GetColumnApi(selectedTable: string): Observable<string[]> {
    const payload = { tableName: selectedTable };
    return this.http.post<string[]>(`${this.baseUrl}/dashboard/fields`, payload).pipe(
      catchError((error) => {
        console.error('Get Columns Error:', error);
        return throwError(() => new Error(error.message || 'Failed to fetch column names'));
      })
    );
  }

  GetData(selectedTable: string): Observable<any[]> {
    const payload = { tableName: selectedTable };
    return this.http.post<any[]>(`${this.baseUrl}/dashboard/dynamic-query`, payload).pipe(
      catchError((error) => {
        console.error('Get Data Error:', error);
        return throwError(() => new Error(error.message || 'Failed to fetch table data'));
      })
    );
  }

  GetExecuteJoinFilter(requestBody: any): Observable<any[]> {
    return this.http.post<any[]>(`${this.baseUrl}/dashboard/execute`, requestBody).pipe(
      catchError((error) => {
        console.error('Execute Join/Filter Error:', error);
        return throwError(() => new Error(error.message || 'Failed to execute join/filter'));
      })
    );
  }

  GetDataTypeData(table: string): Observable<Record<string, string>> {
    const payload = { tableName: table };
    return this.http.post<Record<string, string>>(`${this.baseUrl}/dashboard/get-columns`, payload).pipe(
      catchError((error) => {
        console.error('Get Data Type Error:', error);
        return throwError(() => new Error(error.message || 'Failed to fetch data types'));
      })
    );
  }

  GetDistinctColValues(tableName: string, columnName: string): Observable<any[]> {
    return this.http.post<any[]>(`${this.baseUrl}/dashboard/distinct-values`, { tableName, columns: [columnName] }).pipe(
      catchError((error) => {
        console.error('Get Distinct Values Error:', error);
        return throwError(() => new Error(error.message || 'Failed to fetch distinct values'));
      })
    );
  }

  GetGrouping(groupingBody: any): Observable<any[]> {
    return this.http.post<any[]>(`${this.baseUrl}/dashboard/groupby-aggregate`, groupingBody).pipe(
      catchError((error) => {
        console.error('Get Grouping Error:', error);
        return throwError(() => new Error(error.message || 'Failed to fetch grouped data'));
      })
    );
  }

  GetAppendTable(appendBody: any): Observable<any[]> {
    return this.http.post<any[]>(`${this.baseUrl}/dashboard/append`, appendBody).pipe(
      catchError((error) => {
        console.error('Get Append Table Error:', error);
        return throwError(() => new Error(error.message || 'Failed to append tables'));
      })
    );
  }

  GenerateSqlQuery(requestBody: any): Observable<string> {
    return this.http.post<{ sqlQuery: string }>(`${this.baseUrl}/dashboard/generate-sql`, requestBody).pipe(
      catchError((error) => {
        console.error('Generate SQL Query Error:', error);
        return throwError(() => new Error(error.message || 'Failed to generate SQL query'));
      }),
      map((response: { sqlQuery: string }) => response.sqlQuery)
    );
  }

  executeSqlQuery(body: { sqlQuery: string }): Observable<any[]> {
    return this.http.post<any[]>(`${this.baseUrl}/dashboard/execute-sql`, body).pipe(
      catchError((error) => {
        console.error('Execute SQL Query Error:', error);
        return throwError(() => new Error(error.message || 'Failed to execute SQL query'));
      })
    );
  }

  DeleteChart(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/Charts/delete/${id}`).pipe(
      catchError((error) => {
        console.error('Delete Chart Error:', error);
        return throwError(() => new Error(error.message || 'Failed to delete chart'));
      })
    );
  }
}