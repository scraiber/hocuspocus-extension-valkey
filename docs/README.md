# How to update this extension


- First, you run

```bash
npm pack @hocuspocus/extension-redis
```

- Then we obtain a file like `hocuspocus-extension-redis-2.15.1.tgz` and we extract it via
    
```bash
tar -xzf hocuspocus-extension-redis-2.15.1.tgz
```

and we obtain a `package` directory. 

- Now we replace the `dist` and `src` and `package.json`. 

- In `package.json` we update the values from here

```json
{
    "name": "hocuspocus-extension-valkey",
    "version": "<your version>",
    "description": "Scale Hocuspocus horizontally with Valkey",
    "homepage": "https:/scraiber.com",
    "keywords": [
      "hocuspocus",
      "scraiber",
      "valkey",
      "yjs"
    ],
    "license": "Apache-2.0",
    
    ...

    "devDependencies": {
      # remove @types/ioredis
      "@types/lodash.debounce": "^4.0.9",
      "@types/redlock": "^4.0.7"
    },
    "dependencies": {
      ... 
      # replace ioredis with "iovalkey": "^0.3.1",
      ...
    },
    ...
  }
```

- Now replace each occuren0ce of `ioredis` with `iovalkey` in the `src` and `dist` directories. 
- Finally remove the `*.tgz` file and the `package` directory.
