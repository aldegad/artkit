"use client";

import { useCallback, useState } from "react";

interface UseRotateMenuOptions {
  rotate: (degrees: number) => void;
}

interface UseRotateMenuReturn {
  showRotateMenu: boolean;
  setRotateMenuOpen: (open: boolean) => void;
  handleRotateLeft: () => void;
  handleRotateRight: () => void;
}

export function useRotateMenu(options: UseRotateMenuOptions): UseRotateMenuReturn {
  const { rotate } = options;
  const [showRotateMenu, setShowRotateMenu] = useState(false);

  const handleRotateLeft = useCallback(() => {
    rotate(-90);
    setShowRotateMenu(false);
  }, [rotate]);

  const handleRotateRight = useCallback(() => {
    rotate(90);
    setShowRotateMenu(false);
  }, [rotate]);

  return {
    showRotateMenu,
    setRotateMenuOpen: setShowRotateMenu,
    handleRotateLeft,
    handleRotateRight,
  };
}
