import assert from 'assert';
import { registerLanguage, SUPPORTED_LANGUAGES } from '../../../language-expansion.js';
import { config } from '../../../state.js';

describe('Language Expansion', () => {
  it('should have built-in language patterns', () => {
    assert.ok(SUPPORTED_LANGUAGES.js);
    assert.ok(SUPPORTED_LANGUAGES.ts);
    assert.ok(SUPPORTED_LANGUAGES.python);
  });
  
  it('should register custom language patterns', async () => {
    const rubyConfig = {
      extensions: ['.rb'],
      variablePattern: /(?:^|\s)([a-zA-Z_][a-zA-Z0-9_]*)\s*=/g,
      functionPattern: /def\s+([a-zA-Z_][a-zA-Z0-9_?!]*)/g,
      importPattern: /require\s+['"]([^'"]+)['"]/g,
      unusedPrefix: '_',
      commentStyle: '#',
      engines: ['rubocop']
    };
    
    const result = await registerLanguage('ruby', rubyConfig);
    assert.ok(result);
    assert.ok(config.LANGUAGE_PATTERNS.ruby);
  });
});
