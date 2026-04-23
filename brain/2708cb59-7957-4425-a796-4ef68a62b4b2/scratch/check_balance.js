import fs from 'fs';

const content = fs.readFileSync('c:/Users/User/Downloads/kim-long-smart-catering-system/pages/OrderManagement.tsx', 'utf8');

let parens = 0;
let braces = 0;
let brackets = 0;

for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '(') parens++;
    else if (char === ')') parens--;
    else if (char === '{') braces++;
    else if (char === '}') braces--;
    else if (char === '[') brackets++;
    else if (char === ']') brackets--;
    
    if (parens < 0) console.log(`Extra ) at char ${i}`);
    if (braces < 0) console.log(`Extra } at char ${i}`);
    if (brackets < 0) console.log(`Extra ] at char ${i}`);
}

console.log(`Final counts - Parens: ${parens}, Braces: ${braces}, Brackets: ${brackets}`);
