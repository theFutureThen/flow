import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import importX from 'eslint-plugin-import-x';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/.vite/**', '**/out/**', '**/node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: { 'import-x': importX },
    settings: {
      // resolver 不可省略：解析不到导入目标时 no-restricted-paths 会静默放行
      'import-x/resolver-next': [
        importX.createNodeResolver({ extensions: ['.ts', '.tsx', '.js', '.jsx'] }),
      ],
    },
    rules: {
      'import-x/no-restricted-paths': ['error', {
        // basePath 不可省略：缺失时 zones 的相对路径不解析，规则静默失效
        basePath: import.meta.dirname,
        zones: [
          {
            target: './packages',
            from: './apps',
            message: 'packages/* 不得依赖 apps/*（spec §12 规则 2）',
          },
          {
            target: './plugins',
            from: './apps',
            message: 'plugins/* 不得依赖 apps/*（spec §12 规则 2）',
          },
          {
            target: './packages/core',
            from: './packages/ui',
            message: 'core 不得依赖 ui（spec §12 规则 1 的延伸）',
          },
          {
            target: './apps/desktop/src/renderer',
            from: './apps/desktop/src/main',
            message: '渲染层不得直接 import 主进程代码，只能通过 preload（spec §12 规则 3）',
          },
          {
            target: './apps/desktop/src/main/plugins',
            from: './apps/desktop/src/main/features',
            message: '插件运行时不应知道特权内置工具的存在（spec §12 规则 5）',
          },
        ],
      }],
    },
  },
);
