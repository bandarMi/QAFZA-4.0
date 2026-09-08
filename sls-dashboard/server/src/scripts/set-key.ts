/**
 * Terminal shortcut for setting the Anthropic API key:
 *   npm run set-key                 -> prompts (input hidden)
 *   npm run set-key -- sk-ant-...   -> sets directly
 *   npm run set-key -- --remove     -> clears the stored key
 *   npm run set-key -- --status     -> shows what is configured
 *
 * Same encrypted store the Settings page writes to, so either route works.
 */
import readline from 'node:readline';
import { setSecret, clearSecret, secretStatus } from '../lib/settings.js';
import { testApiKey } from '../lib/ai.js';

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  return new Promise(resolve => {
    // Hide the key as it is typed.
    const stdout = process.stdout as any;
    const onData = () => { stdout.write(`\r${question}${' '.repeat(60)}\r${question}`); };
    process.stdin.on('data', onData);
    rl.question(question, ans => { process.stdin.off('data', onData); rl.close(); process.stdout.write('\n'); resolve(ans.trim()); });
  });
}

const arg = process.argv[2];

if (arg === '--status') {
  const s = secretStatus('ANTHROPIC_API_KEY');
  console.log(s.configured
    ? `Anthropic API key: configured from ${s.source} (${s.masked})${s.updatedAt ? `, updated ${s.updatedAt}` : ''}`
    : 'Anthropic API key: not configured. The AI features are off.');
  process.exit(0);
}

if (arg === '--remove') {
  clearSecret('ANTHROPIC_API_KEY');
  const s = secretStatus('ANTHROPIC_API_KEY');
  console.log(s.configured
    ? `Stored key removed. An ANTHROPIC_API_KEY environment variable is still in effect (${s.masked}).`
    : 'Stored key removed. The AI features are now off.');
  process.exit(0);
}

const key = arg ?? await ask('Paste your Anthropic API key (input hidden): ');
if (!key) { console.error('No key entered. Nothing changed.'); process.exit(1); }

process.stdout.write('Verifying the key against the Anthropic API… ');
const test = await testApiKey(key);
console.log(test.ok ? 'ok' : 'failed');
console.log(`  ${test.message}`);

if (!test.ok) {
  console.error('\nThe key was NOT saved. Fix the problem above and try again.');
  process.exit(1);
}
setSecret('ANTHROPIC_API_KEY', key);
console.log(`\nSaved (encrypted) to server/data/secrets.local.json. AI features are on — restart the server if it is running.`);
