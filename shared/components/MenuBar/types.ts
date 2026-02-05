// ============================================
// Menu Bar Types
// ============================================

export type MenuItem =
  | {
      label: string;
      onClick?: () => void;
      disabled?: boolean;
      checked?: boolean;
      shortcut?: string;
      divider?: false;
    }
  | {
      divider: true;
      label?: never;
      onClick?: never;
    };

export interface MenuDropdownProps {
  label: string;
  items: MenuItem[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}
