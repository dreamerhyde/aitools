// Auto-generated file patterns - only files that are 100% tool-generated
const AUTO_GENERATED_PATTERNS = [
  // Lock files (package managers) - always auto-generated
  'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'bun.lock',
  'Pipfile.lock', 'poetry.lock', 'pdm.lock', 'Cargo.lock', 'go.sum',
  'composer.lock', 'Gemfile.lock', 'pubspec.lock', 'packages.lock.json',
  'gradle.lockfile', 'maven.lockfile', 'mix.lock', 'renv.lock',
  
  // Source maps - always generated from source files
  '*.map', '*.js.map', '*.css.map', '*.d.ts.map',
  
  // Build info files
  '.tsbuildinfo', 'tsconfig.tsbuildinfo'
];

export function isGeneratedFile(filePath: string): boolean {
  const fileName = filePath.split('/').pop() || '';
  const fullPath = filePath;
  
  return AUTO_GENERATED_PATTERNS.some(pattern => {
    if (pattern.endsWith('/')) {
      // Directory pattern
      return fullPath.startsWith(pattern) || fullPath.includes('/' + pattern);
    } else if (pattern.includes('*')) {
      // Glob pattern - be more specific with wildcards
      const regex = new RegExp('^' + pattern.replace(/\*/g, '[^/]*') + '$');
      return regex.test(fileName);
    } else {
      // Exact match
      return fileName === pattern || fullPath.endsWith('/' + pattern);
    }
  });
}

export function categorizeFileChanges(files: any[]) {
  let codeInsertions = 0, generatedInsertions = 0;
  let codeDeletions = 0, generatedDeletions = 0;
  
  files.forEach(file => {
    if (isGeneratedFile(file.path)) {
      generatedInsertions += file.insertions || 0;
      generatedDeletions += file.deletions || 0;
    } else {
      codeInsertions += file.insertions || 0;
      codeDeletions += file.deletions || 0;
    }
  });
  
  return {
    codeInsertions,
    generatedInsertions,
    codeDeletions,
    generatedDeletions
  };
}