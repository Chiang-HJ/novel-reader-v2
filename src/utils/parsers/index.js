import * as czbooks from './czbooks';
import * as twkan from './twkan';
import * as wyblogs from './wyblogs';
import * as blogspot from './blogspot';

export const parsers = [
    czbooks,
    twkan,
    wyblogs,
    blogspot
];

export const getParserForUrl = (url) => {
    return parsers.find(p => url && url.includes(p.domain)) || czbooks; // Fallback to czbooks
};

