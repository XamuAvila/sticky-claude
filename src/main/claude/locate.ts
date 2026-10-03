import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

/** Acha o claude.exe: caminho informado > instalação nativa do usuário > PATH. */
export function acharClaude(informado?: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const candidatos: string[] = [];
  if (informado) candidatos.push(informado);
  candidatos.push(join(env.USERPROFILE ?? homedir(), '.local', 'bin', 'claude.exe'));
  for (const dir of (env.PATH ?? env.Path ?? '').split(delimiter)) {
    if (dir) candidatos.push(join(dir, 'claude.exe'));
  }
  return candidatos.find((c) => existsSync(c)) ?? null;
}
