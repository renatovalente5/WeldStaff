const fs = require('fs');
try {
    const pt = JSON.parse(fs.readFileSync('src/assets/i18n/pt-PT.json', 'utf8'));
    const en = JSON.parse(fs.readFileSync('src/assets/i18n/en.json', 'utf8'));
    const fr = JSON.parse(fs.readFileSync('src/assets/i18n/fr.json', 'utf8'));
    const es = JSON.parse(fs.readFileSync('src/assets/i18n/es.json', 'utf8'));

    function getKeys(obj, prefix = '') {
        let keys = [];
        for (const k in obj) {
            if (typeof obj[k] === 'object' && obj[k] !== null) {
                keys = keys.concat(getKeys(obj[k], prefix + k + '.'));
            } else {
                keys.push(prefix + k);
            }
        }
        return keys;
    }

    const ptKeys = getKeys(pt);
    const enKeys = getKeys(en);
    const frKeys = getKeys(fr);
    const esKeys = getKeys(es);

    const allKeys = new Set([...ptKeys, ...enKeys, ...frKeys, ...esKeys]);

    let hasMissing = false;
    allKeys.forEach(k => {
        if (!ptKeys.includes(k)) { console.log('Missing in PT: ', k); hasMissing = true; }
        if (!enKeys.includes(k)) { console.log('Missing in EN: ', k); hasMissing = true; }
        if (!frKeys.includes(k)) { console.log('Missing in FR: ', k); hasMissing = true; }
        if (!esKeys.includes(k)) { console.log('Missing in ES: ', k); hasMissing = true; }
    });

    if (!hasMissing) console.log('All keys match perfectly across pt-PT, en, fr, and es.');
} catch (e) {
    console.error(e);
}
