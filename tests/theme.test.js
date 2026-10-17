import test from "node:test";
import assert from "node:assert/strict";
import { compile } from "sass";
import postcss from "postcss";

// Audit the compiled theme contract with the existing Sass/Vite toolchain.
// This verifies color pairs, not browser painting or native dropdown behavior.
const styles = postcss.parse(compile("src/styles/main.scss").css);
const tokens = {};
styles.walkRules((rule) => {
  if ([":root", ":root[data-theme=light]"].includes(rule.selector)) {
    rule.walkDecls((declaration) => {
      if (declaration.prop.startsWith("--")) tokens[declaration.prop] = declaration.value;
    });
  }
});

function resolve(name, trail = []) {
  assert.ok(!trail.includes(name), `Circular theme token: ${name}`);
  assert.ok(tokens[name], `Missing theme token: ${name}`);
  return tokens[name].replace(/var\((--[\w-]+)\)/g, (_, referenced) => resolve(referenced, [...trail, name]));
}

function luminance(name) {
  const hex = resolve(name);
  assert.match(hex, /^#[\da-f]{6}$/i, `${name} must resolve to an opaque sRGB color`);
  const [r, g, b] = hex
    .slice(1)
    .match(/../g)
    .map((value) => parseInt(value, 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

function assertContrast(foreground, background, minimum) {
  const a = luminance(foreground);
  const b = luminance(background);
  const contrast = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  assert.ok(contrast >= minimum, `${foreground} on ${background}: ${contrast.toFixed(2)}:1; requires ${minimum}:1`);
}

test("light interaction text meets AA across semantic states and variants", () => {
  for (const background of ["--canvas", "--sidebar", "--surface", "--workspace-bg"]) {
    assertContrast("--interaction-fg", background, 4.5);
  }
  for (const [foreground, background] of [
    ["--interaction-hover-fg", "--interaction-hover-bg"],
    ["--interaction-pressed-fg", "--interaction-pressed-bg"],
    ["--selected-fg", "--selected-bg"],
    ["--control-fg", "--control-bg"],
    ["--input-fg", "--input-bg"],
    ["--input-placeholder", "--input-bg"],
    ["--error-text", "--input-bg"],
    ["--disabled-fg", "--disabled-bg"],
    ["--card-fg", "--card-bg"],
    ["--card-hover-fg", "--card-hover-bg"],
    ["--card-hover-fg", "--card-pressed-bg"],
    ["--muted", "--card-bg"],
    ["--muted", "--card-hover-bg"],
    ["--muted", "--card-pressed-bg"],
    ...["--primary-bg", "--primary-hover-bg", "--primary-pressed-bg"].map((bg) => ["--primary-fg", bg]),
    ...["--danger-bg", "--danger-hover-bg", "--danger-pressed-bg"].map((bg) => ["--danger-fg", bg]),
  ]) {
    assertContrast(foreground, background, 4.5);
  }
});

test("light focus, selected markers, and enabled control boundaries meet 3:1", () => {
  for (const background of [
    "--canvas",
    "--sidebar",
    "--surface",
    "--input-bg",
    "--workspace-bg",
    "--interaction-hover-bg",
    "--selected-bg",
  ]) {
    assertContrast("--focus-ring", background, 3);
  }
  assertContrast("--selected-indicator", "--selected-bg", 3);
  for (const background of ["--canvas", "--sidebar", "--surface", "--workspace-bg"]) {
    assertContrast("--control-border", background, 3);
  }
  assertContrast("--input-border", "--input-bg", 3);
  assertContrast("--input-hover-border", "--input-bg", 3);
  assertContrast("--error-border", "--input-bg", 3);
});
