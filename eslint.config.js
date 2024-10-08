import globals from "globals";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default [{
    ignores: ["**/node_modules/", "**/dist/"],
}, ...compat.extends("athom"), {
    languageOptions: {
        globals: {
            ...globals.node,
        },

        ecmaVersion: 2020,
        sourceType: "module",
    },

    rules: {
        indent: "off",
        "padded-blocks": "off",

        "node/no-unsupported-features/es-syntax": ["error", {
            ignores: ["modules"],
        }],

        "node/no-missing-import": ["error", {
            allowModules: ["homey"],
        }],

        "operator-linebreak": ["error", "after"],
    },
}];