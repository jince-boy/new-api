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

describe('GroupRatioVisualEditor virtual Auto group', () => {
  after(() => {
    domWindow.close()
  })

  test('keeps Auto selectable without serializing it as a priced service group', async () => {
    const i18n = createInstance()
    await i18n.use(initReactI18next).init({
      lng: 'en',
      resources: { en: { translation: {} } },
    })
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const changes: Record<string, string> = {}

    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <GroupRatioVisualEditor
            groupRatio='{"codex":1}'
            topupGroupRatio='{}'
            userGroups='{"vip":"VIP users"}'
            groupDescriptions='{"codex":"Codex","auto":"Auto"}'
            userUsableGroups='{"codex":"Codex","auto":"Auto"}'
            groupGroupRatio='{}'
            autoGroups='["codex"]'
            maxTokenAutoGroupsField={<div />}
            groupSpecialUsableGroup='{}'
            onChange={(field, value) => {
              changes[field] = value
            }}
          />
        </I18nextProvider>
      )
    })

    const serviceGroupInputs = container.querySelectorAll<HTMLInputElement>(
      'input[aria-label="Service group name"]'
    )
    assert.equal(serviceGroupInputs.length, 1)
    assert.equal(serviceGroupInputs[0]?.value, 'codex')

    const serviceGroupVisibility = container.querySelector<HTMLElement>(
      '[aria-label="Visible and selectable"]'
    )
    assert.ok(serviceGroupVisibility)
    await act(async () => serviceGroupVisibility.click())

    assert.deepEqual(JSON.parse(changes.GroupRatio), { codex: 1 })
    assert.deepEqual(JSON.parse(changes.UserUsableGroups), { auto: 'Auto' })
    assert.deepEqual(JSON.parse(changes.GroupDescriptions), {
      codex: 'Codex',
      auto: 'Auto',
    })

    await act(async () => root.unmount())
    container.remove()
  })

  test('enables Auto independently from priced service groups', async () => {
    const i18n = createInstance()
    await i18n.use(initReactI18next).init({
      lng: 'en',
      resources: { en: { translation: {} } },
    })
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const changes: Record<string, string> = {}

    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <GroupRatioVisualEditor
            groupRatio='{"codex":1}'
            topupGroupRatio='{}'
            userGroups='{"vip":"VIP users"}'
            groupDescriptions='{"codex":"Codex"}'
            userUsableGroups='{"codex":"Codex"}'
            groupGroupRatio='{}'
            autoGroups='["codex"]'
            maxTokenAutoGroupsField={<div />}
            groupSpecialUsableGroup='{}'
            onChange={(field, value) => {
              changes[field] = value
            }}
          />
        </I18nextProvider>
      )
    })

    const autoToggle = container.querySelector<HTMLElement>(
      '[aria-label="Allow users to select Auto"]'
    )
    assert.ok(autoToggle)
    await act(async () => autoToggle.click())

    assert.deepEqual(JSON.parse(changes.UserUsableGroups), {
      codex: 'Codex',
      auto: 'Auto',
    })
    assert.deepEqual(JSON.parse(changes.GroupDescriptions), {
      codex: 'Codex',
      auto: 'Auto',
    })
    assert.equal(changes.GroupRatio, undefined)

    await act(async () => root.unmount())
    container.remove()
  })
})
