import fs from 'fs';
const schema = JSON.parse(fs.readFileSync('schema.json', 'utf8'));
console.log(Object.keys(schema.definitions.cash_closes.properties));
