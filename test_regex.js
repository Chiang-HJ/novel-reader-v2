const target = '這是一段。 \n 廢話';
const cleanTarget = target.replace(/\s+/g, '');
const flexibleTarget = cleanTarget.split('').map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
const regex = new RegExp(flexibleTarget, 'g');
console.log('Regex:', regex);
const original = '這是一段。廢話';
console.log('Match:', original.replace(regex, '---'));
