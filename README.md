# Rsbuild template repository

This is a template repository for `rsbuild` with `React` and `TypeScript`. It uses `bun` instead of Node.js and `biome` instead of `prettier / eslint` for better performance.

## Start a new project from this template

1. Copy / Fork / Clone the repository
2. Change the license in the `LICENSE` file and in the `package.json` file
3. Update `assetPrefix` in `rsbuild.config.ts` to your repository name
4. Update `title` in `rsbuild.config.ts` to your project name
5. Install the dependencies via `bun install`
6. Update this `README.md` file

## Setup

1. Clone the repository
2. Install the dependencies via `bun install`

## Get started

Start the dev server:

```bash
bun dev
```

Build the app for production:

```bash
bun run build
```

Preview the production build locally:

```bash
bun preview
```

## Maintenance

Update dependencies:

```bash
bun update
```
