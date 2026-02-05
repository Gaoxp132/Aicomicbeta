// 处理图片文件
export function processImageFile(file: File, callback: (base64: string) => void): void {
  if (!file.type.startsWith('image/')) {
    console.error('Invalid file type - not an image');
    return;
  }

  if (file.size > 30 * 1024 * 1024) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(2);
    console.error(`Image too large: ${sizeMB}MB`);
    return;
  }

  const reader = new FileReader();
  reader.onloadend = () => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      
      const maxWidth = 1920;
      const maxHeight = 1080;
      
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = width * ratio;
        height = height * ratio;
      }
      
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
        callback(compressedBase64);
      }
    };
    img.onerror = () => {
      console.error('Image processing failed');
    };
    img.src = reader.result as string;
  };
  reader.onerror = () => {
    console.error('Image reading failed');
  };
  reader.readAsDataURL(file);
}
