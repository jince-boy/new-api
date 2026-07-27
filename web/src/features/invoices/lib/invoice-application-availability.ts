export type InvoiceApplicationAvailability = {
  configEnabled?: boolean
  configLoading: boolean
  configError: boolean
  ordersLoading: boolean
  ordersError: boolean
  orderCount: number
}

export type InvoiceOrderSelectionState =
  | 'config_loading'
  | 'config_error'
  | 'disabled'
  | 'orders_loading'
  | 'orders_error'
  | 'empty'
  | 'ready'

export function getInvoiceOrderSelectionState(
  availability: InvoiceApplicationAvailability
): InvoiceOrderSelectionState {
  if (availability.configLoading) return 'config_loading'
  if (availability.configError) return 'config_error'
  if (!availability.configEnabled) return 'disabled'
  if (availability.ordersLoading) return 'orders_loading'
  if (availability.ordersError) return 'orders_error'
  if (availability.orderCount === 0) return 'empty'
  return 'ready'
}

export function canSubmitInvoiceApplication(
  availability: InvoiceApplicationAvailability,
  selectedOrderCount: number,
  submitting: boolean
): boolean {
  return (
    !submitting &&
    selectedOrderCount > 0 &&
    getInvoiceOrderSelectionState(availability) === 'ready'
  )
}
