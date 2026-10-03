/** The one context menu (right-click), rendered by ContextMenu.svelte at the app root. */

export interface MenuItem {
  label: string;
  action: () => void;
  danger?: boolean;
  /** Draw a separator above this item. */
  separated?: boolean;
}

export const menu = $state({
  open: false,
  x: 0,
  y: 0,
  title: '',
  items: [] as MenuItem[],
});

export function openMenu(e: MouseEvent, title: string, items: MenuItem[]): void {
  e.preventDefault();
  e.stopPropagation();
  Object.assign(menu, { open: true, x: e.clientX, y: e.clientY, title, items });
}

export function closeMenu(): void {
  menu.open = false;
}
