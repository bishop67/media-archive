# Media Archive

Deleting media in Obsidian moves it to `Media/Archive` instead of the trash. Deleting it from the archive removes it for real.

It also sorts on its own: unused files in `Media/Uploads` move to the archive, and archived files a note uses again move back. New files get 60 seconds before they can be archived.

| <img src="docs/notices.png" alt="Archive notices" height="200"> | <img src="docs/explorer.png" alt="Media folders in the file explorer" height="200"> |
|:---:|:---:|
| Delete archives it, unless a note still uses it | Uploads and Archive folders |

- **Media:** images, video, audio, PDF.
- **Used** means linked or embedded in a note, named in frontmatter, or on a canvas.
- **Still in use?** Deleting does nothing and says so.
- **Settings:** the two folder paths. Point Obsidian's attachment folder at Uploads.
- **Command:** *Sort media by usage now.*

## Install

```sh
npm install && npm run build
```

Copy `main.js`, `manifest.json`, `styles.css` to `<vault>/.obsidian/plugins/media-archive/` and enable it.

To release: bump `manifest.json`, push a matching tag (`1.0.1`), publish the draft release.

MIT
