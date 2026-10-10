import { App, FrontmatterLinkCache, ReferenceCache, TFile, getLinkpath } from "obsidian";

export const HTML_SRC = /<(?:img|video|audio|source|embed|iframe)\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi;

// Resolves an HTML src the way a link would be: URL-decoded, vault- or note-relative.
export function resolveSrc(app: App, src: string, sourcePath: string) {
  let path = src;
  try {
    path = decodeURIComponent(src);
  } catch {
    // not URL-encoded
  }
  return app.metadataCache.getFirstLinkpathDest(path.replace(/^\.?\//, ""), sourcePath);
}

// Swaps the path in a wikilink, markdown link or embed, keeping its alias, heading and syntax.
function retarget(original: string, path: string) {
  if (original.includes("](")) {
    return original.replace(/(\]\(\s*<?)[^)>#]+/, (_, lead: string) => lead + (lead.endsWith("<") ? path : encodeURI(path)));
  }
  return original.replace(/^(!?\[\[)[^|\]#]*/, (_, lead: string) => lead + path);
}

// Finds every reference to `file` (links, embeds, frontmatter links, HTML src, canvas cards) and returns
// a function that points them all at another file. The plugin moves files with this instead of
// fileManager.renameFile, which asks "Update links?" when automatic link updates are off and would
// stall a background sort until someone answers.
export async function collectRefs(app: App, file: TFile) {
  const { vault, metadataCache } = app;
  const hits = (link: string, source: string) => metadataCache.getFirstLinkpathDest(getLinkpath(link), source) === file;
  const notes: { note: TFile; body: ReferenceCache[]; fm: FrontmatterLinkCache[]; srcs: Set<string> }[] = [];
  for (const note of vault.getMarkdownFiles()) {
    const cache = metadataCache.getFileCache(note);
    const body = [...(cache?.links ?? []), ...(cache?.embeds ?? [])].filter((r) => hits(r.link, note.path));
    const fm = (cache?.frontmatterLinks ?? []).filter((r) => hits(r.link, note.path));
    const srcs = new Set<string>();
    const text = await vault.cachedRead(note);
    if (text.includes("src")) {
      for (const [, src] of text.matchAll(HTML_SRC)) if (resolveSrc(app, src, note.path) === file) srcs.add(src);
    }
    if (body.length || fm.length || srcs.size) notes.push({ note, body, fm, srcs });
  }
  const oldPath = file.path;
  const canvases: TFile[] = [];
  for (const canvas of vault.getFiles().filter((f) => f.extension === "canvas")) {
    if ((await vault.cachedRead(canvas)).includes(JSON.stringify(oldPath))) canvases.push(canvas);
  }

  return async (target: TFile) => {
    for (const { note, body, fm, srcs } of notes) {
      const link = metadataCache.fileToLinktext(target, note.path, false);
      const src = (old: string) => (old.includes("%") ? encodeURI(target.path) : target.path);
      if (body.length || srcs.size) {
        await vault.process(note, (text) => {
          // Last first, so earlier offsets stay valid. Skip any ref the note no longer matches.
          for (const r of [...body].sort((a, b) => b.position.start.offset - a.position.start.offset)) {
            const { start, end } = r.position;
            if (text.slice(start.offset, end.offset) !== r.original) continue;
            text = text.slice(0, start.offset) + retarget(r.original, link) + text.slice(end.offset);
          }
          return srcs.size ? text.replace(HTML_SRC, (m, old: string) => (srcs.has(old) ? m.replace(old, src(old)) : m)) : text;
        });
      }
      if (fm.length) {
        const fix = (v: unknown): unknown =>
          typeof v === "string"
            ? fm.reduce((s, r) => s.split(r.original).join(retarget(r.original, link)), v)
            : Array.isArray(v)
              ? v.map(fix)
              : v;
        await app.fileManager.processFrontMatter(note, (data: Record<string, unknown>) => {
          for (const key of Object.keys(data)) data[key] = fix(data[key]);
        });
      }
    }
    for (const canvas of canvases) {
      await vault.process(canvas, (text) => {
        const data = JSON.parse(text) as { nodes?: { file?: string }[] };
        for (const node of data.nodes ?? []) if (node.file === oldPath) node.file = target.path;
        return JSON.stringify(data, null, "\t");
      });
    }
  };
}
