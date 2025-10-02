import esbuild from "esbuild";

const watch = process.argv.includes("--watch");

const buildOptions = {
  entryPoints: ["src/main.ts"],
  outfile: "main.js",
  bundle: true,
  platform: "browser",
  format: "cjs",
  external: ["obsidian"],
  sourcemap: watch ? "inline" : false,
  minify: !watch,
  logLevel: "info"
};

if (watch) {
  buildOptions.watch = {
    onRebuild(err) {
      if (err) console.error("⚠️ Rebuild failed:", err);
      else console.log("✅ Rebuilt");
    }
  };
}

esbuild.build(buildOptions).then(() => {
  console.log(watch ? "👀 Watching…" : "✅ Built");
});
