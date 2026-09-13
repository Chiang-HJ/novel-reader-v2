const fs = require('fs');
let code = fs.readFileSync('src/screens/ReaderScreen.js', 'utf8');

const target = `    const playFromIndex = async (index, sents, playId) => {
        if (playId !== playIdRef.current) return;
        
        if (index >= sents.length) {
            // Chapter finished`;

const replacement = `    const playFromIndex = async (index, sents, playId) => {
        if (playId !== playIdRef.current) return;
        if (sents.length === 0) {
            setPlayingState(false);
            return;
        }
        
        if (index >= sents.length) {
            // Chapter finished`;

code = code.replace(target, replacement);
fs.writeFileSync('src/screens/ReaderScreen.js', code, 'utf8');
