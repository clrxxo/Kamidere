# Kamidere

Kamidere is the new public-facing identity of this Discord client mod fork. It keeps the Vencord-based patching model and the large built-in plugin surface from this repository, while shipping a separate name, visual identity, and web artifacts.

## Highlights

- Desktop and web builds live in the same workspace.
- The project includes a large built-in plugin catalog plus user plugin support.
- QuickCSS, themes, updater tooling, backup/restore, and cloud sync remain available.

## Development

Install dependencies:

```shell
pnpm install --frozen-lockfile
```

Build the desktop target:

```shell
pnpm build
```

Build the web target:

```shell
pnpm buildWeb
```

Run the desktop injector flow:

```shell
pnpm inject
```

## Output Names

- Userscript: `dist/Kamidere.user.js`
- Browser extension assets: `dist/Kamidere.js` and `dist/Kamidere.css`
- Desktop bundle: `dist/desktop`

## Notes

- Some internal `Vencord` and legacy `equicord_*` identifiers still exist for compatibility and migration.
- Discord is a trademark of Discord Inc. This repository is not affiliated with or endorsed by Discord.
