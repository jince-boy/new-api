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
import { Loader2 } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  formatQuota,
  parseQuotaFromDollars,
  quotaUnitsToDollars,
} from '@/lib/format'
import {
  DEFAULT_CURRENCY_CONFIG,
  useSystemConfigStore,
} from '@/stores/system-config-store'

interface TransferDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (amount: number) => Promise<boolean>
  availableQuota: number
  transferring: boolean
  minTransferQuota?: number
}

export function TransferDialog({
  open,
  onOpenChange,
  onConfirm,
  availableQuota,
  transferring,
  minTransferQuota = 0,
}: TransferDialogProps) {
  const { t } = useTranslation()
  const currencyConfig = useSystemConfigStore(
    (state) => state.config.currency
  )
  const defaultMinimumQuota = Math.ceil(
    currencyConfig.quotaPerUnit > 0
      ? currencyConfig.quotaPerUnit
      : DEFAULT_CURRENCY_CONFIG.quotaPerUnit
  )
  const effectiveMinTransferQuota =
    minTransferQuota > 0 ? minTransferQuota : defaultMinimumQuota
  const minimumAmount = quotaUnitsToDollars(effectiveMinTransferQuota)
  const maximumAmount = quotaUnitsToDollars(availableQuota)
  const [amount, setAmount] = useState(minimumAmount)
  const transferQuota = parseQuotaFromDollars(amount)
  const canTransfer =
    Number.isFinite(amount) &&
    transferQuota >= effectiveMinTransferQuota &&
    transferQuota <= availableQuota

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAmount(Math.min(maximumAmount, minimumAmount))
    }
  }, [maximumAmount, minimumAmount, open])

  const handleConfirm = async () => {
    if (!canTransfer) return

    const success = await onConfirm(transferQuota)
    if (success) {
      onOpenChange(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('Transfer Rewards')}
      description={t('Move affiliate rewards to your main balance')}
      contentClassName='max-sm:w-[calc(100vw-1.5rem)] sm:max-w-md'
      titleClassName='text-xl font-semibold'
      footerClassName='grid grid-cols-2 gap-2 sm:flex'
      contentHeight='auto'
      bodyClassName='space-y-4'
      footer={
        <>
          <Button
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={transferring}
          >
            {t('Cancel')}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={transferring || !canTransfer}
          >
            {transferring && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            {t('Transfer')}
          </Button>
        </>
      }
    >
      <div className='flex flex-col gap-4 py-3 sm:gap-6 sm:py-4'>
        <div className='flex flex-col gap-2'>
          <Label className='text-muted-foreground text-xs font-medium tracking-wider uppercase'>
            {t('Available Rewards')}
          </Label>
          <div className='text-2xl font-semibold'>
            {formatQuota(availableQuota)}
          </div>
        </div>

        <div className='flex flex-col gap-3'>
          <Label
            htmlFor='transfer-amount'
            className='text-muted-foreground text-xs font-medium tracking-wider uppercase'
          >
            {t('Transfer Amount')}
          </Label>
          <Input
            id='transfer-amount'
            type='number'
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            min={minimumAmount}
            max={maximumAmount}
            step={0.000001}
            className='font-mono text-lg'
          />
          <div className='flex items-center justify-between gap-3'>
            <p className='text-muted-foreground text-xs'>
              {t('Minimum:')} {formatQuota(effectiveMinTransferQuota)}
            </p>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => setAmount(maximumAmount)}
              disabled={transferring || availableQuota <= 0}
            >
              {t('Transfer All')}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  )
}
