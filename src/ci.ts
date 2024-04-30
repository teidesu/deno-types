import process from 'node:process'
import { appendFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

import { generateNpmPackage } from './generator'
import { DENO_REPO, resolveGithubCommit } from './utils'

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
    version: latest,
})

execSync('npm publish --registry https://npm.tei.su --access public --tag latest -q', {
    stdio: 'inherit',
    cwd: 'out',
})
