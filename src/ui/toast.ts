// ─── UX Toast Notification & Drag-Drop Module ─────────────────────────────────

export function showToast(message: string, type: 'info' | 'success' | 'warn' | 'error' = 'info', durationMs = 3000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast-item toast-${type}`;
  
  const iconMap = {
    info: 'ℹ️',
    success: '✅',
    warn: '⚠️',
    error: '❌',
  };

  toast.innerHTML = `
    <span class="toast-icon">${iconMap[type]}</span>
    <span class="toast-message">${message}</span>
  `;

  container.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => toast.classList.add('show'));

  setTimeout(() => {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => toast.remove());
  }, durationMs);
}

/** Set up drag & drop media file handling on the canvas stage wrapper. */
export function setupDragAndDrop(
  dropTarget: HTMLElement,
  onFileDropped: (file: File) => void
) {
  let overlay = document.getElementById('drag-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'drag-overlay';
    overlay.className = 'drag-overlay';
    overlay.innerHTML = `
      <div class="drag-overlay-card">
        <div class="drag-icon">📁</div>
        <div class="drag-title">Drop Media File Here</div>
        <div class="drag-sub">Supports Video (MP4, WebM) & Images (PNG, JPG, SVG)</div>
      </div>
    `;
    dropTarget.appendChild(overlay);
  }

  let dragCounter = 0;

  dropTarget.addEventListener('dragenter', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter++;
    overlay?.classList.add('active');
  });

  dropTarget.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  dropTarget.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      overlay?.classList.remove('active');
    }
  });

  dropTarget.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter = 0;
    overlay?.classList.remove('active');

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
        showToast(`Loaded ${file.name}`, 'success');
        onFileDropped(file);
      } else {
        showToast('Invalid file format. Please drop image or video.', 'error');
      }
    }
  });
}
