// Source audit only: this does not execute scripts or inspect a browser/extension context.
import { readdir, readFile } from "node:fs/promises";
import { babelParse, parse as parseSfc } from "vue/compiler-sfc";

const origin = "http://127.0.0.1:5173";
function walk(node, visit) {
  if (!node || typeof node.type !== "string") return;
  visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit));
    else if (value && typeof value === "object") walk(value, visit);
  }
}
function scan(source, label) {
  const hits = [];
  const imports = [];
  const tree = babelParse(source, { sourceType: "unambiguous" });
  walk(tree, (node) => {
    if (
      ["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration", "ImportExpression"].includes(node.type) &&
      node.source?.type === "StringLiteral"
    )
      imports.push(node.source.value);
    if (node.type !== "CallExpression" && node.type !== "NewExpression") return;
    const name =
      node.callee.type === "Identifier"
        ? node.callee.name
        : node.callee.type === "MemberExpression"
          ? node.callee.property.name || node.callee.property.value
          : null;
    if (["eval", "Function"].includes(name))
      hits.push({ kind: "dynamic execution", file: label, line: node.loc.start.line });
    if (
      ["setTimeout", "setInterval"].includes(name) &&
      ["StringLiteral", "TemplateLiteral"].includes(node.arguments[0]?.type)
    ) {
      hits.push({ kind: "string timer", file: label, line: node.loc.start.line });
    }
    if (node.callee.type === "Import" && node.arguments[0]?.type === "StringLiteral")
      imports.push(node.arguments[0].value);
  });
  return { hits, imports };
}

const index = await fetch(`${origin}/`);
if (!index.ok) throw new Error(`Preview returned HTTP ${index.status}`);
const html = await index.text();
const metaPolicy = html.match(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/i)?.[0] ?? null;
const queue = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map((match) => match[1]);
const visited = new Set();
const hits = [];
let sourceFileCount = 0;
async function scanApplication(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await scanApplication(path);
    else if (/\.(js|vue)$/.test(entry.name)) {
      sourceFileCount += 1;
      const source = await readFile(path, "utf8");
      if (path.endsWith(".vue")) {
        const { descriptor, errors } = parseSfc(source);
        if (errors.length) throw new Error(`Invalid component: ${path}`);
        for (const script of [descriptor.script, descriptor.scriptSetup].filter(Boolean))
          hits.push(...scan(script.content, path).hits);
      } else hits.push(...scan(source, path).hits);
    }
  }
}
await scanApplication("src");
for (const match of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
  hits.push(...scan(match[1], "index.html inline script").hits);
}
while (queue.length) {
  const path = queue.shift();
  const url = new URL(path, origin);
  if (url.origin !== origin || visited.has(url.href)) continue;
  visited.add(url.href);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  const source = await response.text();
  const result = scan(source, `${url.pathname}${url.search}`);
  hits.push(...result.hits);
  // Parse real import nodes, excluding examples inside Vue's diagnostic strings.
  // Source maps and extension scripts are outside this audit.
  for (const specifier of result.imports) {
    if (specifier.startsWith("/") || specifier.startsWith(".")) queue.push(new URL(specifier, url).href);
  }
}
const productionFiles = (await readdir("dist/assets")).filter((name) => name.endsWith(".js"));
for (const file of productionFiles)
  hits.push(...scan(await readFile(`dist/assets/${file}`, "utf8"), `dist/assets/${file}`).hits);
console.log(
  JSON.stringify(
    {
      httpStatus: index.status,
      cspHeader: index.headers.get("content-security-policy"),
      cspReportOnlyHeader: index.headers.get("content-security-policy-report-only"),
      metaPolicy,
      sourceFileCount,
      devModuleCount: visited.size,
      productionFiles,
      dynamicExecutionMatches: hits,
      devModules: [...visited].map((url) => url.replace(origin, "")),
    },
    null,
    2,
  ),
);
if (hits.length) process.exitCode = 1;
