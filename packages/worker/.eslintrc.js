module.exports = {
    root: true,
    parser: "@typescript-eslint/parser",
    parserOptions: {
        ecmaVersion: 2021,
        sourceType: "module",
    },
    plugins: ["@typescript-eslint"],
    extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
    env: {
        es2021: true,
        worker: true,
    },
    rules: {
        // AGENTS.md: no "any" en el módulo que construye transacciones hacia el contrato.
        "@typescript-eslint/no-explicit-any": "error",
    },
};
