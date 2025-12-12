# mdcrty-packages

This repository contains a collection of reusable JavaScript and React packages published under the `@mdcrty` npm scope.

Each package is developed and released independently, but shares a common tooling and configuration baseline.

---

## Packages

### `@mdcrty/bees` 🐝

A performant, canvas-based animated bee swarm for React.

- Decorative background / ambient animation
- Full-page canvas rendering
- Cross-browser fixes (Chrome / Safari / Windows)
- Configurable density, timing, and layering

📦 npm: https://www.npmjs.com/package/@mdcrty/bees  
📖 Docs: [`packages/bees/README.md`](./packages/bees/README.md)

---

### `@mdcrty/digital-rain`

A Matrix-style “digital rain” animation component for React.

- Canvas-based rendering
- Optional static messages
- Designed for creative / visual experiments

📦 npm: https://www.npmjs.com/package/@mdcrty/digital-rain  
📖 Docs: [`packages/digital-rain/README.md`](./packages/digital-rain/README.md)

---

## Repository Structure

```
.
├─ packages/
│  ├─ bees/
│  └─ digital-rain/
├─ templates/
├─ tsconfig.base.json
├─ package.json
└─ LICENSE
```

- `packages/` — individually published npm packages
- `templates/` — internal templates for creating new packages
- `tsconfig.base.json` — shared TypeScript defaults
- Root `package.json` — workspace + tooling configuration

---

## Development

This is a workspace-based monorepo.

### Install dependencies

```bash
npm install
```

### Build all packages

```bash
npm run build
```

### Build a single package

```bash
cd packages/<package-name>
npm run build
```

Each package has its own README.md with usage instructions.

## Publishing

Packages are published independently from their respective directories under packages/.

```bash
cd packages/bees
npm publish
```
## License

MIT © mdcrty

See the root [LICENSE](./LICENSE)￼ file for details.