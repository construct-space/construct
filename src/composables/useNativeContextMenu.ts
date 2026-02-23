import { Menu, MenuItem, Submenu, PredefinedMenuItem } from '@tauri-apps/api/menu'

export interface NativeMenuOption {
  label?: string
  type?: 'separator'
  disabled?: boolean
  shortcut?: string
  children?: NativeMenuOption[]
  onSelect?: () => void
}

async function buildItems(
  options: NativeMenuOption[],
): Promise<Array<MenuItem | Submenu | PredefinedMenuItem>> {
  return Promise.all(
    options.map(async (item) => {
      if (item.type === 'separator') {
        return PredefinedMenuItem.new({ item: 'Separator' })
      }

      if (item.children && item.children.length > 0) {
        const subItems = await buildItems(item.children)
        return Submenu.new({
          text: item.label ?? '',
          items: subItems,
          enabled: !item.disabled,
        })
      }

      return MenuItem.new({
        text: item.label ?? '',
        enabled: !item.disabled,
        accelerator: item.shortcut,
        action: () => item.onSelect?.(),
      })
    }),
  )
}

/**
 * Show a native OS context menu at the current cursor position.
 *
 * Accepts either:
 *  - NativeMenuOption[][]   — groups separated by auto-inserted separators
 *  - NativeMenuOption[]     — flat list of items (no auto separators)
 */
export async function showContextMenu(
  groups: NativeMenuOption[][] | NativeMenuOption[],
): Promise<void> {
  if (groups.length === 0) return

  let items: NativeMenuOption[]

  if (Array.isArray(groups[0])) {
    // Grouped: insert separators between groups
    const flat: NativeMenuOption[] = []
    ;(groups as NativeMenuOption[][]).forEach((group, gi) => {
      if (gi > 0) flat.push({ type: 'separator' })
      flat.push(...group)
    })
    items = flat
  } else {
    items = groups as NativeMenuOption[]
  }

  const menuItems = await buildItems(items)
  const menu = await Menu.new({ items: menuItems })
  await menu.popup()
}
