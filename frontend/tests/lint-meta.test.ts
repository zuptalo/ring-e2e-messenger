import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';

// Guards against eslint.config.js regressions that `pnpm exec eslint` in CI
// would only surface as a lint failure on some random file. Here we load the
// flat config directly: a broken import, a bad plugin reference, or a syntax
// error in the config throws at calculateConfigForFile time.
describe('eslint flat config', () => {
  it('loads and resolves a config for a TypeScript file', async () => {
    const eslint = new ESLint();
    const config = await eslint.calculateConfigForFile('src/lib/version.ts');
    expect(config).toBeTruthy();
    expect(config.rules).toBeTypeOf('object');
  });

  it('loads and resolves a config for a Svelte file', async () => {
    const eslint = new ESLint();
    const config = await eslint.calculateConfigForFile('src/routes/+page.svelte');
    expect(config).toBeTruthy();
  });
});
