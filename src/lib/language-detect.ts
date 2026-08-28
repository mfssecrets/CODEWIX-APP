const EXT_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescriptreact',
  js: 'javascript',
  jsx: 'javascriptreact',
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  cpp: 'cpp',
  c: 'c',
  h: 'c',
  rb: 'ruby',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin',
  scala: 'scala',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  md: 'markdown',
  mdx: 'markdown',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  dockerfile: 'dockerfile',
  env: 'plaintext',
  txt: 'plaintext',
  csv: 'plaintext',
  svg: 'xml',
  vue: 'vue',
  svelte: 'svelte',
};

// Files that should be detected by name regardless of extension
const NAME_MAP: Record<string, string> = {
  Dockerfile: 'dockerfile',
  Makefile: 'makefile',
  Rakefile: 'ruby',
  Gemfile: 'ruby',
  Jenkinsfile: 'groovy',
  Vagrantfile: 'ruby',
  '.gitignore': 'plaintext',
  '.env': 'plaintext',
  '.env.local': 'plaintext',
  '.env.production': 'plaintext',
  '.env.development': 'plaintext',
  '.eslintrc': 'json',
  '.eslintrc.json': 'json',
  '.eslintrc.js': 'javascript',
  '.prettierrc': 'json',
  '.prettierrc.json': 'json',
  'tsconfig.json': 'json',
  'package.json': 'json',
  'next.config.js': 'javascript',
  'next.config.mjs': 'javascript',
  'next.config.ts': 'typescript',
  'tailwind.config.js': 'javascript',
  'tailwind.config.ts': 'typescript',
  'vite.config.ts': 'typescript',
  'vite.config.js': 'javascript',
};

export function detectLanguage(filePath: string): string {
  // Check by exact file name first
  const fileName = filePath.split('/').pop() || '';
  if (NAME_MAP[fileName]) return NAME_MAP[fileName];

  // Check by extension
  const ext = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() || '' : '';
  if (ext && EXT_MAP[ext]) return EXT_MAP[ext];

  return 'plaintext';
}
