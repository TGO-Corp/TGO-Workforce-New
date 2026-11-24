// Shared by every "upload a photo" field (Profile, New Hire form, Manage
// Employees edit dialog) — there's no object storage wired up in this app
// (see backend/app/models/account.py's Account.photo_url comment), so an
// uploaded image is downsized client-side and stored as a small data: URI
// instead of a full-resolution file.

export const MAX_PHOTO_DIMENSION = 256;
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export function readAndResizeImage(
  file: File,
  maxDimension: number = MAX_PHOTO_DIMENSION,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      reject(new Error("That image is too large (max 8MB)."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file doesn't look like an image."));
      img.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Couldn't process that image."));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
