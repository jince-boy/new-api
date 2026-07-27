package invoice_setting

import "github.com/QuantumNous/new-api/setting/config"

const (
	VATPeriodPerTransaction = "per_transaction"
	VATPeriodMonthly        = "monthly_special_case"

	TaxBurdenIncluded   = "included"
	TaxBurdenSupplement = "supplement_by_customer"
)

// InvoiceSetting describes invoice application eligibility and keeps legacy
// tax fields for compatibility with previously saved options. Tax supplements
// are reviewed by an administrator instead of being inferred from these fields.
type InvoiceSetting struct {
	Enabled                            bool    `json:"enabled"`
	PriceIncludesTax                   bool    `json:"price_includes_tax"`
	TaxBurdenMode                      string  `json:"tax_burden_mode"`
	MinimumAmount                      float64 `json:"minimum_amount"`
	ApplicationWindowDays              int     `json:"application_window_days"`
	Currency                           string  `json:"currency"`
	InvoiceItemName                    string  `json:"invoice_item_name"`
	VATPeriodMode                      string  `json:"vat_period_mode"`
	VATThresholdCents                  int64   `json:"vat_threshold_cents"`
	VATRateBasisPoints                 int     `json:"vat_rate_basis_points"`
	VATStandardRateBasisPoints         int     `json:"vat_standard_rate_basis_points"`
	VATPreferentialEndDate             string  `json:"vat_preferential_end_date"`
	UrbanMaintenanceTaxRateBasisPoints int     `json:"urban_maintenance_tax_rate_basis_points"`
	EducationSurchargeRateBasisPoints  int     `json:"education_surcharge_rate_basis_points"`
	LocalEducationRateBasisPoints      int     `json:"local_education_rate_basis_points"`
	SurchargeReliefBasisPoints         int     `json:"surcharge_relief_basis_points"`
	PITWithholdingEnabled              bool    `json:"pit_withholding_enabled"`
	PolicyEffectiveDate                string  `json:"policy_effective_date"`
	PolicyNotice                       string  `json:"policy_notice"`
	PolicySourceURLs                   string  `json:"policy_source_urls"`
}

var invoiceSetting = InvoiceSetting{
	Enabled:                            false,
	PriceIncludesTax:                   true,
	TaxBurdenMode:                      TaxBurdenIncluded,
	MinimumAmount:                      0,
	ApplicationWindowDays:              365,
	Currency:                           "CNY",
	InvoiceItemName:                    "AI Agent服务",
	VATPeriodMode:                      VATPeriodPerTransaction,
	VATThresholdCents:                  100_000,
	VATRateBasisPoints:                 100,
	VATStandardRateBasisPoints:         300,
	VATPreferentialEndDate:             "2027-12-31",
	UrbanMaintenanceTaxRateBasisPoints: 0,
	EducationSurchargeRateBasisPoints:  0,
	LocalEducationRateBasisPoints:      0,
	SurchargeReliefBasisPoints:         0,
	PITWithholdingEnabled:              false,
	PolicyEffectiveDate:                "2026-01-01",
	PolicyNotice:                       "发票项目和金额应与实际业务及订单一致；如需补税，由管理员根据实际开票结果确认。",
	PolicySourceURLs:                   "https://www.gov.cn/zhengce/2010-12/27/content_2602571.htm\nhttps://fgk.chinatax.gov.cn/zcfgk/c100011/c5195215/5195215/files/e8f018e817984b2dbf3b6a4f437411de.pdf\nhttps://www.ctaxnews.com.cn/zcjd/2026-02/02/content_1118200.html\nhttps://www.gov.cn/zhengce/content/2018-12/22/content_5351177.htm",
}

func init() {
	config.GlobalConfig.Register("invoice_setting", &invoiceSetting)
}

func GetInvoiceSetting() *InvoiceSetting {
	if invoiceSetting.InvoiceItemName == "技术服务费" {
		invoiceSetting.InvoiceItemName = "AI Agent服务"
	}
	return &invoiceSetting
}
