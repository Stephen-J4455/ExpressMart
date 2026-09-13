import fs from 'fs';
import * as babel from '@babel/parser';
const src = fs.readFileSync('./src/screens/StoreScreen.js', 'utf8');
try {
  babel.parse(src, { sourceType: 'module', plugins: ['jsx'] });
  console.log('OK — parsed cleanly');
} catch (e) {
  console.log('PARSE ERROR:', e.message);
  const m = e.message.match(/\((\d+):(\d+)\)/);
  if (m) {
    const ln = parseInt(m[1]);
    const lines = src.split('\n');
    console.log('Context:');
    for (let i = Math.max(0, ln - 4); i < Math.min(lines.length, ln + 3); i++) {
      console.log((i+1) + ': ' + lines[i]);
    }
  }
}
