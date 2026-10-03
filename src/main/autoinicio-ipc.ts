import type { IpcMain } from 'electron';
import type { AutoInicio } from './autoinicio';

export function registrarIpcAutoInicio(ipc: IpcMain, auto: AutoInicio): void {
  ipc.handle('autoinicio:estado', () => auto.estado());
  // `confirmado` só vale se veio de um clique real na janela de confirmação da tela.
  ipc.handle('autoinicio:definir', (_e, ligar: unknown, confirmado: unknown) => auto.definir(ligar === true, confirmado === true));
}
