import test from "node:test";
import assert from "node:assert/strict";
import { compile } from "sass";
import postcss from "postcss";

const styles = postcss.parse(compile("src/styles/main.scss").css + compile("src/styles/ui.scss").css);

for (const theme of ["dark", "light"]) {
  test(`${theme} library aliases and status text retain contrast against actual NEXUS surfaces`, () => {
    const tokens = {};
    styles.walkRules((rule) => {
      if (rule.selector === ":root" || (theme === "light" && rule.selector === ":root[data-theme=light]")) {
        rule.walkDecls((decl) => {
          if (decl.prop.startsWith("--")) tokens[decl.prop] = decl.value;
        });
      }
    });
    function resolve(name) {
      assert.ok(tokens[name], `Missing ${name}`);
      return tokens[name].replace(/var\((--[\w-]+)\)/g, (_, reference) => resolve(reference));
    }
    function luminance(name) {
      const rgb = resolve(name)
        .slice(1)
        .match(/../g)
        .map((value) => parseInt(value, 16) / 255)
        .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    }
    for (const [foreground, background, minimum] of [
      ["--ui-text", "--ui-bg", 4.5],
      ["--ui-text-muted", "--ui-bg", 4.5],
      ["--input-fg", "--input-bg", 4.5],
      ["--selected-fg", "--selected-bg", 4.5],
      ["--success", "--card-bg", 4.5],
      ["--accent-text", "--card-bg", 4.5],
      ["--muted", "--card-bg", 4.5],
      ["--focus-ring", "--ui-bg", 3],
      ["--focus-ring", "--selected-bg", 3],
    ]) {
      const a = luminance(foreground),
        b = luminance(background);
      assert.ok((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= minimum, `${foreground} on ${background}`);
    }
  });
}
