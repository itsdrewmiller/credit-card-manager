import { contextBridge, ipcRenderer } from 'electron'

/**
 * Minimal tRPC-over-IPC bridge. The renderer sends { type, path, input } and
 * gets back the procedure's result (or a rejected promise on error). We use our
 * own bridge instead of electron-trpc, which is incompatible with tRPC v11's
 * per-link transformer model. All payloads are JSON-safe, so Electron's
 * structured-clone IPC handles them with no data transformer.
 */
export interface TrpcRequest {
  type: 'query' | 'mutation'
  path: string
  input: unknown
}

contextBridge.exposeInMainWorld('trpcIpc', {
  request: (op: TrpcRequest): Promise<unknown> => ipcRenderer.invoke('trpc:request', op)
})
