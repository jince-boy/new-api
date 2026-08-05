import assert from 'node:assert/strict'
import { after, describe, test } from 'node:test'

import { Window } from 'happy-dom'

const domWindow = new Window()
for (const key of [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLInputElement',
  'Node',
  'Element',
  'Event',
  'CustomEvent',
  'MouseEvent',
  'PointerEvent',
  'customElements',
  'MutationObserver',
  'ResizeObserver',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
  'matchMedia',
] as const) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: domWindow[key],
  })
}

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { GroupRatioVisualEditor } = await import('../group-ratio-visual-editor')

const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

describe('GroupRatioVisualEditor service group visibility', () => {
  after(() => {
    domWindow.close()
  })

  test('preserves a service group description after hiding and showing it again', async () => {
    const i18n = createInstance()
    await i18n.use(initReactI18next).init({
      lng: 'en',
      resources: { en: { translation: {} } },
    })
    const container = document.createElement('div')
    document.body.append(container)
    let root = createRoot(container)
    const changes: Record<string, string> = {}

    const renderEditor = async (
      userUsableGroups: string,
      groupDescriptions: string
    ) => {
      await act(async () => {
        root.render(
          <I18nextProvider i18n={i18n}>
            <GroupRatioVisualEditor
              groupRatio='{"codex":1}'
              topupGroupRatio='{}'
              userGroups='{"vip":"VIP users"}'
              groupDescriptions={groupDescriptions}
              userUsableGroups={userUsableGroups}
              groupGroupRatio='{}'
              autoGroups='[]'
              maxTokenAutoGroupsField={<div />}
              groupSpecialUsableGroup='{}'
              onChange={(field, value) => {
                changes[field] = value
              }}
            />
          </I18nextProvider>
        )
      })
    }

    await renderEditor('{"codex":"Codex access"}', '{"codex":"Codex access"}')
    const checkbox = container.querySelector<HTMLElement>(
      '[aria-label="Visible and selectable"]'
    )
    assert.ok(checkbox)
    await act(async () => checkbox.click())

    assert.deepEqual(JSON.parse(changes.UserUsableGroups), {})
    assert.deepEqual(JSON.parse(changes.GroupDescriptions), {
      codex: 'Codex access',
    })

    await act(async () => root.unmount())
    root = createRoot(container)
    await renderEditor(changes.UserUsableGroups, changes.GroupDescriptions)

    const descriptionInput = container.querySelector<HTMLInputElement>(
      'input[placeholder="Service group description"]'
    )
    assert.equal(descriptionInput?.value, 'Codex access')

    const restoredCheckbox = container.querySelector<HTMLElement>(
      '[aria-label="Visible and selectable"]'
    )
    assert.ok(restoredCheckbox)
    await act(async () => restoredCheckbox.click())
    assert.deepEqual(JSON.parse(changes.UserUsableGroups), {
      codex: 'Codex access',
    })

    await act(async () => root.unmount())
    container.remove()
  })
})
