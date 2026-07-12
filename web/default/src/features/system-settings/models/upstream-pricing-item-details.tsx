/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { Info } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'

import type { UpstreamPricingItem, UpstreamPricingTier } from '../types'
import { CapabilityList, ProviderMark } from './upstream-pricing-display'
import {
  formatContext,
  formatPrice,
  getProviderIdentity,
} from './upstream-pricing-utils'

function DetailField(props: { label: string; value: ReactNode }) {
  return (
    <div className='grid grid-cols-[104px_1fr] border-b text-[12px] last:border-b-0'>
      <div className='bg-muted/40 text-muted-foreground px-2.5 py-2'>
        {props.label}
      </div>
      <div className='min-w-0 px-2.5 py-2'>{props.value || '-'}</div>
    </div>
  )
}

function formatTierLabel(
  tier: UpstreamPricingTier,
  contextLabel: string,
  baseLabel: string,
  tierLabel: string
): string {
  if (!tier.condition) return baseLabel
  const threshold = Number(tier.condition.match(/\d+/)?.[0])
  if (Number.isFinite(threshold) && threshold > 0) {
    const prefix = tier.label.startsWith('tier_') ? `${tierLabel}: ` : ''
    return `${prefix}${contextLabel} > ${formatContext(threshold)}`
  }
  return tier.label
}

function TierCard(props: { tier: UpstreamPricingTier }) {
  const { t } = useTranslation()
  const entries = [
    ['Input', props.tier.input_price],
    ['Output', props.tier.output_price],
    ['Cache Read', props.tier.cache_read_price],
    ['Cache Write', props.tier.cache_write_price],
  ] as const

  return (
    <div className='rounded-md border p-3 text-[12px]'>
      <div className='mb-2 font-medium'>
        {formatTierLabel(
          props.tier,
          t('Context'),
          t('Base Price'),
          t('Tier')
        )}
      </div>
      <div className='grid gap-y-1.5'>
        {entries.map(([label, value]) => (
          <div key={label} className='grid grid-cols-[72px_1fr] gap-3'>
            <span className='text-muted-foreground'>{t(label)}</span>
            <span className='font-mono'>{formatPrice(value)} / 1M tokens</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function UpstreamPricingItemDetails(props: {
  item: UpstreamPricingItem
}) {
  const { t } = useTranslation()
  const provider = getProviderIdentity(props.item)
  const capabilities = props.item.capabilities || []
  const modalities = [
    ...(props.item.input_modalities || []).map(
      (value) => `${t('Input')}: ${value}`
    ),
    ...(props.item.output_modalities || []).map(
      (value) => `${t('Output')}: ${value}`
    ),
  ]

  return (
    <Dialog
      title={props.item.model_name}
      trigger={
        <Button
          type='button'
          variant='ghost'
          size='sm'
          className='h-7 px-2 text-[12px]'
        >
          <Info data-icon='inline-start' />
          {t('Details')}
        </Button>
      }
      contentClassName='sm:max-w-4xl'
      titleClassName='text-sm'
      bodyClassName='space-y-4 text-[12px]'
    >
      <div className='overflow-hidden rounded-md border'>
        <DetailField
          label={t('Model')}
          value={props.item.model_id || props.item.model_name}
        />
        <DetailField
          label={t('Provider')}
          value={
            <ProviderMark
              iconKey={provider.iconKey}
              name={provider.name}
              providerId={props.item.provider_id}
            />
          }
        />
        <DetailField
          label={t('Capabilities')}
          value={<CapabilityList capabilities={capabilities} />}
        />
        <DetailField label={t('Modalities')} value={modalities.join(', ')} />
        <DetailField label={t('Description')} value={props.item.description} />
        <DetailField label={t('Published')} value={props.item.release_date} />
        <DetailField label={t('Updated')} value={props.item.last_updated} />
        <DetailField label={t('Knowledge cutoff')} value={props.item.knowledge} />
        <DetailField
          label={t('Context')}
          value={[
            formatContext(props.item.context),
            `${t('Input')} ${formatContext(props.item.input_limit)}`,
            `${t('Output')} ${formatContext(props.item.output_limit)}`,
          ].join(' / ')}
        />
      </div>

      {props.item.tiers && props.item.tiers.length > 0 && (
        <div>
          <div className='mb-2 text-[12px] font-medium'>
            {t('Billing Details')}
          </div>
          <div className='grid gap-2 md:grid-cols-2'>
            {props.item.tiers.map((tier) => (
              <TierCard
                key={`${tier.label}-${tier.condition ?? 'base'}`}
                tier={tier}
              />
            ))}
          </div>
        </div>
      )}

      {props.item.billing_expr && (
        <details className='rounded-md border p-3'>
          <summary className='cursor-pointer text-[12px] font-medium'>
            {t('Raw expression')}
          </summary>
          <code className='bg-muted mt-2 block rounded-md p-2 text-[11px] break-all'>
            {props.item.billing_expr}
          </code>
        </details>
      )}
    </Dialog>
  )
}
