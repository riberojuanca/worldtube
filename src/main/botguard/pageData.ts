import { parse, type Expression, type Node } from 'acorn'
import { simple } from 'acorn-walk'

type Data = null | string | boolean | number | Data[] | { [key: string]: Data }

function literalData(node: Node): Data {
  const expression = node as Expression
  switch (expression.type) {
    case 'Literal':
      if (expression.value === null || ['string', 'boolean', 'number'].includes(typeof expression.value)) {
        return expression.value as null | string | boolean | number
      }
      break
    case 'ArrayExpression':
      return expression.elements.map((item) => {
        if (!item) return null
        return literalData(item)
      })
    case 'ObjectExpression':
      return Object.fromEntries(expression.properties.map((property) => {
        if (property.type !== 'Property' || property.computed || property.method || property.kind !== 'init') {
          throw new Error('Non-data property in YouTube page configuration')
        }
        const key = property.key.type === 'Identifier' ? property.key.name : literalData(property.key)
        if (typeof key !== 'string' && typeof key !== 'number') throw new Error('Invalid page data key')
        return [String(key), literalData(property.value)]
      }))
    case 'UnaryExpression': {
      const value = literalData(expression.argument)
      if (typeof value === 'number' && expression.operator === '-') return -value
      if (typeof value === 'number' && expression.operator === '+') return value
      break
    }
  }
  throw new Error(`Unsupported executable expression in page data: ${node.type}`)
}

function memberPath(expression: Expression): string | null {
  if (expression.type === 'Identifier') return expression.name
  if (expression.type !== 'MemberExpression' || expression.object.type === 'Super') return null
  const parent = memberPath(expression.object)
  const property = expression.computed && expression.property.type === 'Literal' ? expression.property.value :
    !expression.computed && expression.property.type === 'Identifier' ? expression.property.name : null
  return parent && typeof property === 'string' ? `${parent}.${property}` : null
}

export function extractYouTubePageData(html: string): { config: Record<string, Data>; attestation: Record<string, Data> } {
  // DOMParser keeps page scripts inert. Acorn reads call arguments as data;
  // neither the downloaded page nor its configuration is evaluated as code.
  const document = new DOMParser().parseFromString(html, 'text/html')
  const config: Record<string, Data> = Object.create(null)
  let attestation: Record<string, Data> | null = null
  for (const script of Array.from(document.querySelectorAll('script:not([src])'))) {
    const source = script.textContent ?? ''
    if (!source.includes('ytcfg') && !source.includes('ytAtN')) continue
    let program: ReturnType<typeof parse>
    try {
      program = parse(source, { ecmaVersion: 'latest', sourceType: script.type === 'module' ? 'module' : 'script' })
    } catch {
      // Unrelated inline code may use unsupported syntax. Required data still
      // has to be found and validated below; no regex/eval fallback is used.
      continue
    }
    simple(program, {
      CallExpression(call) {
        if (call.callee.type === 'Super') return
        const path = memberPath(call.callee)
        const isConfig = path === 'ytcfg.set' || path === 'window.ytcfg.set'
        const isAttestation = path === 'window.ytAtN' || path === 'ytAtN'
        if ((!isConfig && !isAttestation) || call.arguments[0]?.type !== 'ObjectExpression') return
        const value = literalData(call.arguments[0])
        if (!value || typeof value !== 'object' || Array.isArray(value)) return
        if (isConfig) Object.assign(config, value)
        else attestation = value
      }
    })
  }
  if (!Object.keys(config).length) throw new Error('YouTube page has no supported configuration data')
  if (!attestation) throw new Error('YouTube page has no supported attestation data')
  return { config, attestation }
}
