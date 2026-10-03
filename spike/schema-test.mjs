// Verifica se --json-schema funciona em -p com stream-json e onde o JSON vem (structured_output ou texto).
import { run, recipe, summarize } from './lib.mjs';

const schema = {
  type: 'object',
  properties: {
    itens: { type: 'array', items: { type: 'object', properties: { nome: { type: 'string' }, n: { type: 'number' } }, required: ['nome', 'n'] } },
  },
  required: ['itens'],
};

const s = await run({
  name: 'schema',
  prompt: 'Devolva 2 itens de exemplo: frutas com um número de 1 a 5.',
  args: [...recipe(), '--json-schema', JSON.stringify(schema)],
});
const x = summarize(s);
console.log({ erro: x.erro, subtype: x.subtype, turnos: x.turnos, tokens: x.tokens, tempoMs: x.tempoTotalMs });
console.log('chaves do result:', Object.keys(s.result ?? {}));
console.log('structured_output:', JSON.stringify(s.result?.structured_output));
console.log('result (texto):', JSON.stringify(s.result?.result));
