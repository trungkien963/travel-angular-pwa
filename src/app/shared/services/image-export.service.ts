import { Injectable } from '@angular/core';
import { toPng } from 'html-to-image';

@Injectable({ providedIn: 'root' })
export class ImageExportService {

  async exportPolaroid(imageUrl: string, watermark: string = 'Travel App'): Promise<void> {
    return new Promise((resolve, reject) => {
      // 1. Tạo lớp phủ (Overlay) làm nền mờ đen
      const overlay = document.createElement('div');
      overlay.style.position = 'fixed';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100vw';
      overlay.style.height = '100vh';
      overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
      overlay.style.zIndex = '99999';
      overlay.style.display = 'flex';
      overlay.style.flexDirection = 'column';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';
      overlay.style.backdropFilter = 'blur(5px)';
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.2s ease';

      // 2. Tạo phần Preview Khung Polaroid
      const container = document.createElement('div');
      container.style.transform = 'scale(0.85)';
      container.style.transition = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
      container.innerHTML = `
        <div id="polaroid-capture-node" style="background: #ffffff; width: 340px; border-radius: 4px; box-shadow: 0 15px 35px rgba(0, 0, 0, 0.2); padding: 16px; display: flex; flex-direction: column; margin: 0 auto;">
          <div style="display: flex; justify-content: flex-end; padding-bottom: 12px; color: #1C1917;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="1.5"></circle><circle cx="19" cy="12" r="1.5"></circle><circle cx="5" cy="12" r="1.5"></circle>
            </svg>
          </div>
          <div style="width: 100%; height: 308px; background: #f0f0f0; overflow: hidden; box-shadow: inset 0 2px 4px rgba(0,0,0,0.05); border-radius: 2px; position: relative;">
            <img src="" style="width: 100%; height: 100%; object-fit: cover; display: none;" id="export-img-preview" />
            <div id="export-img-loading" style="position: absolute; top:0; left:0; width:100%; height:100%; display:flex; justify-content:center; align-items:center; flex-direction: column; gap: 8px; color: #888; font-family: 'Inter', sans-serif; font-size: 14px;">
               <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>
               Đang xử lý ảnh...
            </div>
            <style>@keyframes spin { 100% { transform: rotate(360deg); } }</style>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 16px; padding-bottom: 4px;">
            <div style="display: flex; gap: 16px; color: #1C1917;">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            </div>
            <div style="display: flex; align-items: center; font-family: 'Inter', sans-serif;">
              <span style="font-size: 18px; font-weight: 900; letter-spacing: -0.5px; color: #1C1917;">Wanderpool<span style="color: #FFC800;">.</span></span>
            </div>
          </div>
        </div>
      `;

      // 3. Tạo nút điều khiển (Lưu / Hủy)
      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.gap = '12px';
      actions.style.marginTop = '24px';

      const cancelBtn = document.createElement('button');
      cancelBtn.innerText = 'Hủy';
      cancelBtn.style.padding = '14px 24px';
      cancelBtn.style.borderRadius = '30px';
      cancelBtn.style.border = 'none';
      cancelBtn.style.backgroundColor = '#F5F5F4';
      cancelBtn.style.color = '#1C1917';
      cancelBtn.style.fontWeight = '700';
      cancelBtn.style.fontSize = '15px';
      cancelBtn.style.cursor = 'pointer';
      cancelBtn.style.fontFamily = 'inherit';

      const saveBtn = document.createElement('button');
      saveBtn.innerText = 'Tải / Chia sẻ';
      saveBtn.style.padding = '14px 32px';
      saveBtn.style.borderRadius = '30px';
      saveBtn.style.border = 'none';
      saveBtn.style.backgroundColor = '#FFC800';
      saveBtn.style.color = '#1C1917';
      saveBtn.style.fontWeight = '700';
      saveBtn.style.fontSize = '15px';
      saveBtn.style.cursor = 'pointer';
      saveBtn.style.fontFamily = 'inherit';
      saveBtn.disabled = true; // Disable until image is ready
      saveBtn.style.opacity = '0.5';

      actions.appendChild(cancelBtn);
      actions.appendChild(saveBtn);

      overlay.appendChild(container);
      overlay.appendChild(actions);
      document.body.appendChild(overlay);

      requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        container.style.transform = 'scale(0.9)';
      });

      const cleanup = () => {
        overlay.style.opacity = '0';
        container.style.transform = 'scale(0.85)';
        setTimeout(() => {
          if (document.body.contains(overlay)) document.body.removeChild(overlay);
          resolve();
        }, 200);
      };

      cancelBtn.onclick = () => cleanup();
      overlay.onclick = (e) => {
        if (e.target === overlay) cleanup();
      };

      // --- LOGIC XỬ LÝ ẢNH CHUYÊN SÂU TỐI THƯỢNG ---
      // Fetch qua blob với cache: 'no-cache' ĐỂ KHÔNG PHÁ VỠ CHỮ KÝ URL (TOKEN)
      const loadAndShrinkImage = async (url: string): Promise<string> => {
        // Fetch ảnh gốc và ép bỏ qua cache mà không sửa URL
        const res = await fetch(url, { mode: 'cors', cache: 'no-cache' });
        if (!res.ok) throw new Error('Fetch failed');
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);

        return new Promise((resolveCanvas, rejectCanvas) => {
          const img = new Image();
          img.onload = () => {
            URL.revokeObjectURL(objectUrl); // Xóa URL tạm
            const canvas = document.createElement('canvas');
            const maxDim = 800; // Khung polaroid chỉ ~340px, 800px là quá đủ nét
            let w = img.width;
            let h = img.height;
            if (w > maxDim || h > maxDim) {
              if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
              else { w = Math.round(w * maxDim / h); h = maxDim; }
            }
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, w, h);
              resolveCanvas(canvas.toDataURL('image/jpeg', 0.85));
            } else {
              rejectCanvas('No canvas context');
            }
          };
          img.onerror = (e) => {
            URL.revokeObjectURL(objectUrl);
            rejectCanvas(e);
          };
          img.src = objectUrl;
        });
      };

      // Bắt đầu tải và nén ảnh
      loadAndShrinkImage(imageUrl)
        .catch(() => {
          // Fallback: CORS Proxy nếu direct fetch thất bại
          const proxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(imageUrl);
          return loadAndShrinkImage(proxyUrl);
        })
        .then((base64Url) => {
          const imgPreview = document.getElementById('export-img-preview') as HTMLImageElement;
          const loadingEl = document.getElementById('export-img-loading');
          if (imgPreview && loadingEl) {
            imgPreview.src = base64Url;
            imgPreview.style.display = 'block';
            loadingEl.style.display = 'none';
            // Bật nút Lưu
            saveBtn.disabled = false;
            saveBtn.style.opacity = '1';
          }
        })
        .catch((err) => {
          console.error('Hoàn toàn không thể lấy được ảnh:', err);
          alert('Không thể tải ảnh. Vui lòng kiểm tra lại kết nối mạng!');
          cleanup();
        });

      // Xử lý nút Lưu ảnh
      saveBtn.onclick = async () => {
        saveBtn.innerText = 'Đang đóng gói...';
        saveBtn.disabled = true;
        saveBtn.style.opacity = '0.7';

        try {
          const targetNode = document.getElementById('polaroid-capture-node') as HTMLElement;
          // Chụp ảnh với tùy chọn bỏ qua Fonts (rất hay gây lỗi CORS trên html-to-image)
          const dataUrl = await toPng(targetNode, { 
            cacheBust: true, 
            pixelRatio: 3,
            skipFonts: true 
          });
          
          const res = await fetch(dataUrl);
          const blob = await res.blob();
          const file = new File([blob], 'wanderpool-moment.png', { type: blob.type });

          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: 'Chia sẻ Moment' });
          } else {
            const link = document.createElement('a');
            link.download = 'wanderpool-moment.png';
            link.href = dataUrl;
            link.click();
          }
          cleanup();
        } catch (e: any) {
          console.error('Export failed:', e);
          saveBtn.innerText = 'Lỗi! Thử lại';
          saveBtn.disabled = false;
          saveBtn.style.opacity = '1';
          alert('Lỗi xuất ảnh: ' + (e.message || 'Không thể render ảnh.'));
        }
      };
    });
  }
}
