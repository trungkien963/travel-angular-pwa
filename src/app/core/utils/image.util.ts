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

export async function shareOrDownloadImage(src: string, shareTitle: string, shareText: string, shareUrl: string): Promise<boolean> {
  if (!src) {
    if (navigator.share) {
      await navigator.share({ title: shareTitle, text: shareText, url: shareUrl }).catch(console.error);
      return true;
    }
    return false; // Fallback to copy link
  }

  return new Promise<boolean>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(false);
        return;
      }
      
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      
      canvas.toBlob(async (blob) => {
        if (!blob) {
          resolve(false);
          return;
        }
        
        const file = new File([blob], 'wanderpool-photo.jpg', { type: 'image/jpeg' });
        const objectUrl = URL.createObjectURL(blob);
        
        try {
          if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: shareTitle,
              text: shareText,
              url: shareUrl
            });
            resolve(true);
          } else if (navigator.share) {
            await navigator.share({
              title: shareTitle,
              text: shareText,
              url: shareUrl
            });
            resolve(true);
          } else {
            // Fallback to direct download
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = 'wanderpool-photo.jpg';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            resolve(true);
          }
        } catch (err) {
          console.error('Error sharing', err);
          resolve(false);
        } finally {
          setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        }
      }, 'image/jpeg', 0.95);
    };
    
    img.onerror = async () => {
      // Fallback
      if (navigator.share) {
        await navigator.share({ title: shareTitle, text: shareText, url: shareUrl }).catch(console.error);
        resolve(true);
      } else {
        resolve(false);
      }
    };
    img.src = src;
  });
}
