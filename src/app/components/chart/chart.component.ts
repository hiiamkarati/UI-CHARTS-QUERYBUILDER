import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { NgChartsModule } from 'ng2-charts';
import { NgMultiSelectDropDownModule, IDropdownSettings } from 'ng-multiselect-dropdown';
import { ChartConfiguration, ChartType } from 'chart.js';
import { ApiService, ApiQuery, ApiChart, Filter, SortColumn, FilterColumn } from '../../Services/api.service';
import { QueryService } from '../../Services/query.service';
import { QueryRequestBody } from '../dashboard/dashboard.component';
import { trigger, style, animate, transition } from '@angular/animations';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
    trigger('modalFade', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.8)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'scale(1)' })),
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0, transform: 'scale(0.8)' })),
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
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          font: { size: 14, family: 'Inter, Arial, sans-serif' },
          padding: 15,
          usePointStyle: true,
        },
        onClick: (e, legendItem, legend) => {
          const index = legendItem.datasetIndex;
          const ci = legend.chart;
          if (index !== undefined) {
            ci.toggleDataVisibility(index);
            ci.update();
          }
        },
      },
      tooltip: {
        enabled: true,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleFont: { size: 14 },
        bodyFont: { size: 12 },
        padding: 10,
        cornerRadius: 4,
        callbacks: {
          label: (context) => {
            const label = context.dataset.label || '';
            const value = context.parsed.y || context.parsed;
            return `${label}: ${value}`;
          },
        },
      },
    },
    animation: {
      duration: 1000,
      easing: 'easeInOutQuad',
    },
    scales: {
      y: {
        beginAtZero: true,
        display: true,
        grid: { color: 'rgba(209, 213, 219, 0.3)' },
        ticks: { color: '#1f2937', font: { size: 12 } },
      },
      x: {
        display: true,
        grid: { display: false },
        ticks: {
          color: '#1f2937',
          font: { size: 12 },
          autoSkip: false,
          maxRotation: 45,
          minRotation: 0,
        },
      },
    },
    onClick: (event, elements, chart) => {
      if (elements.length > 0) {
        const element = elements[0];
        const datasetIndex = element.datasetIndex;
        const index = element.index;
        const label = chart.data.labels?.[index];
        const datasetLabel = chart.data.datasets[datasetIndex].label;
        this.handleChartClick(label, datasetLabel, index);
      }
    },
    onHover: (event, elements, chart) => {
      const el = chart.canvas;
      el.style.cursor = elements.length > 0 ? 'pointer' : 'default';
    },
  };

  xAxis: DropdownItem[] = [];
  yAxis: DropdownItem[] = [];
  xAxisColumns: string[] = [];
  yAxisColumns: string[] = [];
  availableColumns: string[] = [];
  selectedColumns: string[] = [];
  columns: DropdownItem[] = [];
  filterColumns: FilterColumn[] = [];

  showColumnsModal = false;
  showFilterModal = false;
  showSortModal = false;
  filters: Filter[] = [];
  sortColumns: SortColumn[] = [];

  sortByDisplay: string = 'None';
  filtersDisplay: string = 'None';

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
  tableName: string = '';

  sqlQuery = '';
  panels: Panels = { sql: false, dataSource: false, parameters: false, columns: false, filters: false };
  queryRequestBody: QueryRequestBody | null = null;
  isLoading = false;
  showMenuIndex: number | null = null;

  constructor(private apiService: ApiService, private queryService: QueryService) {}

  ngOnInit() {
    this.queryService.getQueryBody().subscribe((body: QueryRequestBody | null) => {
      if (body) {
        this.queryRequestBody = body;
        this.tableName = body.tableName;
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
        alert('No query selected. Please generate and execute a query in the dashboard.');
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
              .map((col, index) => ({ item_id: index, item_text: col, isSelected: true }));
            this.selectedColumns = this.availableColumns;
            this.xAxis = this.columns.slice(0, 1).map(item => ({ ...item, isSelected: true }));
            this.yAxis = this.columns.slice(1, 2).map(item => ({ ...item, isSelected: true }));
            this.xAxisColumns = this.xAxis.map(item => item.item_text);
            this.yAxisColumns = this.yAxis.map(item => item.item_text);
            this.initializeFilterColumns();
            this.applyFiltersAndSort();
            this.updatePagination();
            this.updateChartData();
            this.isLoading = false;
          },
          error: (err) => this.handleQueryFailure(err, startTime),
        });
      },
      error: (err) => this.handleQueryFailure(err, startTime),
    });
  }

  private initializeFilterColumns() {
    this.apiService.GetDataTypeData(this.tableName).subscribe({
      next: (dataTypes) => {
        this.filterColumns = this.availableColumns.map(col => ({
          name: col,
          type: dataTypes[col] || 'string',
          values: [],
        }));
        this.fetchDistinctValues();
      },
      error: (err) => console.error('Failed to fetch data types:', err),
    });
  }

  private fetchDistinctValues() {
    this.filterColumns.forEach(col => {
      this.apiService.GetDistinctColValues(this.tableName, col.name).subscribe({
        next: (values) => {
          col.values = values.map((v: any) => v[col.name]);
          this.filters = this.filters.map(filter => ({
            ...filter,
            availableValues: filter.column === col.name ? col.values : filter.availableValues,
          }));
          this.updateDisplayStrings();
        },
        error: (err) => console.error(`Failed to fetch distinct values for ${col.name}:`, err),
      });
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
    alert('Failed to process query: ' + (err.message || 'Unknown error'));
  }

  updateChartData() {
    if (!this.queryData.length || !this.selectedChart || !this.xAxisColumns.length || !this.yAxisColumns.length) {
      this.chartData = { labels: [], datasets: [] };
      return;
    }

    const labels = this.queryData.map((row) => {
      if (this.xAxisColumns.length === 1) {
        const value = row[this.xAxisColumns[0]];
        return value != null ? String(value) : 'Unknown';
      }
      return this.xAxisColumns
        .map(col => (row[col] != null ? String(row[col]) : 'Unknown'))
        .join(' - ');
    });

    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

    if (this.selectedChart === 'pie') {
      const aggregatedData = this.queryData.map((row) => {
        return this.yAxisColumns.reduce((sum, col) => {
          const value = row[col];
          return sum + (value != null && !isNaN(Number(value)) ? Number(value) : 0);
        }, 0);
      });

      this.chartData = {
        labels,
        datasets: [{
          label: 'Aggregated Y-Axis',
          data: aggregatedData.filter(val => Number.isFinite(val)),
          backgroundColor: ['#60a5fa', '#93c5fd', '#2563eb', '#1d4ed8', '#bfdbfe'],
          borderColor: '#2563eb',
          borderWidth: 1,
          hoverOffset: 20,
        }],
      };
    } else {
      const datasets = this.yAxisColumns.map((yCol, index) => {
        const values = this.queryData.map((row) => {
          const value = row[yCol];
          return value != null && !isNaN(Number(value)) ? Number(value) : 0;
        });

        const color = colors[index % colors.length];

        return {
          label: yCol,
          data: values,
          backgroundColor: this.selectedChart === 'bar' ? color : 'transparent',
          borderColor: color,
          borderWidth: this.selectedChart === 'line' ? 2 : 1,
          fill: this.selectedChart === 'line' ? false : true,
          pointRadius: this.selectedChart === 'line' ? 4 : 0,
          pointHoverRadius: this.selectedChart === 'line' ? 6 : 0,
          hoverBackgroundColor: color,
          hoverBorderWidth: 2,
        };
      });

      this.chartData = {
        labels,
        datasets,
      };
    }

    // Update chart options based on chart type
    this.chartOptions = {
      ...this.chartOptions,
      scales: {
        y: {
          beginAtZero: true,
          display: this.selectedChart !== 'pie',
          grid: { color: 'rgba(209, 213, 219, 0.3)' },
          ticks: { color: '#1f2937', font: { size: 12 } },
        },
        x: {
          display: this.selectedChart !== 'pie',
          grid: { display: false },
          ticks: {
            color: '#1f2937',
            font: { size: 12 },
            autoSkip: false,
            maxRotation: 45,
            minRotation: 0,
          },
        },
      },
    };
  }

  handleChartClick(label: any, datasetLabel: any, index: number) {
    const filter = this.filters.find(f => f.column === this.xAxisColumns[0]);
    if (filter) {
      filter.values = [label];
    } else {
      this.filters.push({
        column: this.xAxisColumns[0],
        operation: 'equals',
        values: [label],
        availableOperations: ['equals'],
        availableValues: [label],
        condition: 'and',
      });
    }
    this.applyFiltersAndSort();
    alert(`Filtered by ${this.xAxisColumns[0]} = ${label}`);
  }

  selectChart(chartType: ChartType | null) {
    this.selectedChart = chartType;
    this.updateChartData();
  }

  autoVisualize() {
    if (!this.queryData.length) {
      alert('No data to visualize. Please run a query first.');
      return;
    }
    const currentIndex = this.selectedChart ? this.chartTypes.indexOf(this.selectedChart) : -1;
    this.selectedChart = this.chartTypes[(currentIndex + 1) % this.chartTypes.length];
    this.updateChartData();
  }

  onExport() {
    if (!this.queryData.length) {
      alert('No data to export. Please run a query first.');
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
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `query_chart_${new Date().toISOString()}.json`;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  onSave() {
    if (!this.sqlQuery || !this.queryRequestBody) {
      alert('No query to save. Please run a query first.');
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
      filters: this.filters,
      sortColumns: this.sortColumns,
      dataLimit: this.queryData.length,
      saved: true,
    };

    this.apiService.SaveSqlQuery(queryBody).subscribe({
      next: (savedQuery) => {
        chartBody.queryId = savedQuery.id;
        this.apiService.SaveChart(chartBody).subscribe({
          next: () => alert('Query and chart saved successfully!'),
          error: (err) => {
            console.error('Save Chart Error:', err);
            alert('Failed to save chart: ' + (err.message || 'Unknown error'));
          },
        });
      },
      error: (err) => {
        console.error('Save Query Error:', err);
        alert('Failed to save query: ' + (err.message || 'Unknown error'));
      },
    });
  }

  onRunQuery() {
    this.generateAndExecuteQuery();
  }

  reorderColumns() {
    const sortedColumns = [...this.columns];
    sortedColumns.forEach(item => {
      item.isSelected = this.xAxis.some(x => x.item_id === item.item_id) || 
                        this.yAxis.some(y => y.item_id === item.item_id);
    });
    this.columns = [
      ...sortedColumns.filter(item => item.isSelected),
      ...sortedColumns.filter(item => !item.isSelected).sort((a, b) => a.item_text.localeCompare(b.item_text)),
    ];
  }

  onAxisChange() {
    this.xAxisColumns = this.xAxis.map(item => item.item_text);
    this.yAxisColumns = this.yAxis.map(item => item.item_text);
    this.reorderColumns();
    this.updateChartData();
  }

  updateChart() {
    this.onAxisChange();
  }

  openColumns() {
    this.showColumnsModal = true;
  }

  closeColumnsModal() {
    this.showColumnsModal = false;
  }

  applyColumns() {
    this.selectedColumns = this.columns.filter(col => col.isSelected).map(col => col.item_text);
    this.applyFiltersAndSort();
    this.closeColumnsModal();
  }

  openFilter() {
    this.showFilterModal = true;
  }

  closeFilterModal() {
    this.showFilterModal = false;
  }

  addFilter() {
    const column = this.availableColumns[0] || '';
    const colType = this.filterColumns.find(c => c.name === column)?.type || 'string';
    const operations = colType.includes('int') || colType.includes('float') 
      ? ['equals', 'not equals', 'greater than', 'less than', 'range']
      : ['equals', 'not equals', 'contains', 'like'];
    this.filters.push({
      column,
      operation: operations[0],
      values: [],
      availableOperations: operations,
      availableValues: this.filterColumns.find(c => c.name === column)?.values || [],
      condition: 'and',
    });
    this.updateDisplayStrings();
  }

  removeFilter(index: number) {
    this.filters.splice(index, 1);
    this.applyFiltersAndSort();
  }

  onFilterColumnChange(filter: Filter) {
    const col = this.filterColumns.find(c => c.name === filter.column);
    filter.availableValues = col?.values || [];
    filter.values = [];
    filter.operation = col?.type.includes('int') || col?.type.includes('float') 
      ? 'equals' 
      : 'contains';
    filter.availableOperations = col?.type.includes('int') || col?.type.includes('float')
      ? ['equals', 'not equals', 'greater than', 'less than', 'range']
      : ['equals', 'not equals', 'contains', 'like'];
    this.updateDisplayStrings();
  }

  applyFilters() {
    this.applyFiltersAndSort();
    this.closeFilterModal();
  }

  openSort() {
    this.showSortModal = true;
  }

  closeSortModal() {
    this.showSortModal = false;
  }

  addSort() {
    this.sortColumns.push({
      column: this.availableColumns[0] || '',
      order: 'asc',
    });
    this.updateDisplayStrings();
  }

  removeSort(index: number) {
    this.sortColumns.splice(index, 1);
    this.applyFiltersAndSort();
  }

  applySort() {
    this.applyFiltersAndSort();
    this.closeSortModal();
  }

  private updateDisplayStrings() {
    this.sortByDisplay = this.sortColumns.length
      ? this.sortColumns.map(s => `${s.column} (${s.order})`).join(', ')
      : 'None';
    this.filtersDisplay = this.filters.length
      ? this.filters.map(f => `${f.column} ${f.operation}`).join(', ')
      : 'None';
  }

  getFilterValues(filter: Filter): DropdownItem[] {
    return filter.availableValues.map((v, idx) => ({
      item_id: idx,
      item_text: String(v),
      isSelected: false,
    }));
  }

  applyFiltersAndSort() {
    let data = [...this.queryData];

    if (this.searchQuery) {
      data = data.filter((row) =>
        Object.values(row).some((val) =>
          val?.toString().toLowerCase().includes(this.searchQuery.toLowerCase())
        )
      );
    }

    this.filters.forEach(filter => {
      data = data.filter(row => {
        const value = row[filter.column];
        if (value == null) return false;

        const filterValues = filter.values.map(v => v.toString().toLowerCase());
        const strValue = value.toString().toLowerCase();
        const numValue = Number(value);

        switch (filter.operation) {
          case 'equals':
            return filterValues.includes(strValue);
          case 'not equals':
            return !filterValues.includes(strValue);
          case 'contains':
            return filterValues.some(v => strValue.includes(v));
          case 'like':
            return filterValues.some(v => strValue.match(new RegExp(v.replace('%', '.*'), 'i')));
          case 'greater than':
            return !isNaN(numValue) && numValue > Number(filter.values[0]);
          case 'less than':
            return !isNaN(numValue) && numValue < Number(filter.values[0]);
          case 'range':
            return !isNaN(numValue) && numValue >= Number(filter.valueStart) && numValue <= Number(filter.valueEnd);
          default:
            return true;
        }
      });
    });

    if (this.sortColumns.length > 0) {
      data.sort((a, b) => {
        for (const sort of this.sortColumns) {
          const valueA = a[sort.column] != null ? a[sort.column].toString().toLowerCase() : '';
          const valueB = b[sort.column] != null ? b[sort.column].toString().toLowerCase() : '';
          if (valueA === '' && valueB !== '') return 1;
          if (valueB === '' && valueA !== '') return -1;
          if (valueA === '' && valueB === '') continue;
          const comparison = valueA.localeCompare(valueB);
          if (comparison !== 0) {
            return sort.order === 'asc' ? comparison : -comparison;
          }
        }
        return 0;
      });
    }

    this.filteredData = data;
    this.totalRows = data.length;
    this.currentPage = 1;
    this.updatePagination();
    this.updateDisplayStrings();
    this.updateChartData();
  }

  sortTable(column: string) {
    this.sortColumns = [{
      column,
      order: this.sortColumn === column && this.sortDirection === 'asc' ? 'desc' : 'asc'
    }];
    this.sortColumn = column;
    this.sortDirection = this.sortColumns[0].order;
    this.applyFiltersAndSort();
  }

  onSearch() {
    this.applyFiltersAndSort();
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
      alert('No data to export. Please run a query first.');
      return;
    }
    try {
      const csvData = this.queryData.map((row) =>
        Object.values(row)
          .map((val) => `"${val ?? ''}"`)
          .join(',')
      );
      csvData.unshift(this.availableColumns.join(','));
      const csvContent = csvData.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `query_data_${new Date().toISOString()}.csv`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('CSV Export Error:', error);
      alert('Failed to export CSV: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  exportExcel() {
    if (!this.queryData.length) {
      alert('No data to export. Please run a query first.');
      return;
    }
    try {
      const ws = XLSX.utils.json_to_sheet(this.queryData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'QueryData');
      XLSX.writeFile(wb, `query_data_${new Date().toISOString()}.xlsx`);
    } catch (error) {
      console.error('Excel Export Error:', error);
      alert('Failed to export Excel: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  exportPdf() {
    if (!this.queryData.length) {
      alert('No data to export. Please run a query first.');
      return;
    }
    try {
      const doc = new jsPDF();
      doc.text('Query Results', 14, 20);
      autoTable(doc, {
        head: [this.selectedColumns],
        body: this.queryData.map((row) => this.selectedColumns.map(col => row[col] ?? '')),
        startY: 30,
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246] },
      });
      doc.save(`query_data_${new Date().toISOString()}.pdf`);
    } catch (error) {
      console.error('PDF Export Error:', error);
      alert('Failed to export PDF: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  togglePanel(panel: keyof Panels) {
    this.panels[panel] = !this.panels[panel];
  }

  viewRow(row: any) {
    alert('Viewing row: ' + JSON.stringify(row));
  }

  editRow(row: any) {
    alert('Editing row: ' + JSON.stringify(row));
  }

  onRowClick(row: any) {
    alert('Row clicked: ' + JSON.stringify(row));
  }

  editQuery() {
    alert('Edit query functionality not implemented yet.');
  }

  duplicateQuery() {
    alert('Duplicate query functionality not implemented yet.');
  }

  shareResults() {
    alert('Share results functionality not implemented yet.');
  }

  scheduleQuery() {
    alert('Schedule query functionality not implemented yet.');
  }

  toggleMenu(index: number): void {
    this.showMenuIndex = this.showMenuIndex === index ? null : index;
  }
}