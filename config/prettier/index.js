module.exports = {
  plugins: [
    require.resolve("prettier-plugin-solidity"),
    require.resolve("prettier-plugin-packagejson"),
  ],
  overrides: [
    {
      files: "*.sol",
      options: {
        bracketSpacing: true,
        printWidth: 120,
        tabWidth: 4,
        useTabs: false,
        singleQuote: false,
      },
    },
    {
      files: ["*.ts", "*.mts"],
      options: {
        printWidth: 120,
        semi: false,
        singleQuote: true,
        tabWidth: 4,
        useTabs: false,
        trailingComma: "es5",
      },
    },
    {
      files: "*.js",
      options: {
        printWidth: 120,
        semi: true,
        singleQuote: true,
        tabWidth: 4,
        useTabs: false,
        trailingComma: "es5",
      },
    },
  ],
};
