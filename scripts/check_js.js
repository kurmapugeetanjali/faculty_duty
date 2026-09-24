const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');
const js = fs.readFileSync('public/js/app.js', 'utf8');

const idRegex = /getElementById\(['"]([^'"]+)['"]\)/g;
let match;
const missing = new Set();
while ((match = idRegex.exec(js)) !== null) {
    const id = match[1];
    if (!html.includes(`id="${id}"`) && !html.includes(`id='${id}'`)) {
        missing.add(id);
    }
}
console.log('Missing IDs accessed by getElementById in app.js:', Array.from(missing));

// Also check syntax errors in app.js
try {
    new Function(js);
    console.log('app.js syntax check: PASSED');
} catch (e) {
    console.error('app.js syntax error:', e);
}
