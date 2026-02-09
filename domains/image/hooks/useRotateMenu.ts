"use client";

import { useCallback, useEffect, useState } from "react";

interface UseRotateMenuOptions {
  rotate: (degrees: number) => void;
}

interface UseRotateMenuReturn {
  showRotateMenu: boolean;
  toggleRotateMenu: () => void;
  handleRotateLeft: () => void;
  handleRotateRight: () => void;
}

export function useRotateMenu(options: UseRotateMenuOptions): UseRotateMenuReturn {
  const { rotate } = options;
  const [showRotateMenu, setShowRotateMenu] = useState(false);

  const toggleRotateMenu = useCallback(() => {
    setShowRotateMenu((prev) => !prev);
  }, []);

  const handleRotateLeft = useCallback(() => {
    rotate(-90);
    setShowRotateMenu(false);
  }, [rotate]);

  const handleRotateRight = useCallback(() => {
    rotate(90);
    setShowRotateMenu(false);
  }, [rotate]);

  useEffect(() => {
    if (!showRotateMenu) return;
    const handleClickOutside = () => setShowRotateMenu(false);
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [showRotateMenu]);

  return {
    showRotateMenu,
    toggleRotateMenu,
    handleRotateLeft,
    handleRotateRight,
  };
}
