import { Component, OnInit, PLATFORM_ID, Inject, ChangeDetectorRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { NgChartsModule } from 'ng2-charts';
import { NgMultiSelectDropDownModule, IDropdownSettings } from 'ng-multiselect-dropdown';
import { ChartConfiguration, ChartType, Chart, ChartEvent, ActiveElement } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { ApiService, ApiQuery, ApiChart } from '../../Services/api.service';
import { QueryService } from '../../Services/query.service';
import { QueryRequestBody } from '../dashboard/dashboard.component';
import { trigger, style, animate, transition } from '@angular/animations';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Register ChartDataLabels plugin
Chart.register(ChartDataLabels);

interface Panels {
  sql: boolean;
  dataSource: boolean;
  parameters: boolean;
  columns: boolean;
  filters: boolean;
}

interface DropdownItem {
  item_id: number;
  item_text: string;
  isSelected: boolean;
  originalIndex: number;
}

@Component({
  selector: 'app-chart',
  standalone: true,
  imports: [CommonModule, HttpClientModule, FormsModule, NgChartsModule, NgMultiSelectDropDownModule],
  templateUrl: './chart.component.html',
  styleUrls: ['./chart.component.css'],
  animations: [
    trigger('rowFadeIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(10px)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0)' })),
      ]),
    ]),
    trigger('chartFade', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('500ms ease-in', style({ opacity: 1 })),
      ]),
      transition('* => *', [
        style({ opacity: 0 }),
        animate('500ms ease-in', style({ opacity: 1 })),
      ]),
    ]),
  ],
})
export class ChartComponent implements OnInit {
  selectedChart: ChartType | null = null;
  chartTypes: ChartType[] = ['bar', 'line', 'pie'];
  chartData: ChartConfiguration['data'] = { labels: [], datasets: [] };
  chartOptions: ChartConfiguration['options'] = {
    responsive: true,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          font: { size: 14 },
          padding: 20,
          usePointStyle: true,
        },
      },
      tooltip: {
        enabled: true,
        backgroundColor: 'rgba(0,0,0,0.8)',
        titleFont: { size: 16 },
        bodyFont: { size: 14 },
        padding: 10,
        callbacks: {
          label: (context: any) => {
            const value = context.parsed as number;
            const label = context.dataset.label || '';
            const data = context.dataset.data as (number | null)[];
            const sum = data
              .filter((val): val is number => val !== null)
              .reduce((a: number, b: number) => a + b, 0);
            const percentage = sum !== 0 ? ((value / sum) * 100).toFixed(1) : '0.0';
            return `${label}: ${value.toLocaleString()} (${percentage}%)`;
          },
        },
      },
      datalabels: {
        formatter: (value: number, context: any) => {
          const data = context.dataset.data as (number | null)[];
          const sum = data
            .filter((val): val is number => val !== null)
            .reduce((a: number, b: number) => a + b, 0);
          const percentage = sum !== 0 ? ((value / sum) * 100).toFixed(1) : '0.0';
          return this.selectedChart === 'pie' ? `${percentage}%` : '';
        },
        color: '#ffffff',
        font: { weight: 'bold', size: 12 },
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowBlur: 3,
      },
    },
    animation: {
      duration: 1000,
      easing: 'easeInOutQuad',
      onComplete: () => {
        if (this.isBrowser) {
          setTimeout(() => this.updateChart(), 0);
        }
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        display: this.selectedChart !== 'pie',
        ticks: {
          callback: (value: string | number) => {
            if (typeof value === 'number' && Number.isFinite(value)) {
              return value.toLocaleString();
            }
            return '';
          },
        },
      },
      x: {
        display: this.selectedChart !== 'pie',
      },
    },
    onClick: (event: ChartEvent, elements: ActiveElement[]) => {
      if (this.isBrowser && elements.length > 0) {
        const element = elements[0];
        const index = element.index;
        const label = this.chartData.labels?.[index] || 'Unknown';
        const value = this.chartData.datasets[element.datasetIndex].data[index];
        if (typeof value === 'number') {
          alert(`Clicked: ${label} (${value.toLocaleString()})`);
        } else {
          alert(`Clicked: ${label} (No value)`);
        }
      }
    },
    onHover: (event: ChartEvent, elements: ActiveElement[]) => {
      if (this.isBrowser) {
        const target = event.native?.target as HTMLElement;
        target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
      }
    },
  };

  xAxis: DropdownItem[] = [];
  yAxis: DropdownItem[] = [];
  xAxisColumns: string[] = [];
  yAxisColumns: string[] = [];
  availableColumns: string[] = [];
  columns: DropdownItem[] = [];
  selectedColumns: string[] = [];
  originalColumnsOrder: DropdownItem[] = [];

  dropdownSettings: IDropdownSettings = {
    singleSelection: false,
    idField: 'item_id',
    textField: 'item_text',
    selectAllText: 'Select All',
    unSelectAllText: 'Unselect All',
    itemsShowLimit: 3,
    allowSearchFilter: true,
    enableCheckAll: true,
  };

  queryStatus = {
    timestamp: '',
    status: 'Pending',
    executionTime: 0,
    rowsReturned: 0,
  };

  queryData: any[] = [];
  filteredData: any[] = [];
  paginatedData: any[] = [];
  currentPage = 1;
  rowsPerPage = 5;
  totalRows = 0;
  searchQuery = '';
  sortColumn = '';
  sortDirection: 'asc' | 'desc' = 'asc';

  sqlQuery = '';
  panels: Panels = { sql: false, dataSource: false, parameters: false, columns: false, filters: false };
  queryRequestBody: QueryRequestBody | null = null;
  isLoading = false;

  showMenuIndex: number | null = null;

  constructor(
    private apiService: ApiService,
    private queryService: QueryService,
    @Inject(PLATFORM_ID) private platformId: Object,
    private cdr: ChangeDetectorRef
  ) {}

  private get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  ngOnInit() {
    this.queryService.getQueryBody().subscribe((body: QueryRequestBody | null) => {
      if (body) {
        this.queryRequestBody = body;
        this.generateAndExecuteQuery();
      } else {
        this.queryStatus.status = 'Failed';
        this.queryStatus.timestamp = new Date().toLocaleString('en-US', {
          hour: 'numeric',
          minute: 'numeric',
          hour12: true,
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        });
        if (this.isBrowser) {
          alert('No query selected. Please generate and execute a query in the dashboard.');
        }
      }
    });
  }

  generateAndExecuteQuery() {
    if (!this.queryRequestBody) {
      this.handleQueryFailure('No query selected.');
      return;
    }

    this.isLoading = true;
    this.queryStatus = { timestamp: '', status: 'Executing', executionTime: 0, rowsReturned: 0 };
    const startTime = performance.now();

    this.apiService.GenerateSqlQuery(this.queryRequestBody).subscribe({
      next: (sql) => {
        this.sqlQuery = sql;
        this.apiService.executeSqlQuery({ sqlQuery: sql }).subscribe({
          next: (data) => {
            this.queryData = data;
            this.filteredData = data;
            this.totalRows = data.length;
            this.queryStatus = {
              timestamp: new Date().toLocaleString('en-US', {
                hour: 'numeric',
                minute: 'numeric',
                hour12: true,
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              }),
              status: 'Successful',
              executionTime: Number(((performance.now() - startTime) / 1000).toFixed(2)),
              rowsReturned: data.length,
            };
            this.availableColumns = data.length ? Object.keys(data[0]) : [];
            this.columns = this.availableColumns
              .sort((a, b) => a.localeCompare(b))
              .map((col, index) => ({
                item_id: index,
                item_text: col,
                isSelected: false,
                originalIndex: index,
              }));
            this.originalColumnsOrder = [...this.columns];
            this.selectedColumns = this.availableColumns;
            this.xAxis = this.columns.slice(0, 1).map(item => ({ ...item, isSelected: true }));
            this.yAxis = this.columns.slice(1, 2).map(item => ({ ...item, isSelected: true }));
            this.xAxisColumns = this.xAxis.map(item => item.item_text);
            this.yAxisColumns = this.yAxis.map(item => item.item_text);
            this.sortColumns();
            this.updatePagination();
            this.updateChartData();
            this.isLoading = false;
            this.cdr.detectChanges();
          },
          error: (err) => this.handleQueryFailure(err, startTime),
        });
      },
      error: (err) => this.handleQueryFailure(err, startTime),
    });
  }

  private handleQueryFailure(err: any, startTime?: number) {
    this.isLoading = false;
    this.queryStatus.status = 'Failed';
    this.queryStatus.executionTime = startTime
      ? Number(((performance.now() - startTime) / 1000).toFixed(2))
      : 0;
    this.queryStatus.timestamp = new Date().toLocaleString('en-US', {
      hour: 'numeric',
      minute: 'numeric',
      hour12: true,
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    console.error('Query Error:', err);
    if (this.isBrowser) {
      alert('Failed to process query: ' + (err.message || 'Unknown error'));
    }
  }

  updateChartData() {
    if (!this.queryData.length || !this.selectedChart || !this.xAxisColumns.length || !this.yAxisColumns.length) {
      this.chartData = { labels: [], datasets: [] };
      return;
    }

    const labels = this.queryData.map((row: any) => {
      if (this.xAxisColumns.length === 1) {
        const value = row[this.xAxisColumns[0]];
        return value != null ? String(value) : 'Unknown';
      }
      return this.xAxisColumns
        .map(col => (row[col] != null ? String(row[col]) : 'Unknown'))
        .join(' - ');
    });

    if (this.selectedChart === 'pie') {
      const aggregatedData = this.queryData.map((row: any) => {
        return this.yAxisColumns.reduce((sum: number, col: string) => {
          const value = row[col];
          return sum + (value != null && !isNaN(Number(value)) ? Number(value) : 0);
        }, 0);
      });

      const colors = [
        '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
        '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
      ];

      this.chartData = {
        labels,
        datasets: [
          {
            label: this.yAxisColumns.join(' + '),
            data: aggregatedData.filter((val: number) => Number.isFinite(val)),
            backgroundColor: colors.slice(0, aggregatedData.length),
            borderColor: '#ffffff',
            borderWidth: 2,
            hoverOffset: 20,
            hoverBorderWidth: 3,
            hoverBackgroundColor: colors.slice(0, aggregatedData.length).map(color =>
              this.adjustColorBrightness(color, 1.2)
            ),
          },
        ],
      };
    } else {
      const datasets = this.yAxisColumns.map((yCol, index) => {
        const values = this.queryData.map((row: any) => {
          const value = row[yCol];
          return value != null && !isNaN(Number(value)) ? Number(value) : null;
        }).filter((val): val is number => val !== null);

        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
        const color = colors[index % colors.length];

        return {
          label: yCol,
          data: values,
          backgroundColor: color,
          borderColor: color,
          borderWidth: 2,
          fill: this.selectedChart === 'line' ? false : true,
          pointRadius: this.selectedChart === 'line' ? 5 : 0,
          pointHoverRadius: this.selectedChart === 'line' ? 8 : 0,
          pointHitRadius: 10,
          tension: this.selectedChart === 'line' ? 0.4 : 0,
        };
      }).filter(dataset => dataset.data.length > 0);

      this.chartData = {
        labels,
        datasets,
      };
    }
  }

  private adjustColorBrightness(hex: string, factor: number): string {
    hex = hex.replace('#', '');
    const r = Math.min(255, Math.floor(parseInt(hex.slice(0, 2), 16) * factor));
    const g = Math.min(255, Math.floor(parseInt(hex.slice(2, 4), 16) * factor));
    const b = Math.min(255, Math.floor(parseInt(hex.slice(4, 6), 16) * factor));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  selectChart(chartType: ChartType | null) {
    this.selectedChart = chartType;
    this.updateChartData();
  }

  autoVisualize() {
    if (!this.queryData.length) {
      if (this.isBrowser) {
        alert('No data to visualize. Please run a query first.');
      }
      return;
    }
    const currentIndex = this.selectedChart ? this.chartTypes.indexOf(this.selectedChart) : -1;
    this.selectedChart = this.chartTypes[(currentIndex + 1) % this.chartTypes.length];
    this.updateChartData();
  }

  onExport() {
    if (!this.queryData.length) {
      if (this.isBrowser) {
        alert('No data to export. Please run a query first.');
      }
      return;
    }
    const exportData = {
      sqlQuery: this.sqlQuery,
      chartType: this.selectedChart,
      queryData: this.queryData,
      xAxisColumns: this.xAxisColumns,
      yAxisColumns: this.yAxisColumns,
      timestamp: this.queryStatus.timestamp,
    };
    const dataStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    if (this.isBrowser) {
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `query_chart_${new Date().toISOString()}.json`;
      link.click();
      window.URL.revokeObjectURL(url);
    }
  }

  onSave() {
    if (!this.sqlQuery || !this.queryRequestBody) {
      if (this.isBrowser) {
        alert('No query to save. Please run a query first.');
      }
      return;
    }

    const queryBody: ApiQuery = {
      id: 0,
      queryName: `Query_${new Date().toISOString()}`,
      sqlQuery: this.sqlQuery,
      savedAt: new Date().toISOString(),
    };

    const chartBody: ApiChart = {
      id: 0,
      chartName: `Chart_${new Date().toISOString()}`,
      chartType: this.selectedChart || 'bar',
      queryId: 0,
      createdAt: new Date().toISOString(),
      tableName: this.queryRequestBody.tableName,
      xAxisColumns: this.xAxisColumns,
      yAxisColumns: this.yAxisColumns,
      aggregateFunction: this.queryRequestBody.aggregations?.[0]?.function || '',
      filters: this.queryRequestBody.filters || [],
      sortColumns: [],
      dataLimit: this.queryData.length,
      saved: true,
    };

    this.apiService.SaveSqlQuery(queryBody).subscribe({
      next: (savedQuery) => {
        chartBody.queryId = savedQuery.id;
        this.apiService.SaveChart(chartBody).subscribe({
          next: () => {
            if (this.isBrowser) {
              alert('Query and chart saved successfully!');
            }
          },
          error: (err) => {
            console.error('Save Chart Error:', err);
            if (this.isBrowser) {
              alert('Failed to save chart: ' + (err.message || 'Unknown error'));
            }
          },
        });
      },
      error: (err) => {
        console.error('Save Query Error:', err);
        if (this.isBrowser) {
          alert('Failed to save query: ' + (err.message || 'Unknown error'));
        }
      },
    });
  }

  onRunQuery() {
    this.generateAndExecuteQuery();
  }

  sortColumns() {
    const selectedColumns = this.columns.filter(
      item =>
        this.xAxis.some(x => x.item_id === item.item_id) ||
        this.yAxis.some(y => y.item_id === item.item_id)
    );
    const unselectedColumns = this.columns
      .filter(
        item =>
          !this.xAxis.some(x => x.item_id === item.item_id) &&
          !this.yAxis.some(y => y.item_id === item.item_id)
      )
      .sort((a, b) => a.originalIndex - b.originalIndex);

    this.columns = [...selectedColumns, ...unselectedColumns];
  }

  onAxisChange() {
    this.xAxisColumns = this.xAxis.map((item: any) => item.item_text);
    this.yAxisColumns = this.yAxis.map((item: any) => item.item_text);
    this.sortColumns();
    this.columns = [...this.columns];
    this.updateChartData();
    this.cdr.detectChanges();
  }

  updateChart() {
    this.onAxisChange();
  }

  sortTable(column: string) {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }

    this.filteredData.sort((a, b) => {
      const valueA = a[column] != null ? a[column].toString().toLowerCase() : '';
      const valueB = b[column] != null ? b[column].toString().toLowerCase() : '';
      if (valueA === '' && valueB !== '') return 1;
      if (valueB === '' && valueA !== '') return -1;
      if (valueA === '' && valueB === '') return 0;
      return this.sortDirection === 'asc' ? valueA.localeCompare(valueB) : valueB.localeCompare(valueA);
    });

    this.updatePagination();
  }

  onSearch() {
    this.filteredData = this.queryData.filter((row: any) =>
      Object.values(row).some((val) =>
        val?.toString().toLowerCase().includes(this.searchQuery.toLowerCase())
      )
    );
    this.totalRows = this.filteredData.length;
    this.currentPage = 1;
    this.updatePagination();
  }

  updatePagination() {
    const startIndex = (this.currentPage - 1) * this.rowsPerPage;
    const endIndex = startIndex + this.rowsPerPage;
    this.paginatedData = this.filteredData.slice(startIndex, endIndex);
  }

  previousPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.updatePagination();
    }
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.updatePagination();
    }
  }

  onRowsPerPageChange() {
    this.currentPage = 1;
    this.updatePagination();
  }

  get totalPages(): number {
    return Math.ceil(this.totalRows / this.rowsPerPage);
  }

  exportCsv() {
    if (!this.queryData.length) {
      if (this.isBrowser) {
        alert('No data to export. Please run a query first.');
      }
      return;
    }
    try {
      const csvData = this.queryData.map((row: any) =>
        Object.values(row)
          .map((val) => `"${val ?? ''}"`)
          .join(',')
      );
      csvData.unshift(this.availableColumns.join(','));
      const csvContent = csvData.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      if (this.isBrowser) {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `query_data_${new Date().toISOString()}.csv`;
        link.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('CSV Export Error:', error);
      if (this.isBrowser) {
        alert('Failed to export CSV: ' + (error instanceof Error ? error.message : 'Unknown error'));
      }
    }
  }

  exportExcel() {
    if (!this.queryData.length) {
      if (this.isBrowser) {
        alert('No data to export. Please run a query first.');
      }
      return;
    }
    try {
      const ws = XLSX.utils.json_to_sheet(this.queryData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'QueryData');
      if (this.isBrowser) {
        XLSX.writeFile(wb, `query_data_${new Date().toISOString()}.xlsx`);
      }
    } catch (error) {
      console.error('Excel Export Error:', error);
      if (this.isBrowser) {
        alert('Failed to export Excel: ' + (error instanceof Error ? error.message : 'Unknown error'));
      }
    }
  }

  exportPdf() {
    if (!this.queryData.length) {
      if (this.isBrowser) {
        alert('No data to export. Please run a query first.');
      }
      return;
    }
    try {
      const doc = new jsPDF();
      doc.text('Query Results', 14, 20);
      autoTable(doc, {
        head: [this.availableColumns],
        body: this.queryData.map((row: any) => Object.values(row).map(val => val ?? '')),
        startY: 30,
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246] },
      });
      if (this.isBrowser) {
        doc.save(`query_data_${new Date().toISOString()}.pdf`);
      }
    } catch (error) {
      console.error('PDF Export Error:', error);
      if (this.isBrowser) {
        alert('Failed to export PDF: ' + (error instanceof Error ? error.message : 'Unknown error'));
      }
    }
  }

  togglePanel(panel: keyof Panels) {
    this.panels[panel] = !this.panels[panel];
  }

  openFilter() {
    if (this.isBrowser) {
      alert('Filter functionality not implemented yet.');
    }
  }

  openSort() {
    if (this.isBrowser) {
      alert('Sort functionality not implemented yet.');
    }
  }

  openColumns() {
    if (this.isBrowser) {
      alert('Columns functionality not implemented yet.');
    }
  }

  viewRow(row: any) {
    if (this.isBrowser) {
      alert('Viewing row: ' + JSON.stringify(row));
    }
  }

  editRow(row: any) {
    if (this.isBrowser) {
      alert('Editing row: ' + JSON.stringify(row));
    }
  }

  onRowClick(row: any) {
    if (this.isBrowser) {
      alert('Row clicked: ' + JSON.stringify(row));
    }
  }

  editQuery() {
    if (this.isBrowser) {
      alert('Edit query functionality not implemented yet.');
    }
  }

  duplicateQuery() {
    if (this.isBrowser) {
      alert('Duplicate query functionality not implemented yet.');
    }
  }

  shareResults() {
    if (this.isBrowser) {
      alert('Share results functionality not implemented yet.');
    }
  }

  scheduleQuery() {
    if (this.isBrowser) {
      alert('Schedule query functionality not implemented yet.');
    }
  }

  toggleMenu(index: number): void {
    this.showMenuIndex = this.showMenuIndex === index ? null : index;
  }
}