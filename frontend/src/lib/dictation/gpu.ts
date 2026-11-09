type Adapter = { isFallbackAdapter?: boolean; info?: { isFallbackAdapter?: boolean } };
type GpuNavigator = { gpu?: { requestAdapter: () => Promise<Adapter | null> } };

/**
 * Si hay una tarjeta gráfica real con WebGPU. Un adaptador "de respaldo" emula la GPU por software: es más lento que
 * WebAssembly, así que cuenta como si no hubiera.
 */
export async function hasHardwareGpu(nav: GpuNavigator): Promise<boolean> {
  const adapter = await nav.gpu?.requestAdapter().catch(() => null);
  return Boolean(adapter) && !adapter!.isFallbackAdapter && !adapter!.info?.isFallbackAdapter;
}
