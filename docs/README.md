# How to update this extension

This package is a drop-in replacement of [@hocuspocus/extension-redis](https://www.npmjs.com/package/@hocuspocus/extension-redis)
for [Valkey](https://valkey.io). To track new upstream releases, re-run the steps below.

- First, pack the latest published Redis extension:

```bash
npm pack @hocuspocus/extension-redis
```

- This produces a file like `hocuspocus-extension-redis-4.3.0.tgz`. Extract it:

```bash
tar -xzf hocuspocus-extension-redis-4.3.0.tgz
```

  You now have a `package` directory containing `src/`, `dist/` and `package.json`.

- Replace this repo's `src/` and `dist/` with the ones from `package/`.
  (The published `dist/` currently ships `hocuspocus-redis.{cjs,esm.js}`, their
  `.map` files and `index.d.ts`. Delete the old `dist/` first so stale files
  don't linger.)

- Replace each occurrence of `ioredis` with `iovalkey` in the `src` and `dist` directories, e.g.:

```bash
sed -i '' 's/ioredis/iovalkey/g' \
  src/Redis.ts src/index.ts \
  dist/hocuspocus-redis.cjs dist/hocuspocus-redis.cjs.map \
  dist/hocuspocus-redis.esm.js dist/hocuspocus-redis.esm.js.map \
  dist/index.d.ts
```

  (`sed -i ''` is the macOS form; on Linux use `sed -i`.) Only the lowercase
  package name `ioredis` is replaced — the `Redis` class, `RedisClient`, etc.
  intentionally keep their names.

- Take `package/package.json` as the base and apply the Valkey identity:

```jsonc
{
  "name": "hocuspocus-extension-valkey",
  "version": "<your version>",
  "description": "Scale Hocuspocus horizontally with Valkey",
  "homepage": "https://github.com/scraiber/hocuspocus-extension-valkey",
  "keywords": ["hocuspocus", "scraiber", "valkey", "yjs"],
  "license": "Apache-2.0",
  // ...
  "dependencies": {
    // keep @hocuspocus/common, @hocuspocus/server, @sesamecare-oss/redlock, kleur as upstream pins them
    // replace "ioredis" with "iovalkey"
    "iovalkey": "^0.3.3"
  }
  // upstream no longer ships devDependencies; drop any leftover @types/* and the
  // old uuid / lodash.debounce / redlock deps if present from an earlier version.
}
```

  Also point `types` and `exports.*.types` at `dist/index.d.ts` and
  `exports.source.import` at `./src/index.ts`, matching the upstream layout.

- Finally remove the `*.tgz` file and the extracted `package` directory.

> Note: since v4 of the upstream extension the lock is provided by
> [`@sesamecare-oss/redlock`](https://www.npmjs.com/package/@sesamecare-oss/redlock)
> (not the old `redlock` package) and `@hocuspocus/server` v4 introduced
> structured transaction origins, so this extension now requires
> `@hocuspocus/server`/`@hocuspocus/common` v4.
