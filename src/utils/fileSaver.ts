import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/**
 * Save a generated file.
 * - Browser: normal download.
 * - Android app: WebViews ignore <a download>, so write the file to the app cache and open
 *   the system share sheet (WhatsApp, Drive, Gmail, "Save to Files", Quick Share…).
 */
export async function saveFile(blob: Blob, filename: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const data = await blobToBase64(blob);
    const { uri } = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache });
    try {
      await Share.share({ title: filename, files: [uri], dialogTitle: `Share ${filename}` });
    } catch (err: any) {
      // Closing the share sheet without picking anything isn't an error
      if (!/cancel/i.test(String(err?.message ?? err))) throw err;
    }
    return;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export const isNativeApp = () => Capacitor.isNativePlatform();
