# Experiment to implement a simple editor with a plugin system

## Setup

1. Clone the repository
2. Install the dependencies via `bun install`

## Get started

Start the local signalling server so that the peers can connect to each other:

```bash
./start_server.sh
```

Start the dev server:

```bash
bun dev
```

## Maintenance

Update dependencies:

```bash
bun update
```

## Possible improvements

- When a non editable entry is selected => focus it.
- Move `rootKey` to the state.
- Add a RootNode
