import process from 'node:process'
import { appendFileSync, cpSync } from 'node:fs'
import { execSync } from 'node:child_process'

import { generateNpmPackage } from './generator'
import { DENO_REPO, downloadFile, resolveGithubCommit } from './utils'

async function fetchLatestDenoVersion() {
    const res = await fetch('https://dl.deno.land/release-latest.txt')
    if (!res.ok) {
        throw new Error(`Failed to fetch latest version: ${res.statusText}`)
    }
    const version = await res.text()
    return version.trim()
}

const latest = await fetchLatestDenoVersion()
const lastPublished = process.env.LAST_PUBLISHED_VERSION!

console.log('Latest version:', latest)
console.log('Last published version:', lastPublished)

if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `latest=${latest}\n`)
}

if (latest === lastPublished) {
    console.log('The latest version is already published')
    process.exit(0)
}

await generateNpmPackage({
    commit: await resolveGithubCommit(DENO_REPO, latest),
    outDir: 'out',
    version: latest.replace(/^v/, ''),
})

cpSync('README.md', 'out/README.md')
cpSync('LICENSE', 'out/LICENSE')
await downloadFile('https://raw.githubusercontent.com/microsoft/TypeScript/main/LICENSE.txt', 'out/LICENSE.typescript.txt')
await downloadFile('https://raw.githubusercontent.com/denoland/deno/main/LICENSE.md', 'out/LICENSE.deno.md')

execSync('npm publish --registry https://npm.tei.su --access public --tag latest -q', {
    stdio: 'inherit',
    cwd: 'out',
})
