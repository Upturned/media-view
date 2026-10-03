export type DialogName = 'help' | 'styles';

export const ui = $state({ dialog: null as DialogName | null });

export function openDialog(name: DialogName): void {
  ui.dialog = name;
}

export function closeDialog(): void {
  ui.dialog = null;
}
