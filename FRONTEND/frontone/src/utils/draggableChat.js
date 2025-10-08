// Enhanced Draggable & Resizable Chat Panel JavaScript
class DraggableResizableChat {
  constructor(chatPanelSelector) {
    this.chatPanel = document.querySelector(chatPanelSelector);
    this.chatHeader = this.chatPanel?.querySelector('.chat-header');
    this.resizeHandles = this.chatPanel?.querySelectorAll('.resize-handle');

    // State variables
    this.isDragging = false;
    this.isResizing = false;
    this.currentHandle = null;

    // Position and size tracking
    this.startX = 0;
    this.startY = 0;
    this.startLeft = 0;
    this.startTop = 0;
    this.startWidth = 0;
    this.startHeight = 0;

    // Initialize if elements exist
    if (this.chatPanel && this.chatHeader) {
      this.init();
    }
  }

  init() {
    // Add resize handles if they don't exist
    this.addResizeHandles();

    // Bind drag functionality
    this.bindDragEvents();

    // Bind resize functionality  
    this.bindResizeEvents();

    // Bind control buttons
    this.bindControlButtons();

    // Set initial position if not set
    this.setInitialPosition();
  }

  addResizeHandles() {
    const handles = ['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'];

    handles.forEach(direction => {
      if (!this.chatPanel.querySelector(`.resize-handle.${direction}`)) {
        const handle = document.createElement('div');
        handle.className = `resize-handle ${direction}`;
        this.chatPanel.appendChild(handle);
      }
    });

    // Update resize handles reference
    this.resizeHandles = this.chatPanel.querySelectorAll('.resize-handle');
  }

  setInitialPosition() {
    const rect = this.chatPanel.getBoundingClientRect();
    if (rect.left === 0 && rect.top === 0) {
      // Set default position if not already positioned
      this.chatPanel.style.right = '24px';
      this.chatPanel.style.top = '50%';
      this.chatPanel.style.transform = 'translateY(-50%)';
    }
  }

  bindDragEvents() {
    this.chatHeader.addEventListener('mousedown', this.startDrag.bind(this));
    this.chatHeader.addEventListener('touchstart', this.startDrag.bind(this), { passive: false });

    document.addEventListener('mousemove', this.handleDrag.bind(this));
    document.addEventListener('touchmove', this.handleDrag.bind(this), { passive: false });

    document.addEventListener('mouseup', this.stopDrag.bind(this));
    document.addEventListener('touchend', this.stopDrag.bind(this));
  }

  bindResizeEvents() {
    this.resizeHandles.forEach(handle => {
      handle.addEventListener('mousedown', this.startResize.bind(this));
      handle.addEventListener('touchstart', this.startResize.bind(this), { passive: false });
    });

    document.addEventListener('mousemove', this.handleResize.bind(this));
    document.addEventListener('touchmove', this.handleResize.bind(this), { passive: false });

    document.addEventListener('mouseup', this.stopResize.bind(this));
    document.addEventListener('touchend', this.stopResize.bind(this));
  }

  bindControlButtons() {
    const minimizeBtn = this.chatPanel.querySelector('.chat-control-btn.minimize');
    const maximizeBtn = this.chatPanel.querySelector('.chat-control-btn.maximize');
    const closeBtn = this.chatPanel.querySelector('.chat-control-btn.close');

    if (minimizeBtn) {
      minimizeBtn.addEventListener('click', this.toggleMinimize.bind(this));
    }

    if (maximizeBtn) {
      maximizeBtn.addEventListener('click', this.toggleMaximize.bind(this));
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', this.closeChatPanel.bind(this));
    }
  }

  getEventCoordinates(e) {
    return {
      x: e.type.includes('touch') ? e.touches[0].clientX : e.clientX,
      y: e.type.includes('touch') ? e.touches[0].clientY : e.clientY
    };
  }

  // DRAG FUNCTIONALITY
  startDrag(e) {
    if (e.target.closest('.chat-control-btn') || this.chatPanel.classList.contains('minimized')) {
      return;
    }

    e.preventDefault();
    this.isDragging = true;

    const coords = this.getEventCoordinates(e);
    this.startX = coords.x;
    this.startY = coords.y;

    const rect = this.chatPanel.getBoundingClientRect();
    this.startLeft = rect.left;
    this.startTop = rect.top;

    // Convert to absolute positioning for dragging
    this.chatPanel.style.position = 'absolute';
    this.chatPanel.style.left = this.startLeft + 'px';
    this.chatPanel.style.top = this.startTop + 'px';
    this.chatPanel.style.right = 'auto';
    this.chatPanel.style.transform = 'none';

    this.chatPanel.style.zIndex = '10003';
    document.body.style.userSelect = 'none';
  }

  handleDrag(e) {
    if (!this.isDragging) return;

    e.preventDefault();
    const coords = this.getEventCoordinates(e);

    const deltaX = coords.x - this.startX;
    const deltaY = coords.y - this.startY;

    let newLeft = this.startLeft + deltaX;
    let newTop = this.startTop + deltaY;

    // Boundary constraints
    const rect = this.chatPanel.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    newLeft = Math.max(0, Math.min(newLeft, viewportWidth - rect.width));
    newTop = Math.max(0, Math.min(newTop, viewportHeight - rect.height));

    this.chatPanel.style.left = newLeft + 'px';
    this.chatPanel.style.top = newTop + 'px';
  }

  stopDrag() {
    if (!this.isDragging) return;

    this.isDragging = false;
    this.chatPanel.style.zIndex = '10002';
    document.body.style.userSelect = '';
  }

  // RESIZE FUNCTIONALITY
  startResize(e) {
    e.preventDefault();
    e.stopPropagation();

    this.isResizing = true;
    this.currentHandle = e.target;

    const coords = this.getEventCoordinates(e);
    this.startX = coords.x;
    this.startY = coords.y;

    const rect = this.chatPanel.getBoundingClientRect();
    this.startLeft = rect.left;
    this.startTop = rect.top;
    this.startWidth = rect.width;
    this.startHeight = rect.height;

    document.body.style.userSelect = 'none';
    this.chatPanel.style.zIndex = '10003';
  }

  handleResize(e) {
    if (!this.isResizing || !this.currentHandle) return;

    e.preventDefault();
    const coords = this.getEventCoordinates(e);

    const deltaX = coords.x - this.startX;
    const deltaY = coords.y - this.startY;

    const handleClass = this.currentHandle.className;

    let newWidth = this.startWidth;
    let newHeight = this.startHeight;
    let newLeft = this.startLeft;
    let newTop = this.startTop;

    // Get min/max constraints
    const minWidth = parseInt(getComputedStyle(this.chatPanel).minWidth) || 300;
    const minHeight = parseInt(getComputedStyle(this.chatPanel).minHeight) || 350;
    const maxWidth = parseInt(getComputedStyle(this.chatPanel).maxWidth) || window.innerWidth;
    const maxHeight = parseInt(getComputedStyle(this.chatPanel).maxHeight) || window.innerHeight - 180;

    if (handleClass.includes('e')) {
      newWidth = Math.max(minWidth, Math.min(maxWidth, this.startWidth + deltaX));
    }

    if (handleClass.includes('w')) {
      newWidth = Math.max(minWidth, Math.min(maxWidth, this.startWidth - deltaX));
      if (newWidth > minWidth) {
        newLeft = this.startLeft + (this.startWidth - newWidth);
      }
    }

    if (handleClass.includes('s')) {
      newHeight = Math.max(minHeight, Math.min(maxHeight, this.startHeight + deltaY));
    }

    if (handleClass.includes('n')) {
      newHeight = Math.max(minHeight, Math.min(maxHeight, this.startHeight - deltaY));
      if (newHeight > minHeight) {
        newTop = this.startTop + (this.startHeight - newHeight);
      }
    }

    // Boundary checks
    if (newLeft < 0) {
      newWidth += newLeft;
      newLeft = 0;
    }

    if (newTop < 0) {
      newHeight += newTop;
      newTop = 0;
    }

    if (newLeft + newWidth > window.innerWidth) {
      newWidth = window.innerWidth - newLeft;
    }

    if (newTop + newHeight > window.innerHeight) {
      newHeight = window.innerHeight - newTop;
    }

    // Apply new dimensions
    this.chatPanel.style.width = newWidth + 'px';
    this.chatPanel.style.height = newHeight + 'px';
    this.chatPanel.style.left = newLeft + 'px';
    this.chatPanel.style.top = newTop + 'px';
  }

  stopResize() {
    if (!this.isResizing) return;

    this.isResizing = false;
    this.currentHandle = null;
    this.chatPanel.style.zIndex = '10002';
    document.body.style.userSelect = '';
  }

  // CONTROL FUNCTIONS
  toggleMinimize() {
    this.chatPanel.classList.toggle('minimized');

    // Save original height when minimizing
    if (this.chatPanel.classList.contains('minimized')) {
      this.originalHeight = this.chatPanel.style.height || '500px';
    } else {
      // Restore original height
      if (this.originalHeight) {
        this.chatPanel.style.height = this.originalHeight;
      }
    }
  }

  toggleMaximize() {
    if (this.chatPanel.classList.contains('maximized')) {
      // Restore original size and position
      this.chatPanel.classList.remove('maximized');
      this.chatPanel.style.width = this.originalSize?.width || '380px';
      this.chatPanel.style.height = this.originalSize?.height || '500px';
      this.chatPanel.style.left = this.originalSize?.left || '';
      this.chatPanel.style.top = this.originalSize?.top || '';
      this.chatPanel.style.right = this.originalSize?.right || '24px';
      this.chatPanel.style.transform = this.originalSize?.transform || 'translateY(-50%)';
    } else {
      // Save current size and position
      const rect = this.chatPanel.getBoundingClientRect();
      this.originalSize = {
        width: rect.width + 'px',
        height: rect.height + 'px',
        left: this.chatPanel.style.left,
        top: this.chatPanel.style.top,
        right: this.chatPanel.style.right,
        transform: this.chatPanel.style.transform
      };

      // Maximize
      this.chatPanel.classList.add('maximized');
      this.chatPanel.style.width = 'calc(100vw - 48px)';
      this.chatPanel.style.height = 'calc(100vh - 200px)';
      this.chatPanel.style.left = '24px';
      this.chatPanel.style.top = '24px';
      this.chatPanel.style.right = 'auto';
      this.chatPanel.style.transform = 'none';
    }
  }

  closeChatPanel() {
    this.chatPanel.classList.add('hidden');

    // Optional: completely remove after animation
    setTimeout(() => {
      if (this.chatPanel.classList.contains('hidden')) {
        this.chatPanel.style.display = 'none';
      }
    }, 300);
  }

  showChatPanel() {
    this.chatPanel.style.display = 'flex';
    this.chatPanel.classList.remove('hidden');
  }
}

// Auto-initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  // Initialize draggable resizable chat panel
  window.draggableChatPanel = new DraggableResizableChat('.chat-panel');

  // Add method to toggle chat visibility (can be called from other parts of your app)
  window.toggleChatPanel = function() {
    const chatPanel = document.querySelector('.chat-panel');
    if (chatPanel) {
      if (chatPanel.classList.contains('hidden') || chatPanel.style.display === 'none') {
        window.draggableChatPanel.showChatPanel();
      } else {
        window.draggableChatPanel.closeChatPanel();
      }
    }
  };
});

// Screen sharing detection for mirror fix
function handleScreenShareToggle(isScreenSharing) {
  const localVideo = document.querySelector('.local-video');
  const remoteVideo = document.querySelector('.remote-video');
  const remoteMainVideo = document.querySelector('.remote-main-video');

  if (localVideo) {
    if (isScreenSharing) {
      localVideo.classList.add('screen-sharing');
    } else {
      localVideo.classList.remove('screen-sharing');
    }
  }

  if (remoteVideo) {
    if (isScreenSharing) {
      remoteVideo.classList.add('screen-sharing');
    } else {
      remoteVideo.classList.remove('screen-sharing');
    }
  }

  if (remoteMainVideo) {
    if (isScreenSharing) {
      remoteMainVideo.classList.add('screen-sharing');
    } else {
      remoteMainVideo.classList.remove('screen-sharing');
    }
  }
}

// Export for use in your WebRTC application
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DraggableResizableChat, handleScreenShareToggle };
}