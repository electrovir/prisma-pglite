const {baseConfig} = require('@virmator/spellcheck/configs/cspell.config.base.cjs');

module.exports = {
    ...baseConfig,
    ignorePaths: [
        ...baseConfig.ignorePaths,
        'test-files/migrations/',
        'src/generated/',
    ],
    words: [
        ...baseConfig.words,
        'pglite',
        'thevenet',
    ],
};
