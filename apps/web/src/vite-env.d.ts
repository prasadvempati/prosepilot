/// <reference types="vite/client" />

declare namespace chrome {
  namespace runtime {
    function sendMessage(extensionId: string, message: unknown): Promise<unknown>;
  }
}
