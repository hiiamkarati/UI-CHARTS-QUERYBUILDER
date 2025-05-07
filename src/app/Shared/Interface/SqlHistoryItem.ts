export interface SqlHistoryItem{
  id?: number; //optional
  sqlQuery: string;
  queryName: string;
  queryTitle: string;
  userId: number;
  createdAt?: string; // Optional
}