/// <reference types="vite/client" />

declare global {
  interface Window {
    loadPyodide: (config?: { indexURL?: string }) => Promise<any>;
    visualViewport?: {
      width: number;
      height: number;
      offsetTop: number;
      offsetLeft: number;
      scale: number;
      addEventListener: (type: 'resize' | 'scroll', listener: () => void) => void;
      removeEventListener: (type: 'resize' | 'scroll', listener: () => void) => void;
    };
  }
}
