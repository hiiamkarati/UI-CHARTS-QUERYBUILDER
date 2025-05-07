export interface Filter {
  column: string;
  operation: string;
  value?: string | number;
  values: (string | number)[];
  valueStart?: string | number;
  valueEnd?: string | number;
  availableOperations: string[];
  availableValues: (string | number)[];
  condition: 'AND' | 'OR';
  isMultiSelectOpen?: boolean;
}

export interface FilterColumn {
  name: string;
  type: 'string' | 'DateTime' | 'integer' | 'decimal';
  values: (string | number)[];
}