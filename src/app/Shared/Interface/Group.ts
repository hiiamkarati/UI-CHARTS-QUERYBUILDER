export interface GroupingData {
  groupByColumn: string;
  aggregateFunction: string;
  aggregateColumn: string;
  groupByColumnType?: string;
  aggregateColumnType?: string;
  alias?: string; // Added for backend Alias support
}

export interface HavingCondition {
  aggregateColumn: string;
  operator: string;
  value: string | number;
  logicalOperator: string;
  availableOperators: string[];
  values?: (string | number)[];
  valueStart?: string | number;
  valueEnd?: string | number;
}