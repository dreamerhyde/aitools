export interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked';
  insertions: number;
  deletions: number;
  staged: boolean;
}

export interface GitStats {
  added: FileChange[];
  modified: FileChange[];
  deleted: FileChange[];
  renamed: FileChange[];
  untracked: string[];
  totalInsertions: number;
  totalDeletions: number;
  codeInsertions: number;
  generatedInsertions: number;
  codeDeletions: number;
  generatedDeletions: number;
  lastCommit: {
    hash: string;
    message: string;
    author: string;
    date: string;
  };
}

export interface GitStatsSummary {
  codeStats: { insertions: number; deletions: number; };
  generatedStats: { insertions: number; deletions: number; };
  totalFiles: number;
  stagedCount: number;
  unstagedCount: number;
}