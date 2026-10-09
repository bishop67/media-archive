import { App, PluginSettingTab, SettingDefinitionItem, normalizePath } from "obsidian";
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

const cleanFolder = (key: FolderKey, value: string) =>
  normalizePath(value.trim()).replace(/^\/+|\/+$/g, "") || DEFAULT_SETTINGS[key];

const contains = (outer: string, inner: string) => inner === outer || inner.startsWith(outer + "/");

// Returns why a pair of folders can't work together, or null if they can.
export function folderProblem(uploads: string, archive: string): string | null {
  if (!uploads || !archive) return "Both folders need a path.";
  if (uploads === archive) return "The uploads and archive folders must be different.";
  if (contains(uploads, archive) || contains(archive, uploads)) return "One folder can't be inside the other.";
  return null;
}

export class MediaArchiveSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: MediaArchive) {
    super(app, plugin);
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const folder = (key: FolderKey, name: string, desc: string) =>
      ({
        name,
        desc,
        control: {
          type: "folder",
          key,
          placeholder: DEFAULT_SETTINGS[key],
          validate: (value: string) => {
            const next = { ...this.plugin.settings, [key]: cleanFolder(key, value) };
            return folderProblem(next.uploadsFolder, next.archiveFolder) ?? undefined;
          },
        },
      }) as const;
    return [
      folder("uploadsFolder", "Uploads folder", "Unused media here is archived. Archived media that's used again comes back here."),
      folder("archiveFolder", "Archive folder", "Deleted and unused media goes here. Deleting from here removes it for real."),
    ];
  }

  async setControlValue(key: string, value: unknown) {
    this.plugin.settings[key as FolderKey] = cleanFolder(key as FolderKey, String(value));
    await this.plugin.saveSettings();
  }
}
