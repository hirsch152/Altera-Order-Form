export interface ApparelSubmission {
  id: string;
  name: string;
  email: string;
  campus: string;
  item: string;
  size: 'S' | 'M' | 'L' | 'XL' | '2XL';
  timestamp: string;
}

export interface AppState {
  submissions: ApparelSubmission[];
  spreadsheetId: string | null;
  spreadsheetUrl: string | null;
}
