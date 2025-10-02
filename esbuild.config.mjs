import esbuild from "esbuild";

const watch = process.argv.includes("--watch");

esbuild.build({
  entryPoints: ["src/main.ts"],
  outfile: "main.js",
  bundle: true,
  platform: "browser",
  format: "cjs",
  external: ["obsidian"],
  sourcemap: watch ? "inline" : false,
  minify: !watch,
  logLevel: "info",
  watch: watch && {
    onRebuild(err) {
      if (err) console.error("⚠️ Rebuild failed:", err);
      else console.log("✅ Rebuilt");
    }
  }
}).then(() => {
  console.log(watch ? "👀 Watching…" : "✅ Built");
});
