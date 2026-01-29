type SaveResult =
  | { ok: true }
  | { ok: false; reason: 'cancelled' | 'unsupported' | 'error'; error?: unknown };

type OpenResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'cancelled' | 'unsupported' | 'error'; error?: unknown };

const getTauri = () => (window as any).__TAURI__;

export async function saveTextFile(text: string, suggestedName: string): Promise<SaveResult> {
  const tauri = getTauri();
  const tauriSave = tauri?.dialog?.save;
  const tauriWriteText = tauri?.fs?.writeTextFile;
  const tauriWriteFile = tauri?.fs?.writeFile;

  if (tauriSave && (tauriWriteText || tauriWriteFile)) {
    try {
      const path = await tauriSave({
        defaultPath: suggestedName,
        filters: [{ name: 'Text', extensions: ['txt'] }],
      });
      if (!path || typeof path !== 'string') return { ok: false, reason: 'cancelled' };
      if (tauriWriteText) {
        await tauriWriteText(path, text);
      } else {
        const bytes = new TextEncoder().encode(text);
        await tauriWriteFile({ path, contents: bytes });
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: 'error', error };
    }
  }

  const picker = (window as any).showSaveFilePicker as
    | ((options?: any) => Promise<any>)
    | undefined;
  if (!picker) return { ok: false, reason: 'unsupported' };

  try {
    const handle = await picker({
      suggestedName,
      types: [
        {
          description: 'Text File',
          accept: { 'text/plain': ['.txt'] },
        },
      ],
    });
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
    return { ok: true };
  } catch (error) {
    if ((error as any)?.name === 'AbortError') return { ok: false, reason: 'cancelled' };
    return { ok: false, reason: 'error', error };
  }
}

export async function openTextFile(): Promise<OpenResult> {
  const tauri = getTauri();
  const tauriOpen = tauri?.dialog?.open;
  const tauriReadText = tauri?.fs?.readTextFile;
  const tauriReadFile = tauri?.fs?.readFile;

  if (tauriOpen && (tauriReadText || tauriReadFile)) {
    try {
      const path = await tauriOpen({
        multiple: false,
        filters: [{ name: 'Text', extensions: ['txt'] }],
      });
      if (!path || Array.isArray(path)) return { ok: false, reason: 'cancelled' };
      if (tauriReadText) {
        const text = await tauriReadText(path);
        return { ok: true, text };
      }
      const bytes = await tauriReadFile(path);
      const text = new TextDecoder().decode(bytes);
      return { ok: true, text };
    } catch (error) {
      return { ok: false, reason: 'error', error };
    }
  }

  const picker = (window as any).showOpenFilePicker as
    | ((options?: any) => Promise<any>)
    | undefined;
  if (!picker) return { ok: false, reason: 'unsupported' };

  try {
    const [handle] = await picker({
      multiple: false,
      types: [
        {
          description: 'Text File',
          accept: { 'text/plain': ['.txt'] },
        },
      ],
    });
    const file = await handle.getFile();
    const text = await file.text();
    return { ok: true, text };
  } catch (error) {
    if ((error as any)?.name === 'AbortError') return { ok: false, reason: 'cancelled' };
    return { ok: false, reason: 'error', error };
  }
}
