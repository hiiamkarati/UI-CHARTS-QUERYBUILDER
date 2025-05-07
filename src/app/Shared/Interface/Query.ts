import { Filter } from "./Filter";
import { GroupingData, HavingCondition } from "./Group";
import { Join } from "./Join";

export interface Sort {
  column: string;
  direction: 'ASC' | 'DESC';
}

export interface Aggregation {
  function: 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';
  column: string;
  alias?: string;
}

export interface Query {
  id: number;
  name: string;
  selectedTable: string;
  selectedTableToAppend: string;
  selectedColumns: string[];
  allColumns: string[];
  columnList: string[];
  tableData: any[];
  filters: Filter[];
  joins: Join[];
  groups: GroupingData[];
  dropDuplicates: string;
  havingConditions: HavingCondition[];
  sort: Sort[];
  aggregations: Aggregation[];
  groupByColumns: string[];
  queryName?: string;
  sqlQuery?: string;
  savedAt?: string;
}