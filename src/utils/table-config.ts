/**
 * 共用的表格邊框字元配置
 */
export const TABLE_CHARS = {
  'top': '─',
  'top-mid': '┬',
  'top-left': '┌',
  'top-right': '┐',
  'bottom': '─',
  'bottom-mid': '┴',
  'bottom-left': '└',
  'bottom-right': '┘',
  'left': '│',
  'left-mid': '├',
  'mid': '─',
  'mid-mid': '┼',
  'right': '│',
  'right-mid': '┤',
  'middle': '│'
} as const;

/**
 * 預設表格樣式配置
 */
export const DEFAULT_TABLE_STYLE = {
  head: ['cyan'],
  border: ['gray']
} as const;