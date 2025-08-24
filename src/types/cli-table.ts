/**
 * CLI Table 類型定義
 * 解決 cli-table3 的 TypeScript 類型問題
 */

export interface TableCellConfig {
  content: string;
  hAlign?: 'left' | 'center' | 'right';
  vAlign?: 'top' | 'center' | 'bottom';
}

export type TableCell = string | TableCellConfig;

export interface TableHeaderConfig {
  content: string;
  hAlign?: 'left' | 'center' | 'right';
}

export type TableHeader = string | TableHeaderConfig;

export interface TableStyle {
  head?: string[];
  border?: string[];
}

export interface TableChars {
  'top': string;
  'top-mid': string;
  'top-left': string;
  'top-right': string;
  'bottom': string;
  'bottom-mid': string;
  'bottom-left': string;
  'bottom-right': string;
  'left': string;
  'left-mid': string;
  'mid': string;
  'mid-mid': string;
  'right': string;
  'right-mid': string;
  'middle': string;
}

export interface TableConfig {
  head?: TableHeader[];
  colWidths?: number[];
  style?: TableStyle;
  chars?: TableChars;
}

export interface TableConstructor {
  new (config?: TableConfig): {
    push: (row: TableCell[]) => void;
    toString: () => string;
  };
}