import vm from 'node:vm'

/**
 * youtubei.js needs to run a snippet of YouTube's own (obfuscated,
 * third-party) player JavaScript to compute the signature/n-parameter
 * transform used to decipher stream URLs — without this, `Player.decipher()`
 * always throws ("you must provide your own JavaScript evaluator"), because
 * its default shim (src/platform/jsruntime/default.js in the package) is
 * just a stub that throws on purpose.
 *
 * The contract (there's no public type export for it, so this was read out
 * of youtubei.js's Player.js/JsExtractor.js): `data.output` is a JS program
 * that ends in a top-level `return` — i.e. it's meant to be run as a
 * function BODY, not a script — and `env`'s keys become that function's
 * parameter names, bound to its values.
 *
 * We run it inside a fresh Node `vm` context (a separate global object, no
 * `require`, `fs`, `child_process`, or access to this module's own scope)
 * rather than `new Function()`, which would execute with this process's full
 * Node/Electron privileges. `vm` isn't a hermetic sandbox, but it meaningfully
 * narrows what this third-party script can reach.
 */
export function evaluatePlayerScript(data: { output: string }, env: Record<string, unknown>): unknown {
  const context = vm.createContext(Object.create(null))
  const paramNames = Object.keys(env)
  const fn = vm.compileFunction(data.output, paramNames, { parsingContext: context })
  return fn(...paramNames.map((name) => env[name]))
}
