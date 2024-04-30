# deno-types

due to the lack of properly packaged Deno types for `tsc`, this repository tries to fill that gap
between the node.js ecosystem and the Deno runtime.

the package is updated automatically in ci, and should be up-to-date with the latest Deno release version.
if you notice something is missing, feel free to open an issue or a pull request.

## installation

the recommended way to install this is to install it under `@types/deno` alias,
by putting the following in your `package.json`:

```json
{
    "devDependencies": {
        "@types/deno": "npm:@teidesu/deno-types@latest"
    }
}
```

this way you can reference the types in your `tsconfig.json` like this (see below for more info):

```json
{
    "compilerOptions": {
        "types": ["deno/ns"]
    }
}
```

(without the above, you would need to put `@teidesu/deno-types` instead of `deno`)

## usage

generally, there are 2 ways to use this repository – either using
pre-merged types, or referencing all bits and pieces manually.

### pre-merged types

we generate 3 different flavors of pre-merged types:

| flavor          | description                                                            | conflicts                                               |
| --------------- | ---------------------------------------------------------------------- | ------------------------------------------------------- |
| `ns`            | only the `Deno` namespace, without any other types                     | none                                                    |
| `full`          | all Deno-specific APIs that are not available in core TypeScript types | `lib.dom.d.ts`, partially `@types/node`, `ns` flavor    |
| `free-standing` | `full`, but linked towards Deno's own builtin libs                     | overrides default types, `"noLib": true` should be used |

for most use-cases of mixing Node.js and Deno code, the `ns` flavor is the best choice, as it
the least amount of conflicts and links towards `tsc` built-in types. however it should be noted that
`ns` *may* lag behind some features, as it is only automatically updated to a certain extent.

to use a flavor, you can reference it in your `tsconfig.json` like this:

```json
{
    "compilerOptions": {
        "types": ["deno/ns"]
    }
}
```

or using the `/// <reference types="deno/ns" />` directive in your TypeScript files.

### manual types

you can also reference the needed types manually. for a list of all available types,
the best way is to just look around in the installation directory (e.g. `node_modules/@types/deno`),
since the structure may change over time. for example, for Deno's `fetch` API, you would use the following:

```ts
// this one links towards typescript's built-in libs
/// <reference types="deno/ext_tslib/lib.deno.fetch" />

// this will link towards Deno's own libs
/// <reference types="deno/ext/lib.deno.fetch" />
```

## running the script

```bash
bun install
bun run src/main.ts --ref main
```

## license

this repository itself is licensed under MIT license.

the generated packages are licensed under the license stated at the beginning of each file,
as some files are taken from the TypeScript repository (Apache-2.0) and some are taken from
the Deno repository (MIT).
