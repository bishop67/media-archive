import { around } from "monkey-around";
import { Notice, Plugin, TAbstractFile, TFile, Vault, debounce } from "obsidian";
import { DEFAULT_SETTINGS, MediaArchiveSettingTab, MediaArchiveSettings, folderProblem } from "./settings";
const MEDIA = /\.(png|jpe?g|gif|webp|svg|bmp|avif|heic|mp4|webm|mov|mkv|ogv|mp3|wav|m4a|ogg|flac|3gp|pdf)$/i;
// A freshly pasted image exists for a moment before the note links to it.
const GRACE_MS = 60 * 1000;

interface CanvasData {
  nodes?: { type?: string; file?: string }[];
}

interface Move {
  file: TFile;
  to: string;
}

const inFolder = (file: TAbstractFile, folder: string) => file.path.startsWith(folder + "/");

export default class MediaArchive extends Plugin {
  settings: MediaArchiveSettings = { ...DEFAULT_SETTINGS };
  private sorting = false;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new MediaArchiveSettingTab(this.app, this));
    this.patchDelete();
    this.addCommand({ id: "sort-media", name: "Sort media by usage now", callback: () => void this.sort(true) });

    const queueSort = debounce(() => void this.sort(false), 10 * 1000, true);
    this.app.workspace.onLayoutReady(() => {
      this.registerEvent(this.app.metadataCache.on("resolved", queueSort));
      this.registerInterval(window.setInterval(() => void this.sort(false), 5 * 60 * 1000));
      queueSort();
    });
  }

  async loadSettings() {
    const saved = (await this.loadData()) as Partial<MediaArchiveSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...saved };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private get uploads() {
    return this.settings.uploadsFolder;
  }

  private get archive() {
    return this.settings.archiveFolder;
  }

  // Deleting media outside the archive folder archives it, unless a note still uses it.
  // Deleting from the archive folder deletes for real.
  private patchDelete() {
    const handle = async (file: TAbstractFile, fallback: () => Promise<void>) => {
      if (!(file instanceof TFile) || !MEDIA.test(file.name) || inFolder(file, this.archive)) return fallback();
      if ((await this.usedPaths()).has(file.path)) {
        new Notice(`${file.name} is still used in a note, so it stays. Remove it from the note and it archives itself.`);
        return;
      }
      await this.moveTo(file, this.archive);
      new Notice(`Archived ${file.name}`);
    };
    // around() chains with other plugins' patches and removes only ours on unload.
    this.register(
      around(this.app.vault, {
        trash: (next: Vault["trash"]) =>
          function (this: Vault, file: TAbstractFile, system: boolean) {
            return handle(file, () => next.call(this, file, system));
          },
        delete: (next: Vault["delete"]) =>
          function (this: Vault, file: TAbstractFile, force?: boolean) {
            return handle(file, () => next.call(this, file, force));
          },
      })
    );
  }

  private async usedPaths(): Promise<Set<string>> {
    const { vault, metadataCache } = this.app;
    const used = new Set<string>();
    for (const dests of Object.values(metadataCache.resolvedLinks)) {
      for (const dest in dests) used.add(dest);
    }

    const media = vault.getFiles().filter((f) => MEDIA.test(f.name));
    const scan = (value: unknown): void => {
      if (typeof value === "string") {
        for (const f of media) if (value.includes(f.name)) used.add(f.path);
      } else if (value && typeof value === "object") {
        Object.values(value).forEach(scan);
      }
    };
    for (const note of vault.getMarkdownFiles()) scan(metadataCache.getFileCache(note)?.frontmatter);

    for (const canvas of vault.getFiles().filter((f) => f.extension === "canvas")) {
      try {
        const data = JSON.parse(await vault.cachedRead(canvas)) as CanvasData;
        for (const node of data.nodes ?? []) {
          if (node.type === "file" && node.file) used.add(node.file);
        }
      } catch {
        // unreadable canvas: skip
      }
    }
    return used;
  }

  private async plan(): Promise<Move[]> {
    const used = await this.usedPaths();
    const now = Date.now();
    const moves: Move[] = [];
    for (const file of this.app.vault.getFiles()) {
      if (!MEDIA.test(file.name)) continue;
      if (inFolder(file, this.uploads) && !used.has(file.path) && now - file.stat.ctime > GRACE_MS) {
        moves.push({ file, to: this.archive });
      } else if (inFolder(file, this.archive) && used.has(file.path)) {
        moves.push({ file, to: this.uploads });
      }
    }
    return moves;
  }

  private async sort(manual: boolean) {
    if (this.sorting) return;
    // A bad folder pair (e.g. edited by hand in data.json) would shuffle files back and forth.
    const problem = folderProblem(this.uploads, this.archive);
    if (problem) {
      if (manual) new Notice(`Media Archive: ${problem} Check the plugin settings.`);
      return;
    }
    this.sorting = true;
    try {
      const moves = await this.plan();
      for (const { file, to } of moves) await this.moveTo(file, to);
      const archived = moves.filter((m) => m.to === this.archive).length;
      const restored = moves.length - archived;
      if (moves.length || manual) new Notice(`Media: ${archived} archived, ${restored} back in ${this.uploads}`);
    } finally {
      this.sorting = false;
    }
  }

  private async moveTo(file: TFile, folder: string) {
    const vault = this.app.vault;
    if (!vault.getAbstractFileByPath(folder)) await vault.createFolder(folder);
    let target = `${folder}/${file.name}`;
    for (let n = 1; vault.getAbstractFileByPath(target); n++) {
      target = `${folder}/${file.basename} (${n}).${file.extension}`;
    }
    await this.app.fileManager.renameFile(file, target);
  }
}
