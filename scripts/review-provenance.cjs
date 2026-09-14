const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const ts = require('typescript')

const reference = path.resolve(process.argv[2] || '../freetube-audio-lab')
const minimum = 24

function files(root) {
  if (!fs.existsSync(root)) return []
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(root, entry.name)
    return entry.isDirectory() ? files(file) : entry.isFile() ? [file] : []
  })
}

function tokens(file, normalized) {
  const text = fs.readFileSync(file, 'utf8')
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, text)
  const result = []
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    const value = normalized && kind === ts.SyntaxKind.Identifier ? '<identifier>' : scanner.getTokenText()
    result.push({ value, offset: scanner.getTokenPos() })
  }
  return { file, text, tokens: result }
}

function compare(normalized) {
  const corpus = files(path.join(reference, 'src')).filter((file) => /\.(?:js|ts|tsx|vue)$/.test(file)).map((file) => tokens(file, normalized))
  const index = new Map()
  const key = (items, start) => items.slice(start, start + minimum).map((item) => item.value).join('\0')
  for (const entry of corpus) {
    for (let position = 0; position <= entry.tokens.length - minimum; position++) {
      const fingerprint = key(entry.tokens, position)
      const locations = index.get(fingerprint) ?? []
      if (locations.length < 12) locations.push({ entry, position })
      index.set(fingerprint, locations)
    }
  }
  const matches = []
  for (const file of [...files('src'), ...files('scripts')].filter((file) => /\.(?:ts|tsx|js|cjs|mjs)$/.test(file))) {
    const entry = tokens(file, normalized)
    let coveredUntil = -1
    for (let position = 0; position <= entry.tokens.length - minimum; position++) {
      if (position < coveredUntil) continue
      let best = null
      for (const candidate of index.get(key(entry.tokens, position)) ?? []) {
        let length = minimum
        while (entry.tokens[position + length] && candidate.entry.tokens[candidate.position + length] &&
          entry.tokens[position + length].value === candidate.entry.tokens[candidate.position + length].value) length++
        if (!best || length > best.length) best = { candidate, length }
      }
      if (!best) continue
      coveredUntil = position + best.length
      const start = entry.tokens[position].offset
      const end = entry.tokens[coveredUntil - 1].offset + entry.tokens[coveredUntil - 1].value.length
      const otherStart = best.candidate.entry.tokens[best.candidate.position].offset
      matches.push({ file, line: entry.text.slice(0, start).split('\n').length,
        reference: path.relative(reference, best.candidate.entry.file),
        referenceLine: best.candidate.entry.text.slice(0, otherStart).split('\n').length,
        tokens: best.length, snippet: entry.text.slice(start, Math.min(end, start + 500)) })
    }
  }
  return matches.sort((a, b) => b.tokens - a.tokens)
}

const digest = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const referenceAssets = new Map()
for (const file of [...files(path.join(reference, 'src')), ...files(path.join(reference, 'static')), ...files(path.join(reference, '_icons'))]) {
  if (!/\.(?:png|jpg|svg|woff2?|ttf|ico|icns|css)$/.test(file)) continue
  referenceAssets.set(digest(file), path.relative(reference, file))
}
const identicalAssets = [...files('src'), ...files('resources')].filter((file) => /\.(?:png|jpg|svg|woff2?|ttf|ico|icns|css)$/.test(file))
  .flatMap((file) => referenceAssets.has(digest(file)) ? [{ file, reference: referenceAssets.get(digest(file)) }] : [])

function regexLiterals(file) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const result = []
  function visit(node) {
    if (ts.isRegularExpressionLiteral(node)) {
      result.push({ expression: node.getText(source),
        line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return result
}

// The lexical scan does not disambiguate division from regex literals. Inspect
// regex AST nodes separately so short predicates do not disappear below the cutoff.
const referenceRegex = new Map()
for (const file of files(path.join(reference, 'src')).filter((file) => /\.(?:js|ts|tsx)$/.test(file))) {
  for (const literal of regexLiterals(file)) {
    const entries = referenceRegex.get(literal.expression) ?? []
    entries.push({ file: path.relative(reference, file), line: literal.line })
    referenceRegex.set(literal.expression, entries)
  }
}
const sharedRegex = files('src').filter((file) => /\.(?:js|ts|tsx)$/.test(file)).flatMap((file) =>
  regexLiterals(file).flatMap((literal) => referenceRegex.has(literal.expression)
    ? [{ file, ...literal, references: referenceRegex.get(literal.expression) }] : []))

const directDependencies = Object.entries({ ...require('../package.json').dependencies,
  ...require('../package.json').devDependencies }).map(([name, requested]) => {
  const manifest = path.join('node_modules', name, 'package.json')
  if (!fs.existsSync(manifest)) return { name, requested, installed: false }
  const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'))
  return { name, requested, version: pkg.version, license: pkg.license ?? null, repository: pkg.repository ?? null }
})

console.log(JSON.stringify({ reference, minimumTokenRun: minimum,
  warning: 'Candidate detection only: common syntax, third-party APIs and protocols can match. Absence of matches is not proof of independent authorship.',
  scope: 'Current src/scripts text and src/resources assets; reference src/static/_icons. Token scan includes Vue text, regex AST inspection excludes Vue. Direct dependency metadata only, not a transitive license clearance.',
  exact: compare(false), identifierNormalized: compare(true), sharedRegex, identicalAssets, directDependencies }, null, 2))
