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
import { SettingsPage } from '../components/settings-page'
import type { BillingSettings } from '../types'
import {
  BILLING_DEFAULT_SECTION,
  getBillingSectionContent,
  getBillingSectionMeta,
} from './section-registry.tsx'

const defaultBillingSettings: BillingSettings = {
  QuotaForNewUser: 0,
  PreConsumedQuota: 0,
  QuotaForInviter: 0,
  QuotaForInvitee: 0,
  InviterRewardType: '',
  InviterRewardValue: 0,
  MinAffTransferQuota: 0,
  TopUpLink: '',
  'quota_setting.enable_free_model_pre_consume': true,
  QuotaPerUnit: 500000,
  USDExchangeRate: 7,
  'general_setting.quota_display_type': 'USD',
  'general_setting.custom_currency_symbol': '¤',
  'general_setting.custom_currency_exchange_rate': 1,
  DisplayInCurrencyEnabled: true,
  DisplayTokenStatEnabled: true,
  ModelPrice: '',
  ModelRatio: '',
  CacheRatio: '',
  CreateCacheRatio: '',
  CompletionRatio: '',
  ImageRatio: '',
  AudioRatio: '',
  AudioCompletionRatio: '',
  ExposeRatioEnabled: false,
  'billing_setting.billing_mode': '{}',
  'billing_setting.billing_expr': '{}',
  'tool_price_setting.prices': '{}',
  TopupGroupRatio: '',
  GroupRatio: '',
  UserUsableGroups: '',
  GroupGroupRatio: '',
  AutoGroups: '',
  DefaultUseAutoGroup: false,
  'group_ratio_setting.group_special_usable_group': '{}',
  PayAddress: '',
  EpayId: '',
  EpayKey: '',
  Price: 7.3,
  MinTopUp: 1,
  CustomCallbackAddress: '',
  PayMethods: '',
  'payment_setting.amount_options': '',
  'payment_setting.amount_discount': '',
  'payment_setting.compliance_confirmed': false,
  'payment_setting.compliance_terms_version': '',
  'payment_setting.compliance_confirmed_at': 0,
  'payment_setting.compliance_confirmed_by': 0,
  'payment_setting.compliance_confirmed_ip': '',
  StripeApiSecret: '',
  StripeWebhookSecret: '',
  StripePriceId: '',
  StripeUnitPrice: 8.0,
  StripeMinTopUp: 1,
  StripePromotionCodesEnabled: false,
  CreemApiKey: '',
  CreemWebhookSecret: '',
  CreemTestMode: false,
  CreemProducts: '[]',
  WaffoEnabled: false,
  WaffoApiKey: '',
  WaffoPrivateKey: '',
  WaffoPublicCert: '',
  WaffoSandboxPublicCert: '',
  WaffoSandboxApiKey: '',
  WaffoSandboxPrivateKey: '',
  WaffoSandbox: false,
  WaffoMerchantId: '',
  WaffoCurrency: 'USD',
  WaffoUnitPrice: 1,
  WaffoMinTopUp: 1,
  WaffoNotifyUrl: '',
  WaffoReturnUrl: '',
  WaffoPayMethods: '[]',
  WaffoPancakeMerchantID: '',
  WaffoPancakePrivateKey: '',
  WaffoPancakeReturnURL: '',
  WaffoPancakeStoreID: '',
  WaffoPancakeProductID: '',
  'checkin_setting.enabled': false,
  'checkin_setting.min_quota': 1000,
  'checkin_setting.max_quota': 10000,
  'invoice_setting.enabled': false,
  'invoice_setting.price_includes_tax': true,
  'invoice_setting.tax_burden_mode': 'included',
  'invoice_setting.minimum_amount': 0,
  'invoice_setting.application_window_days': 365,
  'invoice_setting.currency': 'CNY',
  'invoice_setting.invoice_item_name': '技术服务费',
  'invoice_setting.vat_period_mode': 'per_transaction',
  'invoice_setting.vat_threshold_cents': 100000,
  'invoice_setting.vat_rate_basis_points': 100,
  'invoice_setting.vat_standard_rate_basis_points': 300,
  'invoice_setting.vat_preferential_end_date': '2027-12-31',
  'invoice_setting.urban_maintenance_tax_rate_basis_points': 700,
  'invoice_setting.education_surcharge_rate_basis_points': 300,
  'invoice_setting.local_education_rate_basis_points': 200,
  'invoice_setting.surcharge_relief_basis_points': 5000,
  'invoice_setting.pit_withholding_enabled': true,
  'invoice_setting.policy_effective_date': '2026-01-01',
  'invoice_setting.policy_notice':
    '系统金额仅为个人向企业提供技术服务场景下的税费预估，不是最终纳税结论。个人所得税按劳务报酬预扣口径展示，但不自动计入客户补款；实际税额、纳税地点、按次或按月口径及开票资格，以主管税务机关、扣缴申报和完税凭证为准，管理员开票前必须复核。',
  'invoice_setting.policy_source_urls':
    'https://www.gov.cn/zhengce/2010-12/27/content_2602571.htm\nhttps://fgk.chinatax.gov.cn/zcfgk/c100011/c5195215/5195215/files/e8f018e817984b2dbf3b6a4f437411de.pdf\nhttps://www.ctaxnews.com.cn/zcjd/2026-02/02/content_1118200.html\nhttps://www.gov.cn/zhengce/content/2018-12/22/content_5351177.htm',
}

export function BillingSettings() {
  return (
    <SettingsPage
      routePath='/_authenticated/system-settings/billing/$section'
      defaultSettings={defaultBillingSettings}
      defaultSection={BILLING_DEFAULT_SECTION}
      getSectionContent={getBillingSectionContent}
      getSectionMeta={getBillingSectionMeta}
    />
  )
}
