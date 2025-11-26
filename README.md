# Experiment to implement a collaborative editor for educational materials

This is a prototype for a collaborative editor for educational materials using CRDTs with [Yjs](https://yjs.dev/). It was developed for and at the [2. HackathOERn in Weimar](https://edu-sharing-network.org/projekt-hackathoern/) in which software solutions for a better OER infrastructure were developed ([OER = Open educational resources](https://en.wikipedia.org/wiki/Open_educational_resources)).

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

## Screencast of the prototype

https://github.com/user-attachments/assets/45047a54-6135-477b-af81-a47db190a106

## Maintenance

Update dependencies:

```bash
bun update
```

## Possible improvements

- When a non editable entry is selected => focus it.
- Move `rootKey` to the state.
- Add a RootNode
