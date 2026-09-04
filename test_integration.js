import { getParserForUrl } from './src/utils/parsers/index.js';
const url = 'http://www.xbanxia.cc/books/143300.html';
const parser = getParserForUrl(url);
console.log(parser.name);
