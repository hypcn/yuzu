// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin'

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '**/*.js',
      '**/*.mjs',
      '**/*.d.ts',
      'coverage/**',
      '.vscode/**',
    ],
  },
  {
    plugins: {
      '@stylistic': stylistic,
    },
    rules: {

      // Allow unused vars - useful for prototyping - can be removed later
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",
      // Allow explicit any - ? what's the reason?
      "@typescript-eslint/no-explicit-any": "off",
      // Allow unused expressions - useful for prototyping - can be removed later
      "@typescript-eslint/no-unused-expressions": "off",
      // Allow extra boolean cast - makes code more explicit
      "no-extra-boolean-cast": "off",
      // Allow empty object types for typed Mithril component definitions
      "@typescript-eslint/no-empty-object-type": "off",
      // Handled by Typescript, and trips up on `module.exports` in plugin definitions
      "no-undef": "off",

      // ===== Stylistic rules =====
      "@stylistic/array-bracket-newline": ["error", "consistent"],
      "@stylistic/array-bracket-spacing": "error",
      "@stylistic/array-element-newline": ["error", "consistent"],
      // "@stylistic/arrow-parens": "error",
      "@stylistic/arrow-spacing": "error", // yes
      "@stylistic/block-spacing": "error",
      // "@stylistic/brace-style": "error", // not for now, maybe revisit later
      "@stylistic/comma-dangle": ["error", "always-multiline"],
      "@stylistic/comma-spacing": "error", // yes
      "@stylistic/comma-style": "error",
      "@stylistic/computed-property-spacing": "error",
      "@stylistic/curly-newline": "error",
      "@stylistic/dot-location": ["error", "property"],
      "@stylistic/eol-last": "error",
      // "@stylistic/func-call-spacing": "error", // Deprecated, use function-call-spacing
      // "@stylistic/function-call-argument-newline": "error", // no
      "@stylistic/function-call-spacing": "error",
      "@stylistic/function-paren-newline": ["error", "consistent"],
      "@stylistic/generator-star-spacing": "error",
      "@stylistic/implicit-arrow-linebreak": "error",
      // This one is currently broken, with no plan to fix it: https://github.com/typescript-eslint/typescript-eslint/issues/1824
      // "@stylistic/indent": ["error", 2],
      "@stylistic/indent-binary-ops": "error",
      // We don't use JSX
      // "@stylistic/jsx-child-element-spacing": "error",
      // "@stylistic/jsx-closing-bracket-location": "error",
      // "@stylistic/jsx-closing-tag-location": "error",
      // "@stylistic/jsx-curly-brace-presence": "error",
      // "@stylistic/jsx-curly-newline": "error",
      // "@stylistic/jsx-curly-spacing": "error",
      // "@stylistic/jsx-equals-spacing": "error",
      // "@stylistic/jsx-first-prop-new-line": "error",
      // "@stylistic/jsx-function-call-newline": "error",
      // "@stylistic/jsx-indent": "error",
      // "@stylistic/jsx-indent-props": "error",
      // "@stylistic/jsx-max-props-per-line": "error",
      // "@stylistic/jsx-newline": "error",
      // "@stylistic/jsx-one-expression-per-line": "error",
      // "@stylistic/jsx-pascal-case": "error",
      // "@stylistic/jsx-props-no-multi-spaces": "error",
      // "@stylistic/jsx-quotes": "error",
      // "@stylistic/jsx-self-closing-comp": "error",
      // "@stylistic/jsx-sort-props": "error",
      // "@stylistic/jsx-tag-spacing": "error",
      // "@stylistic/jsx-wrap-multilines": "error",
      "@stylistic/key-spacing": "error",
      "@stylistic/keyword-spacing": "error",
      // "@stylistic/line-comment-position": "error", // no
      // "@stylistic/linebreak-style": "error", // We get gobs of LF/CRLF errors, but Git handles that on Windows
      // "@stylistic/lines-around-comment": "error", // no
      // "@stylistic/lines-between-class-members": "error", // no
      // "@stylistic/max-len": "error", // no
      "@stylistic/max-statements-per-line": "error",
      // "@stylistic/member-delimiter-style": ["error"], // no
      // "@stylistic/multiline-comment-style": "error", // no
      // "@stylistic/multiline-ternary": "error", // no
      "@stylistic/new-parens": "error",
      // "@stylistic/newline-per-chained-call": "error", // not for now, probably revisit later
      "@stylistic/no-confusing-arrow": "error",
      // "@stylistic/no-extra-parens": "error", // no
      "@stylistic/no-extra-semi": "error",
      "@stylistic/no-floating-decimal": "error",
      // "@stylistic/no-mixed-operators": "error", // Not for now, revisit later
      "@stylistic/no-mixed-spaces-and-tabs": "error",
      "@stylistic/no-multi-spaces": "error",
      "@stylistic/no-multiple-empty-lines": "error",
      "@stylistic/no-tabs": "error",
      "@stylistic/no-trailing-spaces": "error",
      "@stylistic/no-whitespace-before-property": "error",
      "@stylistic/nonblock-statement-body-position": "error",
      "@stylistic/object-curly-newline": "error",
      "@stylistic/object-curly-spacing": ["error", "always"],
      // "@stylistic/object-property-newline": "error",
      "@stylistic/one-var-declaration-per-line": "error",
      "@stylistic/operator-linebreak": ["error", "before"],
      // "@stylistic/padded-blocks": "error", ?no
      "@stylistic/padding-line-between-statements": "error",
      // "@stylistic/quote-props": "error", // no
      "@stylistic/quotes": ["error", "double", {
        avoidEscape: true,
        allowTemplateLiterals: "always",
      }],
      "@stylistic/rest-spread-spacing": "error",
      "@stylistic/semi": "error",
      "@stylistic/semi-spacing": "error",
      "@stylistic/semi-style": "error",
      "@stylistic/space-before-blocks": "error",
      "@stylistic/space-before-function-paren": ["error", {
        anonymous: "never",
        named: "never",
        asyncArrow: "always",
      }],
      "@stylistic/space-in-parens": "error",
      "@stylistic/space-infix-ops": "error",
      "@stylistic/space-unary-ops": "error",
      "@stylistic/spaced-comment": "error",
      "@stylistic/switch-colon-spacing": "error",
      "@stylistic/template-curly-spacing": "error",
      "@stylistic/template-tag-spacing": "error",
      "@stylistic/type-annotation-spacing": "error",
      "@stylistic/type-generic-spacing": "error",
      "@stylistic/type-named-tuple-spacing": "error",
      "@stylistic/wrap-iife": "error",
      "@stylistic/wrap-regex": "error",
      "@stylistic/yield-star-spacing": "error",

    },
  },
);
