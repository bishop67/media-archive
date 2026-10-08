import { AbstractInputSuggest, App, PluginSettingTab, Setting, TFolder, normalizePath } from "obsidian";
import type MediaArchive from "./main";

export interface MediaArchiveSettings {
  uploadsFolder: string;
  archiveFolder: string;
}

export const DEFAULT_SETTINGS: MediaArchiveSettings = {
  uploadsFolder: "Media/Uploads",
  archiveFolder: "Media/Archive",
};

type FolderKey = keyof MediaArchiveSettings;

const cleanFolder = (value: string) => normalizePath(value.trim()).replace(/^\/+|\/+$/g, "");

const contains = (outer: string, inner: string) => inner === outer || inner.startsWith(outer + "/");

// Returns why a pair of folders can't work together, or null if they can.
export function folderProblem(uploads: string, archive: string): string | null {
  if (!uploads || !archive) return "Both folders need a path.";
  if (uploads === archive) return "The uploads and archive folders must be different.";
  if (contains(uploads, archive) || contains(archive, uploads)) return "One folder can't be inside the other.";
  return null;
}

class FolderSuggest extends AbstractInputSuggest<TFolder> {
  constructor(app: App, private inputEl: HTMLInputElement) {
    super(app, inputEl);
  }

  getSuggestions(query: string): TFolder[] {
    const q = query.toLowerCase();
    return this.app.vault.getAllFolders().filter((f) => f.path.toLowerCase().includes(q));
  }

  renderSuggestion(folder: TFolder, el: HTMLElement) {
    el.setText(folder.path);
  }

  selectSuggestion(folder: TFolder) {
    this.setValue(folder.path);
    this.inputEl.dispatchEvent(new Event("input"));
    this.close();
  }
}

export class MediaArchiveSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: MediaArchive) {
    super(app, plugin);
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    const error = createDiv({ cls: "media-archive-settings-error" });
    const folder = (key: FolderKey, name: string, desc: string) =>
      new Setting(containerEl)
        .setName(name)
        .setDesc(desc)
        .addText((text) => {
          new FolderSuggest(this.app, text.inputEl);
          text
            .setPlaceholder(DEFAULT_SETTINGS[key])
            .setValue(this.plugin.settings[key])
            .onChange(async (value) => {
              const next = { ...this.plugin.settings, [key]: cleanFolder(value) || DEFAULT_SETTINGS[key] };
              const problem = folderProblem(next.uploadsFolder, next.archiveFolder);
              error.setText(problem ?? "");
              if (problem) return;
              this.plugin.settings = next;
              await this.plugin.saveSettings();
            });
        });

    folder(
      "uploadsFolder",
      "Uploads folder",
      "Media that notes use. Unused files here are archived automatically, and archived files that are used again come back here."
    );
    folder(
      "archiveFolder",
      "Archive folder",
      "Deleted and unused media goes here. Deleting a file from this folder removes it for real."
    );
    containerEl.appendChild(error);

    new Setting(containerEl).setDesc(
      "Changing a folder doesn't move files that are already in the old one. Creates the folder if it doesn't exist yet."
    );
  }
}
