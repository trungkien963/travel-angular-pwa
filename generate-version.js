const fs = require('fs');
const packageJson = require('./package.json');

const version = packageJson.version || '1.0.0';

const content = `export const appVersion = 'v${version}';\n`;

const dir = './src/environments';
if (!fs.existsSync(dir)){
    fs.mkdirSync(dir, { recursive: true });
}

fs.writeFileSync(`${dir}/version.ts`, content);
console.log('Version injected: ' + content.trim());
