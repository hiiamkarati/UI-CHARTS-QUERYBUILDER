import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  NgZone,
  OnInit,
  QueryList,
  Renderer2,
  ViewChild,
  ViewChildren,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService, ApiQuery } from '../../Services/api.service';
import { QueryService } from '../../Services/query.service';
import { HeaderComponent } from '../header/header.component';
import { Query } from '../../Shared/Interface/Query';
import { Join } from '../../Shared/Interface/Join';
import { Filter, FilterColumn } from '../../Shared/Interface/Filter';
import { GroupingData, HavingCondition } from '../../Shared/Interface/Group';
import { Chart } from '../../Shared/Interface/Charts';
import { Dashboard } from '../../Shared/Interface/Dashboard';
import { timeout, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

interface AppendTable {
  table: string;
  unionType: 'UNION' | 'UNION ALL';
  dropDuplicates: boolean;
}

export interface QueryRequestBody {
  tableName: string;
  columnNames: string[];
  joins: { joinTable: string; joinType: string; sourceColumn: string; targetColumn: string }[];
  filters: any[];
  groupByColumns?: string[];
  aggregations?: { function: string; column: string; alias: string }[];
  havingConditions?: { aggregateColumn: string; operator: string; value: string | number; logicalOperator: string }[];
  append?: AppendTable;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css'],
})
export class DashboardComponent implements OnInit {
  title = 'DynamicDashboard';
  queries: Query[] = [];
  queryCount = 0;
  charts: Chart[] = [];
  chartCount = 0;
  dashboards: Dashboard[] = [];
  dashboardCount = 0;
  selectedQuery: Query | null = null;
  queryTitle = '';
  tables: string[] = [];
  apiService = inject(ApiService);
  queryService = inject(QueryService); // Added QueryService
  isCopied = false;
  queryName = '';
  sqlHistoryData: ApiQuery[] = [];
  userId = 0;
  currentPage = 1;
  itemsPerPage = 10;
  totalItems = 0;
  pageSizeOptions = [5, 10, 25, 50, 100];
  isLoading = false;
  readonly API_TIMEOUT = 30000;

  @ViewChild('overlay') overlay!: ElementRef;
  showOverlay = false;
  showTableOverlay = false;
  showColumnOverlay = false;
  showAddColumnOverlay = false;
  showJoinTableOverlay = false;
  showAppendTableOverlay = false;
  showCustomOperationOverlay = false;
  showFilterRowsOverlay = false;
  showGroupSummarizeOverlay = false;
  showSqlTemplateOverlay = false;
  showSqlHistoryOverlay = false;
  showSaveSqlOverlay = false;

  joinTypes = ['INNER', 'LEFT', 'RIGHT', 'FULL'];
  columnTypes = ['string', 'integer', 'decimal', 'DateTime'];
  filterColumns: FilterColumn[] = [];
  operations: Record<string, string[]> = {
    string: ['is', 'is not', 'contains', 'does not contain', 'starts with', 'ends with', 'is set', 'is not set', 'in'],
    integer: ['equals', 'not equals', 'greater than', 'greater than or equals', 'less than', 'less than or equals', 'between', 'in'],
    decimal: ['equals', 'not equals', 'greater than', 'greater than or equals', 'less than', 'less than or equals', 'between', 'in'],
    DateTime: ['equals', 'not equals', 'greater than', 'greater than or equals', 'less than', 'less than or equals', 'between', 'in'],
  };
  aggregateFunctions = ['SUM', 'COUNT', 'MAX', 'MIN', 'AVG'];
  havingOperators: Record<string, string[]> = {
    integer: ['=', '!=', '>', '>=', '<', '<='],
    decimal: ['=', '!=', '>', '>=', '<', '<='],
    string: ['=', '!='],
    DateTime: ['=', '!=', '>', '>=', '<', '<='],
  };

  newColumnExpression = '';
  newColumnName = '';
  newColumnType = '';
  selectedTableToAppend = '';
  unionType: 'UNION' | 'UNION ALL' = 'UNION';
  dropDuplicates = 'No';
  customExpression = '';
  filters: Filter[] = [];
  joins: Join[] = [];
  groups: GroupingData[] = [];
  havingConditions: HavingCondition[] = [];
  tooltipVisible = false;
  tooltipText = '';
  tooltipStyles = {};
  selectedJoin: Join | null = null;
  joinIndex = 0;
  tabledata: any[] = [];
  columns: string[] = [];
  selectedColumns: string[] = [];
  sortColumn = '';
  sortDirection: 'asc' | 'desc' = 'asc';
  dataType: Record<string, string> = {};
  sqlTemplate = '';

  constructor(
    private renderer: Renderer2,
    private zone: NgZone,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.getTableNames();
  }

  private parseDate(value: any): Date | null {
    if (!value) return null;
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }

  get paginatedTableData(): any[] {
    if (!this.selectedQuery?.tableData) return [];
    this.totalItems = this.selectedQuery.tableData.length;
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    return this.selectedQuery.tableData.slice(startIndex, endIndex);
  }

  get totalPages(): number {
    return Math.ceil(this.totalItems / this.itemsPerPage);
  }

  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.cdr.detectChanges();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.cdr.detectChanges();
    }
  }

  onPageSizeChange(): void {
    this.currentPage = 1;
    this.cdr.detectChanges();
  }

  getPageRangeText(): string {
    if (!this.selectedQuery?.tableData?.length) return '0 of 0';
    const start = (this.currentPage - 1) * this.itemsPerPage + 1;
    const end = Math.min(this.currentPage * this.itemsPerPage, this.totalItems);
    return `${start}-${end} of ${this.totalItems}`;
  }

  sortTable(column: string) {
    if (!this.selectedQuery?.tableData) return;
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }
    this.selectedQuery.tableData.sort((a, b) => {
      const valueA = a[column] != null ? a[column].toString().toLowerCase() : '';
      const valueB = b[column] != null ? b[column].toString().toLowerCase() : '';
      if (valueA === '' && valueB !== '') return 1;
      if (valueB === '' && valueA !== '') return -1;
      if (valueA === '' && valueB === '') return 0;
      return this.sortDirection === 'asc' ? valueA.localeCompare(valueB) : valueB.localeCompare(valueA);
    });
    this.currentPage = 1;
    this.cdr.detectChanges();
  }

  getTableNames() {
    this.isLoading = true;
    this.apiService
      .GetTableApi([])
      .pipe(
        timeout(this.API_TIMEOUT),
        catchError((err) => {
          console.error('Error fetching table names:', err);
          alert(`Failed to load table names: ${err.message || 'An unexpected error occurred'}`);
          this.isLoading = false;
          this.cdr.detectChanges();
          return throwError(() => err);
        })
      )
      .subscribe((res: any) => {
        this.tables = res.sort((a: string, b: string) => a.localeCompare(b));
        this.isLoading = false;
        this.cdr.detectChanges();
      });
  }

  addQueries() {
    this.queryCount++;
    const newQuery: Query = {
      id: this.queryCount,
      name: `Query ${this.queryCount}`,
      selectedTable: '',
      selectedTableToAppend: '',
      selectedColumns: [],
      allColumns: [],
      columnList: [],
      tableData: [],
      joins: [],
      filters: [],
      groups: [],
      havingConditions: [],
      dropDuplicates: '',
      sort: [],
      aggregations: [],
      groupByColumns: []
    };
    this.queries.push(newQuery);
    this.openQuery(newQuery);
  }

  openQuery(query: Query) {
    this.selectedQuery = query;
    this.queryTitle = query.name;
    this.filters = query.filters;
    this.joins = query.joins ?? [];
    this.groups = query.groups;
    this.havingConditions = query.havingConditions;
    this.currentPage = 1;
    if (query.selectedTable) {
      if (query.joins?.length) this.fetchJoinData();
      else if (query.groups?.length) this.GetGroupingData();
      else if (query.filters?.length) this.applyFilters();
      else this.fetchTableData();
    }
    this.cdr.detectChanges();
  }

  updateSelectedQueryName() {
    if (this.selectedQuery) this.selectedQuery.name = this.queryTitle;
  }

  deleteQuery(queryId: number) {
    this.queries = this.queries.filter((q) => q.id !== queryId);
    if (this.selectedQuery?.id === queryId) {
      this.selectedQuery = null;
      this.queryTitle = '';
    }
    this.cdr.detectChanges();
  }

  selectTable(table: string) {
    if (this.selectedQuery) {
      this.selectedQuery.selectedTable = table;
      this.selectedQuery.columnList = [];
      this.selectedQuery.allColumns = [];
      this.selectedQuery.selectedColumns = [];
      this.selectedQuery.filters = [];
      this.filters = [];
      this.selectedQuery.joins = [];
      this.joins = [];
      this.selectedQuery.groups = [];
      this.groups = [];
      this.selectedQuery.havingConditions = [];
      this.havingConditions = [];
      this.dataType = {};
      this.filterColumns = [];
      this.fetchTableMetadata(table).then(() => {
        this.fetchTableData();
      });
      this.cdr.detectChanges();
    }
    this.closeTableOverlay();
  }

  async fetchTableMetadata(table: string): Promise<void> {
    if (!table) return;
    this.isLoading = true;
    try {
      const dataTypes = await this.apiService
        .GetDataTypeData(table)
        .pipe(
          timeout(this.API_TIMEOUT),
          catchError((err) => {
            console.error('Error fetching data types:', err);
            alert(`Failed to load column metadata for table '${table}': ${err.message || 'An unexpected error occurred'}`);
            this.isLoading = false;
            this.cdr.detectChanges();
            return throwError(() => err);
          })
        )
        .toPromise();

      console.log(`Data types for table '${table}':`, dataTypes);

      if (!dataTypes || Object.keys(dataTypes).length === 0) {
        alert(`No columns found for table '${table}'.`);
        this.isLoading = false;
        this.cdr.detectChanges();
        return;
      }

      const validDataTypes = ['string', 'integer', 'decimal', 'DateTime'];
      const columns = Object.keys(dataTypes).sort((a, b) => a.localeCompare(b));
      const filteredDataTypes: Record<string, string> = {};

      const typeMapping: Record<string, FilterColumn['type']> = {
        String: 'string',
        Text: 'string',
        Integer: 'integer',
        Decimal: 'decimal',
        Date: 'DateTime',
        Time: 'DateTime',
        Datetime: 'DateTime',
      };

      this.filterColumns = columns.map((col) => {
        let dataType = dataTypes[col];
        const normalizedDataType = typeMapping[dataType] || 'string';
        if (!validDataTypes.includes(normalizedDataType)) {
          console.warn(`Invalid data type '${dataType}' for column '${col}' in table '${table}'. Defaulting to 'string'.`);
        }
        filteredDataTypes[col] = normalizedDataType;
        return {
          name: col,
          type: normalizedDataType as FilterColumn['type'],
          values: [],
        };
      });

      if (this.selectedQuery) {
        this.selectedQuery.columnList = columns;
        this.selectedQuery.allColumns = columns;
        this.dataType = filteredDataTypes;
      }

      this.isLoading = false;
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Exception in fetchTableMetadata:', err);
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  fetchDistinctColValues(index: number, columnName: string, tableName: string) {
    if (!columnName || !tableName) return;
    this.isLoading = true;
    this.apiService
      .GetDistinctColValues(tableName, columnName)
      .pipe(
        timeout(this.API_TIMEOUT),
        catchError((err) => {
          console.error('Error fetching distinct values:', err);
          alert(`Failed to load distinct values for column '${columnName}': ${err.message || 'An unexpected error occurred'}`);
          this.isLoading = false;
          this.cdr.detectChanges();
          return throwError(() => err);
        })
      )
      .subscribe((res: any) => {
        const columnType = this.dataType[columnName] || 'string';
        const filterCol = this.filterColumns.find((col) => col.name === columnName);
        let values: (string | number)[] = res
          .map((item: any) => {
            const value = item[columnName];
            if (columnType === 'integer') return parseInt(value, 10);
            if (columnType === 'decimal') return parseFloat(value);
            return value;
          })
          .filter((val: any) => val != null);

        values = values.sort((a: number | string, b: number | string) =>
          columnType === 'integer' || columnType === 'decimal' ? (a as number) - (b as number) : a.toString().localeCompare(b.toString())
        );

        this.filters[index].availableValues = values;

        if (filterCol) {
          if (columnType === 'integer' || columnType === 'decimal') {
            filterCol.values = values.filter((val): val is number => typeof val === 'number') as number[];
          } else {
            filterCol.values = values.map(String) as string[];
          }
        }

        this.isLoading = false;
        this.cdr.detectChanges();
      });
  }

  fetchTableData() {
    if (!this.selectedQuery?.selectedTable) return;
    const query = this.selectedQuery;
    this.isLoading = true;
    this.apiService
      .GetData(query.selectedTable)
      .pipe(
        timeout(this.API_TIMEOUT),
        catchError((err) => {
          console.error('Error fetching table data:', err);
          alert(`Failed to load data for table '${query.selectedTable}': ${err.message || 'An unexpected error occurred'}`);
          this.isLoading = false;
          this.cdr.detectChanges();
          return throwError(() => err);
        })
      )
      .subscribe((res: any) => {
        if (!res || !res.length) {
          alert(`No data found for table '${query.selectedTable}'.`);
          query.allColumns = [];
          query.tableData = [];
          query.selectedColumns = [];
        } else {
          query.allColumns = Object.keys(res[0]).sort((a, b) => a.localeCompare(b));
          query.tableData = res;
          if (!query.selectedColumns.length) query.selectedColumns = [...query.allColumns];
        }
        this.currentPage = 1;
        this.isLoading = false;
        this.cdr.detectChanges();
      });
  }

  async fetchJoinData() {
    if (!this.selectedQuery || !this.selectedQuery.selectedTable) {
      console.error('No selected query or table');
      alert('Please select a table before joining.');
      return;
    }
    if (!this.selectedQuery.joins?.length) {
      console.error('No joins defined');
      alert('Please define at least one join.');
      return;
    }
    const invalidJoins = this.selectedQuery.joins.filter(
      (join) => !join.joinTable || !join.joinType || !join.sourceColumn || !join.targetColumn
    );
    if (invalidJoins.length) {
      console.error('Invalid joins:', invalidJoins);
      alert('All joins must have a join table, type, source column, and target column.');
      return;
    }
    if (!this.selectedQuery.columnList.length) await this.fetchTableMetadata(this.selectedQuery.selectedTable);
    for (let i = 0; i < this.selectedQuery.joins.length; i++) {
      if (!this.selectedQuery.joins[i].rightColumns.length) await this.fetchRightColumnNames(this.selectedQuery.joins[i].joinTable, i);
    }
    const sourceColumns = (this.selectedQuery.columnList || []).map(
      (col) => (col.includes('.') ? col : `${this.selectedQuery!.selectedTable}.${col}`)
    );
    const joinColumns = this.selectedQuery.joins
      .filter((join) => join.joinTable && join.rightColumns)
      .flatMap((join) => join.rightColumns.map((col: string) => (col.includes('.') ? col : `${join.joinTable}.${col}`)));
    const columnNames = [...new Set([...sourceColumns, ...joinColumns])];
    const requestBody: QueryRequestBody = {
      tableName: this.selectedQuery.selectedTable,
      columnNames: columnNames.length ? columnNames : ['*'],
      joins: this.selectedQuery.joins.map((join) => ({
        joinTable: join.joinTable,
        joinType: join.joinType.toUpperCase(),
        sourceColumn: join.sourceColumn,
        targetColumn: join.targetColumn,
      })),
      filters: this.buildFilters(),
    };
    this.isLoading = true;
    this.apiService
      .GetExecuteJoinFilter(requestBody)
      .pipe(
        timeout(this.API_TIMEOUT),
        catchError((err) => {
          console.error('Join API Error:', err);
          alert(`Failed to fetch join data: ${err.error?.message || err.message || 'An unexpected error occurred'}`);
          this.isLoading = false;
          this.cdr.detectChanges();
          return throwError(() => err);
        })
      )
      .subscribe((res: any) => {
        if (!res?.length) {
          console.warn('No data from join API');
          this.selectedQuery!.tableData = [];
          this.selectedQuery!.allColumns = [];
          this.selectedQuery!.selectedColumns = [];
        } else {
          this.selectedQuery!.allColumns = Object.keys(res[0]).sort((a, b) => a.localeCompare(b));
          this.selectedQuery!.tableData = res;
          if (!this.selectedQuery!.selectedColumns.length) this.selectedQuery!.selectedColumns = [...this.selectedQuery!.allColumns];
        }
        this.currentPage = 1;
        this.isLoading = false;
        this.cdr.detectChanges();
      });
  }

  buildFilters(): any[] {
    if (!this.filters?.length) return [];
    const operatorMap: { [key: string]: string } = {
      equals: '=',
      'not equals': '!=',
      'greater than': '>',
      'greater than or equals': '>=',
      'less than': '<',
      'less than or equals': '<=',
      is: '=',
      'is not': '!=',
      contains: 'LIKE',
      'does not contain': 'NOT LIKE',
      'starts with': 'LIKE',
      'ends with': 'LIKE',
      'is set': 'IS NOT NULL',
      'is not set': 'IS NULL',
      in: 'IN',
      between: 'BETWEEN',
    };
    return this.filters
      .map((filter, index) => {
        if (
          !filter.column ||
          !filter.operation ||
          (filter.operation.toLowerCase() !== 'between' && filter.operation.toLowerCase() !== 'in' && filter.value === undefined) ||
          (filter.operation.toLowerCase() === 'between' && (filter.valueStart === undefined || filter.valueEnd === undefined)) ||
          (filter.operation.toLowerCase() === 'in' && (!filter.values || !filter.values.length))
        ) {
          console.warn(`Invalid filter at index ${index}:`, filter);
          return null;
        }
        const columnType = this.dataType[filter.column] || 'string';
        const frontendOperator = filter.operation.toLowerCase();
        let backendOperator = operatorMap[frontendOperator] || filter.operation;
        let value = filter.value;
        if (frontendOperator === 'contains') value = `%${value}%`;
        else if (frontendOperator === 'starts with') value = `${value}%`;
        else if (frontendOperator === 'ends with') value = `%${value}`;
        else if (frontendOperator === 'does not contain') value = `%${value}%`;
        const filterObject: any = {
          tableName: this.selectedQuery!.selectedTable,
          columnName: filter.column,
          operator: backendOperator,
        };
        if (filter.operation.toLowerCase() === 'between') {
          let valueStart = filter.valueStart;
          let valueEnd = filter.valueEnd;
          if (columnType === 'DateTime') {
            const startDate = this.parseDate(valueStart);
            const endDate = this.parseDate(valueEnd);
            if (!startDate || !endDate) {
              console.warn(`Invalid date range for filter at index ${index}`);
              return null;
            }
            valueStart = startDate.toISOString().split('T')[0];
            valueEnd = endDate.toISOString().split('T')[0];
          } else if (columnType === 'integer' && typeof filter.valueStart === 'string') {
            valueStart = parseInt(filter.valueStart, 10);
            if (isNaN(valueStart)) {
              console.warn(`Invalid integer start value for filter at index ${index}`);
              return null;
            }
          } else if (columnType === 'decimal' && typeof filter.valueStart === 'string') {
            valueStart = parseFloat(filter.valueStart);
            if (isNaN(valueStart)) {
              console.warn(`Invalid decimal start value for filter at index ${index}`);
              return null;
            }
          } else if (columnType === 'integer' && typeof filter.valueEnd === 'string') {
            valueEnd = parseInt(filter.valueEnd, 10);
            if (isNaN(valueEnd)) {
              console.warn(`Invalid integer end value for filter at index ${index}`);
              return null;
            }
          } else if (columnType === 'decimal' && typeof filter.valueEnd === 'string') {
            valueEnd = parseFloat(filter.valueEnd);
            if (isNaN(valueEnd)) {
              console.warn(`Invalid decimal end value for filter at index ${index}`);
              return null;
            }
          }
          filterObject.value = [valueStart, valueEnd];
        } else if (filter.operation.toLowerCase() === 'in') {
          let values = filter.values || [];
          if (columnType === 'integer') {
            values = values.map((val) => (typeof val === 'string' ? parseInt(val, 10) : val)).filter((val) => !isNaN(val));
          } else if (columnType === 'decimal') {
            values = values.map((val) => (typeof val === 'string' ? parseFloat(val) : val)).filter((val) => !isNaN(val));
          }
          if (!values.length) {
            console.warn(`No valid values for 'in' filter at index ${index}`);
            return null;
          }
          filterObject.value = values;
        } else if (frontendOperator === 'is set' || frontendOperator === 'is not set') {
          filterObject.value = null;
        } else {
          if (columnType === 'integer' && typeof filter.value === 'string' && filter.value !== '') {
            value = parseInt(filter.value, 10);
            if (isNaN(value)) {
              console.warn(`Invalid integer value for filter at index ${index}`);
              return null;
            }
          } else if (columnType === 'decimal' && typeof filter.value === 'string' && filter.value !== '') {
            value = parseFloat(filter.value);
            if (isNaN(value)) {
              console.warn(`Invalid decimal value for filter at index ${index}`);
              return null;
            }
          } else if (columnType === 'DateTime' && filter.value) {
            const date = this.parseDate(filter.value);
            if (!date) {
              console.warn(`Invalid date value for filter at index ${index}`);
              return null;
            }
            value = date.toISOString().split('T')[0];
          }
          filterObject.value = value;
        }
        if (this.filters.length > 1 && index !== this.filters.length - 1) {
          filterObject.logicalOperator = filter.condition || 'AND';
        }
        return filterObject;
      })
      .filter((f) => f !== null);
  }

  applyFilters() {
    if (!this.selectedQuery?.selectedTable) {
      alert('Please select a table first.');
      return;
    }
    const filters = this.buildFilters();
    if (!filters.length) {
      alert('Please add at least one valid filter.');
      return;
    }
    this.selectedQuery.filters = [...this.filters];
    if (this.selectedQuery.groups?.length) {
      this.GetGroupingData();
    } else {
      const sourceColumns = (this.selectedQuery.columnList || []).map(
        (col) => (col.includes('.') ? col : `${this.selectedQuery!.selectedTable}.${col}`)
      );
      const joinColumns = this.selectedQuery.joins
        .filter((join) => join.joinTable && join.rightColumns)
        .flatMap((join) => join.rightColumns.map((col: string) => (col.includes('.') ? col : `${join.joinTable}.${col}`)));
      const columnNames = [...new Set([...sourceColumns, ...joinColumns])];
      const requestBody: QueryRequestBody = {
        tableName: this.selectedQuery.selectedTable,
        columnNames: columnNames.length ? columnNames : ['*'],
        joins: this.selectedQuery.joins.map((join) => ({
          joinTable: join.joinTable,
          joinType: join.joinType.toUpperCase(),
          sourceColumn: join.sourceColumn,
          targetColumn: join.targetColumn,
        })),
        filters,
      };
      this.fetchFilterData(requestBody);
    }
    this.closeFilterRowsOverlay();
  }

  fetchFilterData(filterDetails: QueryRequestBody) {
    if (!this.selectedQuery?.selectedTable) {
      console.error('No selected query or table');
      alert('Please select a table first.');
      return;
    }
    const query = this.selectedQuery;
    this.isLoading = true;
    this.apiService
      .GetExecuteJoinFilter(filterDetails)
      .pipe(
        timeout(this.API_TIMEOUT),
        catchError((err) => {
          console.error('Filter API Error:', err);
          alert(`Failed to apply filters: ${err.error?.message || err.message || 'An unexpected error occurred'}`);
          this.isLoading = false;
          this.cdr.detectChanges();
          return throwError(() => err);
        })
      )
      .subscribe({
        next: (res: any) => {
          if (!res?.length) {
            console.warn('No data from filter API');
            query.tableData = [];
            query.allColumns = [];
            query.selectedColumns = [];
          } else {
            query.allColumns = Object.keys(res[0]).sort((a, b) => a.localeCompare(b));
            query.tableData = res;
            if (!query.selectedColumns.length) query.selectedColumns = [...query.allColumns];
          }
          this.currentPage = 1;
          this.isLoading = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.isLoading = false;
          this.cdr.detectChanges();
        },
      });
  }

  executeQuery() {
    if (!this.selectedQuery?.selectedTable) {
      alert('Please select a table first.');
      return;
    }
    if (this.groups.length) {
      this.GetGroupingData();
    } else if (this.filters.length) {
      this.applyFilters();
    } else if (this.joins.length) {
      this.fetchJoinData();
    } else {
      this.fetchTableData();
    }
  }

  toggleColumnSelection(column: string, event: Event) {
    const isChecked = (event.target as HTMLInputElement).checked;
    if (this.selectedQuery) {
      if (isChecked && !this.selectedQuery.selectedColumns.includes(column)) {
        this.selectedQuery.selectedColumns.push(column);
      } else if (!isChecked) {
        this.selectedQuery.selectedColumns = this.selectedQuery.selectedColumns.filter((col) => col !== column);
      }
      this.currentPage = 1;
      this.cdr.detectChanges();
    }
  }

  closeTableOverlay() {
    this.showTableOverlay = false;
  }

  closeColumnOverlay() {
    this.showColumnOverlay = false;
  }

  async fetchRightColumnNames(table: string, joinIndex: number): Promise<string[]> {
    if (!table) return Promise.resolve([]);
    return new Promise((resolve) => {
      this.isLoading = true;
      this.apiService
        .GetDataTypeData(table)
        .pipe(
          timeout(this.API_TIMEOUT),
          catchError((err) => {
            console.error('Error fetching right columns:', err);
            alert(`Failed to load columns for table '${table}': ${err.message || 'An unexpected error occurred'}`);
            this.isLoading = false;
            this.cdr.detectChanges();
            return throwError(() => err);
          })
        )
        .subscribe({
          next: (res: Record<string, string>) => {
            const columns = Object.keys(res || {}).sort((a, b) => a.localeCompare(b));
            if (this.selectedQuery && this.joins[joinIndex]) {
              this.selectedQuery.joins[joinIndex].rightColumns = columns;
              this.selectedQuery.joins[joinIndex].targetColumns = columns;
              this.joins[joinIndex].rightColumns = columns;
              this.joins[joinIndex].targetColumns = columns;
              this.isLoading = false;
              this.cdr.detectChanges();
              resolve(columns);
            }
          },
          error: () => {
            this.isLoading = false;
            resolve([]);
          },
        });
    });
  }

  RightTable(table: string, joinIndex: number) {
    if (!this.selectedQuery) return;
    if (!this.selectedQuery.joins) this.selectedQuery.joins = [];
    while (this.selectedQuery.joins.length <= joinIndex) {
      this.selectedQuery.joins.push({
        joinTable: '',
        sourceColumn: '',
        targetColumn: '',
        joinType: 'INNER',
        rightColumns: [],
        sourceColumns: this.selectedQuery.columnList || [],
        targetColumns: [],
        re: [],
      });
    }
    this.joins[joinIndex] = this.selectedQuery.joins[joinIndex];
    this.joins[joinIndex].joinTable = table;
    this.fetchRightColumnNames(table, joinIndex);
  }

  addJoin() {
    if (this.selectedQuery) {
      this.selectedQuery.joins = [
        ...this.selectedQuery.joins,
        {
          joinTable: '',
          sourceColumn: '',
          targetColumn: '',
          joinType: 'INNER',
          rightColumns: [],
          sourceColumns: this.selectedQuery.columnList || [],
          targetColumns: [],
          re: [],
        },
      ];
      this.joins = [...this.selectedQuery.joins];
      this.cdr.detectChanges();
    }
  }

  removeJoin(index: number) {
    if (this.selectedQuery) {
      this.selectedQuery.joins.splice(index, 1);
      this.joins = [...this.selectedQuery.joins];
      if (this.selectedQuery.joins.length) this.fetchJoinData();
      else if (this.selectedQuery.groups?.length) this.GetGroupingData();
      else if (this.selectedQuery.filters.length) this.applyFilters();
      else this.fetchTableData();
      this.cdr.detectChanges();
    }
  }

  clearJoins() {
    if (this.selectedQuery) {
      this.selectedQuery.joins = [];
      this.joins = [];
      this.fetchTableData();
    }
    this.cdr.detectChanges();
  }

  async openJoinTableOverlay(index: number) {
    if (!this.selectedQuery) return;
    this.joinIndex = index;
    this.selectedJoin = this.selectedQuery.joins[index] || {
      joinTable: '',
      sourceColumn: '',
      targetColumn: '',
      joinType: 'INNER',
      rightColumns: [],
      sourceColumns: [],
      targetColumns: [],
      re: [],
    };
    if (!this.selectedQuery.columnList.length && this.selectedQuery.selectedTable) {
      await this.fetchTableMetadata(this.selectedQuery.selectedTable);
      this.selectedJoin.sourceColumns = this.selectedQuery.columnList || [];
    } else {
      this.selectedJoin.sourceColumns = (this.selectedQuery.columnList || []).slice().sort((a, b) => a.localeCompare(b));
    }
    if (this.selectedJoin.joinTable) await this.fetchRightColumnNames(this.selectedJoin.joinTable, this.joinIndex);
    this.showJoinTableOverlay = true;
    this.showOverlay = false;
    this.cdr.detectChanges();
  }

  async confirmJoinTable() {
    if (this.selectedQuery && this.selectedJoin && this.joinIndex >= 0) {
      if (!this.selectedJoin.sourceColumn || !this.selectedJoin.targetColumn || !this.selectedJoin.joinTable) {
        alert('Please select a join table, source column, and target column.');
        return;
      }
      this.selectedQuery.joins[this.joinIndex] = { ...this.selectedJoin };
      await this.fetchJoinData();
      this.showJoinTableOverlay = false;
      this.selectedJoin = null;
      this.cdr.detectChanges();
    }
  }

  applyJoins() {
    if (!this.selectedQuery?.selectedTable) {
      alert('Please select a table first.');
      return;
    }
    if (!this.joins.length || !this.joins.some((j) => j.joinTable && j.sourceColumn && j.targetColumn && j.joinType)) {
      alert('Please add at least one valid join condition.');
      return;
    }
    this.fetchJoinData();
    this.closeJoinTableOverlay();
  }

  closeJoinTableOverlay() {
    this.showJoinTableOverlay = false;
    this.selectedJoin = null;
    this.cdr.detectChanges();
  }

  confirmAddColumn() {
    this.closeAddColumnOverlay();
  }

  closeAddColumnOverlay() {
    this.showAddColumnOverlay = false;
    this.newColumnExpression = '';
    this.newColumnName = '';
    this.newColumnType = '';
  }

  confirmAppendTable() {
    if (this.selectedQuery) {
      this.selectedQuery.selectedTableToAppend = this.selectedTableToAppend;
      this.selectedQuery.dropDuplicates = this.dropDuplicates;
      this.GetAppendData();
    }
    this.closeAppendTableOverlay();
    this.cdr.detectChanges();
  }

  GetAppendData() {
    if (!this.selectedQuery?.selectedTable || !this.selectedQuery.selectedTableToAppend) {
      alert('Please select both a source table and a table to append.');
      return;
    }
    const requestBody = {
      table1: this.selectedQuery.selectedTable,
      table2: this.selectedQuery.selectedTableToAppend,
      dropDuplicates: this.selectedQuery.dropDuplicates === 'Yes',
    };
    const query = this.selectedQuery;
    this.isLoading = true;
    this.apiService
      .GetAppendTable(requestBody)
      .pipe(
        timeout(this.API_TIMEOUT),
        catchError((err) => {
          console.error('Append API Error:', err);
          alert(`Failed to append table '${this.selectedQuery!.selectedTableToAppend}' to '${this.selectedQuery!.selectedTable}': ${err.error?.message || err.message || 'An unexpected error occurred'}`);
          this.isLoading = false;
          this.cdr.detectChanges();
          return throwError(() => err);
        })
      )
      .subscribe((res: any) => {
        if (!res?.length) {
          console.warn('No data from append API');
          query.tableData = [];
          query.allColumns = [];
          query.selectedColumns = [];
          alert(`No data returned when appending table '${query.selectedTableToAppend}' to '${query.selectedTable}'.`);
        } else {
          query.allColumns = Object.keys(res[0]).sort((a, b) => a.localeCompare(b));
          query.tableData = res;
          if (!query.selectedColumns.length) query.selectedColumns = [...query.allColumns];
        }
        this.currentPage = 1;
        this.isLoading = false;
        this.cdr.detectChanges();
      });
  }

  closeAppendTableOverlay() {
    this.showAppendTableOverlay = false;
    this.selectedTableToAppend = '';
    this.unionType = 'UNION';
    this.dropDuplicates = 'No';
  }

  confirmCustomOperation() {
    this.closeCustomOperationOverlay();
  }

  closeCustomOperationOverlay() {
    this.showCustomOperationOverlay = false;
    this.customExpression = '';
  }

  addFilter() {
    if (this.selectedQuery) {
      this.selectedQuery.filters = [
        ...this.selectedQuery.filters,
        {
          column: '',
          operation: '',
          value: '',
          values: [],
          valueStart: '',
          valueEnd: '',
          availableOperations: [],
          availableValues: [],
          condition: 'AND',
        },
      ];
      this.filters = [...this.selectedQuery.filters];
      this.cdr.detectChanges();
    }
  }

  toggleFilterValue(filter: Filter, value: string | number, event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.checked) {
      if (!filter.values.includes(value)) filter.values.push(value);
    } else {
      filter.values = filter.values.filter((val) => val !== value);
    }
    this.cdr.detectChanges();
  }

  removeFilter(index: number) {
    if (this.selectedQuery) {
      this.selectedQuery.filters.splice(index, 1);
      this.filters = [...this.selectedQuery.filters];
      if (this.selectedQuery.joins?.length) this.fetchJoinData();
      else if (this.selectedQuery.groups?.length) this.GetGroupingData();
      else if (this.selectedQuery.filters.length) this.applyFilters();
      else this.fetchTableData();
      this.cdr.detectChanges();
    }
  }

  updateOperations(index: number) {
    const selectedColumn = this.filters[index].column;
    const columnType = this.dataType[selectedColumn] || 'string';
    this.filters[index].availableOperations = this.operations[columnType] || [];
    if (this.selectedQuery?.selectedTable && selectedColumn) {
      this.fetchDistinctColValues(index, selectedColumn, this.selectedQuery.selectedTable);
    }
    this.cdr.detectChanges();
  }

  clearFilters() {
    if (this.selectedQuery) {
      this.selectedQuery.filters = [];
      this.filters = [];
      this.fetchTableData();
    }
    this.cdr.detectChanges();
  }

  isColumnDisabled(column: string, currentIndex: number): boolean {
    return this.filters.some((filter, index) => index !== currentIndex && filter.column === column);
  }

  closeFilterRowsOverlay() {
    this.showFilterRowsOverlay = false;
  }

  addGrouping() {
    if (this.selectedQuery) {
      this.selectedQuery.groups = [
        ...this.selectedQuery.groups,
        {
          groupByColumn: '',
          aggregateFunction: '',
          aggregateColumn: '',
          groupByColumnType: '',
          aggregateColumnType: '',
        },
      ];
      this.groups = [...this.selectedQuery.groups];
      this.cdr.detectChanges();
    }
  }

  removeGrouping(index: number) {
    this.groups.splice(index, 1);
    if (this.selectedQuery) {
      this.selectedQuery.groups.splice(index, 1);
      if (!this.groups.some((g) => g.aggregateFunction && g.aggregateColumn)) {
        this.selectedQuery.havingConditions = [];
        this.havingConditions = [];
      }
    }
    this.cdr.detectChanges();
  }

  clearGroupings() {
    this.groups = [];
    this.havingConditions = [];
    if (this.selectedQuery) {
      this.selectedQuery.groups = [];
      this.selectedQuery.havingConditions = [];
      this.fetchTableData();
    }
    this.cdr.detectChanges();
  }

  addHavingCondition() {
    if (this.selectedQuery) {
      this.selectedQuery.havingConditions = [
        ...this.selectedQuery.havingConditions,
        {
          aggregateColumn: '',
          operator: '',
          value: '',
          logicalOperator: 'AND',
          availableOperators: [],
        },
      ];
      this.havingConditions = [...this.selectedQuery.havingConditions];
      this.cdr.detectChanges();
    }
  }

  removeHavingCondition(index: number) {
    this.havingConditions.splice(index, 1);
    if (this.selectedQuery) this.selectedQuery.havingConditions.splice(index, 1);
    this.cdr.detectChanges();
  }

  getAggregateColumns(): string[] {
    return this.groups
      .filter((g) => g.aggregateFunction && g.aggregateColumn)
      .map((g) => g.aggregateColumn)
      .filter((col, index, self) => self.indexOf(col) === index);
  }

  updateGroupByColumnType(index: number) {
    const group = this.groups[index];
    if (group.groupByColumn && this.dataType[group.groupByColumn]) {
      group.groupByColumnType = this.dataType[group.groupByColumn];
    } else {
      group.groupByColumnType = '';
    }
    this.cdr.detectChanges();
  }

  updateAggregateColumnType(index: number) {
    const group = this.groups[index];
    if (group.aggregateColumn && this.dataType[group.aggregateColumn]) {
      group.aggregateColumnType = this.dataType[group.aggregateColumn];
    } else {
      group.aggregateColumnType = '';
    }
    this.cdr.detectChanges();
  }

  updateHavingOperators(index: number) {
    const having = this.havingConditions[index];
    const group = this.groups.find((g) => g.aggregateColumn === having.aggregateColumn && g.aggregateFunction);
    const columnType = group?.aggregateColumnType || 'string';
    having.availableOperators = this.havingOperators[columnType] || ['=', '!='];
    having.operator = '';
    this.cdr.detectChanges();
  }

  applyGroupings() {
    if (!this.selectedQuery?.selectedTable) {
      alert('Please select a table first.');
      return;
    }
    if (!this.groups.length || !this.groups.some((g) => g.groupByColumn || (g.aggregateFunction && g.aggregateColumn))) {
      alert('Please add at least one valid grouping or aggregation condition.');
      return;
    }
    if (this.havingConditions.some((h) => !h.aggregateColumn || !h.operator || h.value === '')) {
      alert('Please complete all having conditions or remove incomplete ones.');
      return;
    }
    this.GetGroupingData();
    this.closeGroupSummarizeOverlay();
  }

  GetGroupingData() {
    if (!this.selectedQuery?.selectedTable) {
      alert('Please select a table first.');
      return;
    }
    const groupColumns = this.groups.filter((group) => group.groupByColumn).map((group) => group.groupByColumn);
    const aggregations = this.groups
      .filter((group) => group.aggregateFunction && group.aggregateColumn)
      .map((group) => {
        const columnType = this.dataType[group.aggregateColumn] || 'string';
        const functionName = columnType === 'string' ? 'COUNT' : group.aggregateFunction.toUpperCase();
        if (!['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'].includes(functionName)) return null;
        return {
          function: functionName,
          column: group.aggregateColumn,
          alias: `${functionName.toLowerCase()}_${group.aggregateColumn}`,
        };
      })
      .filter((agg) => agg !== null);
    if (!aggregations.length && !groupColumns.length) {
      alert('Please add at least one valid grouping or aggregation condition.');
      return;
    }
    const aggregatedColumns = aggregations.map((agg) => agg!.alias);
    const selectedColumns = [...groupColumns, ...aggregatedColumns];
    const groupingBody = {
      tableName: this.selectedQuery.selectedTable,
      selectedColumns: selectedColumns.length ? selectedColumns : ['*'],
      aggregations,
      groupByColumns: groupColumns,
      havingConditions: this.havingConditions
        .map((having) => {
          const group = this.groups.find((g) => g.aggregateColumn === having.aggregateColumn && g.aggregateFunction);
          if (!group) return null;
          const columnType = group.aggregateColumnType || 'string';
          let value: string | number = having.value;
          if (columnType === 'integer' && typeof value === 'string') {
            value = parseInt(value, 10);
            if (isNaN(value)) {
              console.warn(`Invalid integer value for having condition: ${having.value}`);
              return null;
            }
          } else if (columnType === 'decimal' && typeof value === 'string') {
            value = parseFloat(value);
            if (isNaN(value)) {
              console.warn(`Invalid decimal value for having condition: ${having.value}`);
              return null;
            }
          }
          return {
            aggregateColumn: `${group.aggregateFunction}(${group.aggregateColumn})`,
            operator: having.operator,
            value: value,
            logicalOperator: having.logicalOperator || 'AND',
          };
        })
        .filter((h) => h !== null),
      filters: this.buildFilters(),
    };
    const query = this.selectedQuery;
    this.isLoading = true;
    this.apiService
      .GetGrouping(groupingBody)
      .pipe(
        timeout(this.API_TIMEOUT),
        catchError((err) => {
          console.error('Grouping API Error:', err);
          alert(`Failed to apply groupings: ${err.error?.message || err.message || 'An unexpected error occurred'}`);
          this.isLoading = false;
          this.cdr.detectChanges();
          return throwError(() => err);
        })
      )
      .subscribe((res: any) => {
        if (!res?.length) {
          console.warn('No data from grouping API');
          query!.tableData = [];
          query!.allColumns = [];
          query!.selectedColumns = [];
          alert(`No data returned for grouping on table '${query.selectedTable}'.`);
        } else {
          query!.allColumns = Object.keys(res[0]).sort((a, b) => a.localeCompare(b));
          query!.tableData = res;
          query!.selectedColumns = selectedColumns;
        }
        this.currentPage = 1;
        this.isLoading = false;
        this.cdr.detectChanges();
      });
  }

  closeGroupSummarizeOverlay() {
    this.showGroupSummarizeOverlay = false;
  }

  openGroupSummarizeOverlay() {
    this.showGroupSummarizeOverlay = true;
    this.showOverlay = false;
    if (this.selectedQuery?.selectedTable && !this.groups.length) this.addGrouping();
    this.cdr.detectChanges();
  }

  addCharts() {
    if (!this.selectedQuery) {
      alert('Please select a query first to create a chart.');
      return;
    }
    if (!this.sqlTemplate || this.sqlTemplate.includes('Failed') || this.sqlTemplate.includes('No table selected')) {
      alert('Please generate a valid SQL query before creating a chart.');
      return;
    }
    localStorage.setItem('selectedQueryId', this.selectedQuery.id.toString());
    this.router.navigate(['/chart']);
  }

  deleteChart(chartId: number) {
    this.charts = this.charts.filter((q) => q.id !== chartId);
    this.cdr.detectChanges();
  }

  addDashboard() {
    this.dashboardCount++;
    this.dashboards.push({ id: this.dashboardCount, name: `Dashboard ${this.dashboardCount}` });
  }

  deleteDashBoard(dashboardId: number) {
    this.dashboards = this.dashboards.filter((q) => q.id !== dashboardId);
  }

  editTable() {
    this.showTableOverlay = true;
  }

  editColumn() {
    this.showColumnOverlay = true;
  }

  editJoin(index: number) {
    this.openJoinTableOverlay(index);
  }

  editFilter() {
    this.showFilterRowsOverlay = true;
    if (this.selectedQuery?.selectedTable) {
      this.filters.forEach((filter, index) => {
        if (filter.column) this.updateOperations(index);
      });
    }
    this.cdr.detectChanges();
  }

  editgroupby() {
    this.showGroupSummarizeOverlay = true;
    if (this.selectedQuery?.selectedTable && !this.groups.length) this.addGrouping();
    this.cdr.detectChanges();
  }

  editappendtable() {
    this.showAppendTableOverlay = true;
  }

  toggleOverlay(event: Event) {
    this.showOverlay = !this.showOverlay;
    event.stopPropagation();
  }

  openTableOverlay() {
    this.showTableOverlay = true;
    this.showOverlay = false;
  }

  openColumnOverlay() {
    this.showColumnOverlay = true;
    this.showOverlay = false;
  }

  openAddColumnOverlay() {
    this.showAddColumnOverlay = true;
    this.showOverlay = false;
  }

  openAppendTableOverlay() {
    this.showAppendTableOverlay = true;
    this.showOverlay = false;
  }

  openCustomOperationOverlay() {
    this.showCustomOperationOverlay = true;
    this.showOverlay = false;
  }

  openFilterRowsOverlay() {
    this.showFilterRowsOverlay = true;
    this.showOverlay = false;
    if (this.selectedQuery?.selectedTable && !this.filters.length) this.addFilter();
    if (this.selectedQuery?.selectedTable) {
      this.filters.forEach((filter, index) => {
        if (filter.column) this.updateOperations(index);
      });
    }
    this.cdr.detectChanges();
  }

  hasOperations = false;

  viewSql() {
    this.hasOperations = this.checkForOperations();
    if (!this.hasOperations) {
      this.sqlTemplate = 'No operations have been performed. Please select a table and perform operations first.';
      this.showSqlTemplateOverlay = true;
    } else {
      this.generateSqlTemplate();
    }
  }

  checkForOperations(): boolean {
    return !!this.selectedQuery?.selectedTable;
  }

  generateSqlTemplate() {
    if (!this.selectedQuery?.selectedTable) {
      this.sqlTemplate = 'No table selected. Please select a table first.';
      this.showSqlTemplateOverlay = true;
      return;
    }

    const groupColumns = this.groups.filter((g) => g.groupByColumn).map((g) => g.groupByColumn);
    const aggregations = this.groups
      .filter((g) => g.aggregateFunction && g.aggregateColumn)
      .map((group) => {
        const columnType = this.dataType[group.aggregateColumn] || 'string';
        const functionName = columnType === 'string' ? 'COUNT' : group.aggregateFunction.toUpperCase();
        return {
          function: functionName,
          column: group.aggregateColumn,
          alias: `${functionName.toLowerCase()}_${group.aggregateColumn}`,
        };
      })
      .filter((agg) => agg !== null);

    const sourceColumns = (this.selectedQuery.columnList || []).map(
      (col) => (col.includes('.') ? col : `${this.selectedQuery!.selectedTable}.${col}`)
    );
    const joinColumns = this.selectedQuery.joins
      .filter((join) => join.joinTable && join.rightColumns)
      .flatMap((join) => join.rightColumns.map((col: string) => (col.includes('.') ? col : `${join.joinTable}.${col}`)));
    const columnNames = [...new Set([...sourceColumns, ...joinColumns])];

    const requestBody: QueryRequestBody = {
      tableName: this.selectedQuery.selectedTable,
      columnNames: this.selectedQuery.selectedColumns.length ? this.selectedQuery.selectedColumns : columnNames.length ? columnNames : ['*'],
      joins: this.selectedQuery.joins.map((join) => ({
        joinTable: join.joinTable,
        joinType: join.joinType.toUpperCase(),
        sourceColumn: join.sourceColumn,
        targetColumn: join.targetColumn,
      })),
      filters: this.buildFilters(),
      groupByColumns: groupColumns,
      aggregations,
      havingConditions: this.havingConditions
        .map((having) => {
          const group = this.groups.find((g) => g.aggregateColumn === having.aggregateColumn && g.aggregateFunction);
          if (!group) return null;
          const columnType = group.aggregateColumnType || 'string';
          let value: string | number = having.value;
          if (columnType === 'integer' && typeof value === 'string') {
            value = parseInt(value, 10);
            if (isNaN(value)) {
              console.warn(`Invalid integer value for having condition: ${having.value}`);
              return null;
            }
          } else if (columnType === 'decimal' && typeof value === 'string') {
            value = parseFloat(value);
            if (isNaN(value)) {
              console.warn(`Invalid decimal value for having condition: ${having.value}`);
              return null;
            }
          }
          return {
            aggregateColumn: `${group.aggregateFunction}(${group.aggregateColumn})`,
            operator: having.operator,
            value: value,
            logicalOperator: having.logicalOperator || 'AND',
          };
        })
        .filter((h) => h !== null),
      append: this.selectedQuery.selectedTableToAppend
        ? {
            table: this.selectedQuery.selectedTableToAppend,
            unionType: this.unionType,
            dropDuplicates: this.selectedQuery.dropDuplicates === 'Yes',
          }
        : undefined,
    };

    // Share the requestBody with QueryService
    this.queryService.setQueryBody(requestBody);
    console.log('QueryRequestBody set in QueryService:', requestBody);

    this.isLoading = true;
    this.apiService
      .GenerateSqlQuery(requestBody)
      .pipe(
        timeout(this.API_TIMEOUT),
        catchError((err) => {
          console.error('SQL Generation API Error:', err);
          this.sqlTemplate = `Failed to generate SQL query: ${err.error?.message || err.message || 'An unexpected error occurred'}`;
          this.showSqlTemplateOverlay = true;
          this.isLoading = false;
          this.cdr.detectChanges();
          return throwError(() => err);
        })
      )
      .subscribe((res: string) => {
        this.sqlTemplate = res || 'No SQL query generated.';
        this.showSqlTemplateOverlay = true;
        this.isLoading = false;
        this.cdr.detectChanges();
      });
  }

  closeSqlTemplateOverlay() {
    this.showSqlTemplateOverlay = false;
  }

  copySqlToClipboard() {
    navigator.clipboard.writeText(this.sqlTemplate).then(
      () => {
        this.isCopied = true;
        setTimeout(() => (this.isCopied = false), 2000);
      },
      (err) => console.error('Could not copy text: ', err)
    );
  }

  openSaveSqlOverlay() {
    if (!this.sqlTemplate) {
      alert('No SQL query to save. Please generate a query first.');
      return;
    }
    this.showSaveSqlOverlay = true;
  }

  closeSaveSqlOverlay() {
    this.showSaveSqlOverlay = false;
    this.queryName = '';
  }

  saveSqlQuery() {
    if (!this.queryName) {
      alert('Please enter a query name.');
      return;
    }
    const sqlBody: ApiQuery = {
      id: 0,
      queryName: this.queryName,
      sqlQuery: this.sqlTemplate,
      savedAt: new Date().toISOString(),
    };
    this.isLoading = true;
    this.apiService
      .SaveSqlQuery(sqlBody)
      .pipe(
        timeout(this.API_TIMEOUT),
        catchError((err) => {
          console.error('Error saving SQL:', err);
          alert(`Failed to save SQL query '${this.queryName}': ${err.message || 'An unexpected error occurred'}`);
          this.isLoading = false;
          this.cdr.detectChanges();
          return throwError(() => err);
        })
      )
      .subscribe({
        next: () => {
          alert(`SQL query '${this.queryName}' saved successfully!`);
          this.closeSaveSqlOverlay();
          this.loadSqlHistorydata();
          this.isLoading = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.isLoading = false;
          this.cdr.detectChanges();
        },
      });
  }

  showSqlHistory() {
    this.showSqlTemplateOverlay = false;
    this.showSqlHistoryOverlay = true;
    this.loadSqlHistorydata();
  }

  viewSqlHistory() {
    this.showSqlHistoryOverlay = true;
    this.loadSqlHistorydata();
  }

  closeSqlHistoryOverlay() {
    this.showSqlHistoryOverlay = false;
    this.showSqlTemplateOverlay = true;
  }

  loadSqlHistorydata() {
    this.isLoading = true;
    this.apiService
      .GetSqlHistory()
      .pipe(
        timeout(this.API_TIMEOUT),
        catchError((err) => {
          console.error('Error loading SQL history:', err);
          alert(`Failed to load SQL history: ${err.message || 'An unexpected error occurred'}`);
          this.isLoading = false;
          this.cdr.detectChanges();
          return throwError(() => err);
        })
      )
      .subscribe({
        next: (res: ApiQuery[]) => {
          this.sqlHistoryData = Array.isArray(res) ? res : [];
          this.isLoading = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.isLoading = false;
          this.cdr.detectChanges();
        },
      });
  }

  @HostListener('document:click', ['$event'])
  onClickOutside(event: Event) {
    if (this.showOverlay && this.overlay && !this.overlay.nativeElement.contains(event.target)) {
      this.showOverlay = false;
    }
  }

  @ViewChildren('selectTable, columnSpan, joinTypeSpan, joinTableSpan, filterSpan, groupSpan, appendSpan')
  allSpans!: QueryList<ElementRef>;

  ngAfterViewInit() {
    this.allSpans.changes.subscribe(() => this.setupTooltips());
    this.setupTooltips();
  }

  setupTooltips() {
    this.allSpans.forEach((spanRef: { nativeElement: any }) => {
      const element = spanRef.nativeElement;
      if (element.offsetWidth < element.scrollWidth) this.renderer.setStyle(element, 'cursor', 'help');
    });
  }

  showTooltip(element: HTMLElement, text: string | undefined) {
    if (!text) return;
    this.tooltipText = text;
    const rect = element.getBoundingClientRect();
    this.tooltipStyles = {
      top: `${rect.bottom + 5}px`,
      left: `${rect.left + rect.width / 2}px`,
    };
    this.tooltipVisible = true;
    this.cdr.detectChanges();
  }

  hideTooltip() {
    this.tooltipVisible = false;
    this.cdr.detectChanges();
  }
}