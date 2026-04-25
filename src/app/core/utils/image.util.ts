export async function compressImage(file: File, maxWidth = 1920, maxHeight = 1920, quality = 0.8): Promise<File> {
  return new Promise((resolve, reject) => {
    // We only compress images
    if (!file.type.startsWith('image/')) {
      return resolve(file);
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;

      // Calculate new dimensions
      if (width > maxWidth || height > maxHeight) {
        if (width / height > maxWidth / maxHeight) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file); // fallback
        return;
      }

      // Draw image
      ctx.drawImage(img, 0, 0, width, height);

      // We'll export as webp for better compression if supported, else jpeg
      const type = 'image/webp';
      canvas.toBlob(
        (blob) => {
          if (blob) {
            // Keep original name but change extension if needed
            let newName = file.name;
            const lastDot = newName.lastIndexOf('.');
            if (lastDot > 0) {
              newName = newName.substring(0, lastDot) + '.webp';
            } else {
              newName += '.webp';
            }
            
            const newFile = new File([blob], newName, {
              type: type,
              lastModified: Date.now(),
            });
            resolve(newFile);
          } else {
            resolve(file); // fallback
          }
        },
        type,
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file); // fallback to original if load fails
    };
  });
}
