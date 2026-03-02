import { readFile, writeFile, mkdir, rm, cp } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { log } from "./utils/log";

function stripOverlayScript(html: string): string {
  // Remove <script data-aceto-overlay>...</script>
  return html.replace(/<script\s+data-aceto-overlay[^>]*>[\s\S]*?<\/script>\s*/gi, "");
}

function stripDataMid(html: string): string {
  return html.replace(/\s+data-mid="[^"]*"/g, "");
}


function stripTailwindCdn(html: string): string {
  // Remove Tailwind CDN script tag
  return html.replace(
    /\s*<script\s+src="https:\/\/cdn\.jsdelivr\.net\/npm\/@tailwindcss\/browser@4[^"]*"><\/script>\s*/gi,
    "\n",
  );
}

function insertStylesheet(html: string, href: string): string {
  const match = html.match(/<\/head>/i);
  if (!match || match.index === undefined) return html;
  const linkTag = `  <link href="${href}" rel="stylesheet">\n`;
  return html.slice(0, match.index) + linkTag + html.slice(match.index);
}

export async function exportProject(
  projectDir: string,
  options: { production?: boolean } = {},
) {
  const distDir = path.join(projectDir, "dist");

  // Clean/create dist
  if (existsSync(distDir)) {
    await rm(distDir, { recursive: true });
  }
  await mkdir(distDir, { recursive: true });

  // Find all HTML files
  const glob = new Bun.Glob("**/*.html");
  const htmlFiles: string[] = [];
  for (const file of glob.scanSync({ cwd: projectDir })) {
    // Skip dist/ and node_modules/
    if (file.startsWith("dist/") || file.startsWith("node_modules/")) continue;
    htmlFiles.push(file);
  }

  // Process HTML files
  for (const file of htmlFiles) {
    const srcPath = path.join(projectDir, file);
    const destPath = path.join(distDir, file);

    await mkdir(path.dirname(destPath), { recursive: true });

    let html = await readFile(srcPath, "utf-8");
    html = stripOverlayScript(html);
    html = stripDataMid(html);

    if (options.production) {
      html = stripTailwindCdn(html);
      html = insertStylesheet(html, "/styles.css");
    }

    await writeFile(destPath, html, "utf-8");
    log(`  Exported: ${file}`);
  }

  // Copy assets directory if it exists
  const assetsDir = path.join(projectDir, "assets");
  if (existsSync(assetsDir)) {
    await cp(assetsDir, path.join(distDir, "assets"), { recursive: true });
    log("  Copied: assets/");
  }

  // Production: run Tailwind CLI build
  if (options.production) {
    log("  Building Tailwind CSS...");
    const proc = Bun.spawn(
      ["bunx", "tailwindcss", "-o", path.join(distDir, "styles.css"), "--minify"],
      {
        cwd: projectDir,
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      log(`  Warning: Tailwind build failed (exit ${exitCode}): ${stderr.trim()}`);
    } else {
      log("  Built: styles.css");
    }
  }

  log(`\n  Exported ${htmlFiles.length} page(s) to dist/`);
}
