import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Socket } from 'socket.io-client';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Ridimensiona un'immagine a maxSize px sul lato lungo e la restituisce come data URL.
// keepTransparency: i file non JPEG (es. avatar PNG) restano PNG per non perdere lo sfondo trasparente;
// con false esce sempre JPEG, molto più leggero (usato per le mappe).
export function resizeImageFile(file: File, maxSize = 350, keepTransparency = true): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const asPng = keepTransparency && file.type !== 'image/jpeg';
        // Avatar con trasparenza: via i bordi trasparenti, così il personaggio riempie il quadretto
        const crop = (asPng && opaqueBounds(img)) || { x: 0, y: 0, width: img.width, height: img.height };
        let width = crop.width;
        let height = crop.height;

        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
          resolve(asPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.85));
        } else {
          resolve(e.target?.result as string);
        }
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Rettangolo che contiene i pixel visibili dell'immagine (null se è tutta trasparente).
// Alpha <= 8 conta come trasparente: ignora gli aloni quasi invisibili attorno ad alcuni PNG.
function opaqueBounds(img: HTMLImageElement) {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, img.width, img.height);

  let minX = img.width;
  let minY = img.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (data[(y * img.width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

// Imposta l'avatar di una pedina: con un file lo ridimensiona e lo invia, con null lo rimuove.
// Restituisce il nuovo avatarUrl, oppure undefined se l'immagine non si può leggere.
export async function sendTokenAvatar(
  socket: Socket,
  tokenId: string,
  file: File | null
): Promise<string | null | undefined> {
  try {
    const avatarUrl = file ? await resizeImageFile(file, 350) : null;
    socket.emit('update-token-avatar', { tokenId, avatarUrl });
    return avatarUrl;
  } catch (err) {
    console.error("Errore nel caricamento dell'avatar:", err);
    return undefined;
  }
}
