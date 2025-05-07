export interface Join{
    joinTable: string;
    sourceColumn: string;
    targetColumn: string;
    joinType: string;
    rightColumns: string[];
    sourceColumns: string[];
    targetColumns: string[];
    re:string[];
    sourceColumnType?: string;  // New property for source column data type
    targetColumnType?: string;
}