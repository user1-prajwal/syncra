'use strict'

// Verifies every execution provider you have configured, for every language Syncra supports, by running a
// tiny "hello" program. Use it after pointing PISTON_URL at your own Piston server, to see which of the 12
// languages work there and which runtimes still need installing.
//
//   npm run check:exec
//
// Reads the same environment variables as the server (PISTON_URL, ONLINECOMPILER_API_KEY, ...).

const { buildProvidersFromEnv, LANG_MAP } = require('../executor')

const HELLO = {
  python: 'print("hello")',
  c: '#include <stdio.h>\nint main(void) { printf("hello\\n"); return 0; }',
  cpp: '#include <iostream>\nint main() { std::cout << "hello\\n"; }',
  java: 'public class Main {\n  public static void main(String[] args) { System.out.println("hello"); }\n}',
  typescript: 'console.log("hello")',
  csharp: 'using System;\nclass Program { static void Main() { Console.WriteLine("hello"); } }',
  fsharp: 'printfn "hello"',
  php: '<?php echo "hello\\n";',
  ruby: 'puts "hello"',
  haskell: 'main = putStrLn "hello"',
  go: 'package main\nimport "fmt"\nfunc main() { fmt.Println("hello") }',
  rust: 'fn main() { println!("hello"); }',
}

async function main() {
  const providers = buildProvidersFromEnv(process.env)
  if (providers.length === 0) {
    console.error('No provider configured. Set PISTON_URL and/or ONLINECOMPILER_API_KEY (see .env.example).')
    process.exit(2)
  }
  let failures = 0
  for (const provider of providers) {
    console.log(`\n=== ${provider.name} ===`)
    for (const language of Object.keys(LANG_MAP)) {
      const started = Date.now()
      let line
      try {
        const result = await provider.run(language, HELLO[language])
        const passed = !result.error && /hello/.test(result.output)
        if (!passed) failures++
        line = `${passed ? 'OK  ' : 'FAIL'} ${language.padEnd(11)} ${Date.now() - started} ms  ${passed ? '' : JSON.stringify(result.output.slice(0, 120))}`
      } catch (err) {
        failures++
        line = `FAIL ${language.padEnd(11)} ${Date.now() - started} ms  service problem: ${err.message}`
      }
      console.log(line)
    }
  }
  console.log(failures === 0 ? '\nAll languages work on every configured provider.' : `\n${failures} check(s) failed. See the lines marked FAIL.`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
