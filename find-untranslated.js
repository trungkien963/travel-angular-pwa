const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? 
            walkDir(dirPath, callback) : callback(path.join(dir, f));
    });
}

const htmlFiles = [];
walkDir('./src/app', function(filePath) {
  if (filePath.endsWith('.html')) {
    htmlFiles.push(filePath);
  }
});

let untranslated = {};

htmlFiles.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, i) => {
        // match text between > and <
        const matches = line.match(/>([^<]+)</g);
        if (matches) {
            matches.forEach(m => {
                let text = m.substring(1, m.length - 1).trim();
                // Check if text is just empty, numbers, symbols, or contains {{
                if (text && text.length > 2 && !text.includes('{{') && /[a-zA-ZáàãảạăắằẵẳặâấầẫẩậéèẽẻẹêếềễểệíìĩỉịóòõỏọôốồỗổộơớờỡởợúùũủụưứừữửựýỳỹỷỵđĐ]/.test(text)) {
                    // Ignore some common un-translatable symbols like &nbsp; or purely technical stuff
                    if (!text.includes('&nbsp;')) {
                        if (!untranslated[file]) untranslated[file] = [];
                        untranslated[file].push({ line: i + 1, text: text });
                    }
                }
            });
        }
        
        // Match standard attributes like placeholder="..."
        const placeholderMatch = line.match(/placeholder="([^"]+)"/g);
        if (placeholderMatch) {
            placeholderMatch.forEach(m => {
                let text = m.replace('placeholder="', '').replace('"', '').trim();
                if (text && !text.includes('{{') && !text.includes('translate')) {
                    if (!untranslated[file]) untranslated[file] = [];
                    untranslated[file].push({ line: i + 1, text: `[placeholder] ${text}` });
                }
            });
        }
    });
});

for (const [file, items] of Object.entries(untranslated)) {
    console.log(`\n\x1b[36m${file}\x1b[0m`);
    items.forEach(item => {
        console.log(`  Line ${item.line}: \x1b[33m${item.text}\x1b[0m`);
    });
}
