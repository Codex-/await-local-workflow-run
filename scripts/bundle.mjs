import chalk from "chalk";
import { build } from "esbuild";

(async () => {
  try {
    console.info(
      chalk.bold(`🚀 ${chalk.blueBright("await-local-workflow-run")} Build`)
    );

    await build({
      entryPoints: ["lib/main.js"],
      bundle: true,
      platform: "node",
      target: ["node16"],
      outfile: "dist/index.js",
      sourcemap: "external",
      treeShaking: true,
    });

    console.info(chalk.bold.green("✔ Bundled successfully!"));
  } catch (error) {
    console.error(`🧨 ${chalk.red.bold("Failed:")} ${error.message}`);
    console.debug(`📚 ${chalk.blueBright.bold("Stack:")} ${error.stack}`);
    process.exit(1);
  }
})();
