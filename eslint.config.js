import js from '@eslint/js';
import globals from 'globals';

export default [
    { ignores: ['assets/vendor/**'] },
    js.configs.recommended,
    {
        files: ['assets/**/*.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: globals.browser,
        },
        rules: {
            'no-unused-vars': 'error',
            eqeqeq: 'error',
            'no-implicit-globals': 'error',
            'prefer-const': 'error',
            'no-var': 'error',
        },
    },
];
