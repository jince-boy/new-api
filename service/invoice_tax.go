package service

import (
	"errors"
	"math"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/setting/invoice_setting"
	"github.com/shopspring/decimal"
)

type InvoiceTaxEstimate struct {
	OrderAmountCents                 int64  `json:"order_amount_cents"`
	TaxableSalesCents                int64  `json:"taxable_sales_cents"`
	VATExemptByThreshold             bool   `json:"vat_exempt_by_threshold"`
	EstimatedVATCents                int64  `json:"estimated_vat_cents"`
	EstimatedUrbanTaxCents           int64  `json:"estimated_urban_tax_cents"`
	EstimatedEducationSurchargeCents int64  `json:"estimated_education_surcharge_cents"`
	EstimatedLocalEducationCents     int64  `json:"estimated_local_education_surcharge_cents"`
	EstimatedPITWithholdingCents     int64  `json:"estimated_pit_withholding_cents"`
	EstimatedTotalTaxCents           int64  `json:"estimated_total_tax_cents"`
	SuggestedSupplementCents         int64  `json:"suggested_supplement_cents"`
	CalculationDate                  string `json:"calculation_date"`
}

func validateInvoiceSetting(setting *invoice_setting.InvoiceSetting) error {
	if setting == nil {
		return errors.New("invoice rules are unavailable")
	}
	if math.IsNaN(setting.MinimumAmount) || math.IsInf(setting.MinimumAmount, 0) || setting.MinimumAmount < 0 || setting.MinimumAmount > 1_000_000_000 || setting.ApplicationWindowDays < 0 || setting.ApplicationWindowDays > 3650 {
		return errors.New("invoice amount or application window is invalid")
	}
	if setting.TaxBurdenMode != invoice_setting.TaxBurdenIncluded && setting.TaxBurdenMode != invoice_setting.TaxBurdenSupplement {
		return errors.New("invoice tax burden mode is invalid")
	}
	if setting.VATThresholdCents < 0 || setting.VATThresholdCents > maxInvoiceAmountCents {
		return errors.New("invoice VAT threshold is invalid")
	}
	rates := []int{
		setting.VATRateBasisPoints,
		setting.VATStandardRateBasisPoints,
		setting.UrbanMaintenanceTaxRateBasisPoints,
		setting.EducationSurchargeRateBasisPoints,
		setting.LocalEducationRateBasisPoints,
		setting.SurchargeReliefBasisPoints,
	}
	for _, rate := range rates {
		if rate < 0 || rate > 10_000 {
			return errors.New("invoice tax rate must be between 0 and 100 percent")
		}
	}
	if strings.ToUpper(strings.TrimSpace(setting.Currency)) != "CNY" {
		return errors.New("invoice currency must be CNY for mainland China tax estimates")
	}
	if strings.TrimSpace(setting.InvoiceItemName) == "" || len(setting.InvoiceItemName) > 255 {
		return errors.New("invoice item name is required")
	}
	return nil
}

func roundBasisPoints(amountCents int64, basisPoints int) int64 {
	if amountCents <= 0 || basisPoints <= 0 {
		return 0
	}
	return decimal.NewFromInt(amountCents).
		Mul(decimal.NewFromInt(int64(basisPoints))).
		Div(decimal.NewFromInt(10_000)).
		Round(0).
		IntPart()
}

type invoiceTaxComponents struct {
	taxableSales   int64
	vatExempt      bool
	vat            int64
	urban          int64
	education      int64
	localEducation int64
	pit            int64
	total          int64
}

func calculateInvoiceTaxComponents(priceCents int64, priceIncludesTax bool, vatRate int, setting invoice_setting.InvoiceSetting) invoiceTaxComponents {
	taxableSales := priceCents
	if priceIncludesTax && vatRate > 0 {
		taxableSales = decimal.NewFromInt(priceCents).
			Mul(decimal.NewFromInt(10_000)).
			Div(decimal.NewFromInt(int64(10_000 + vatRate))).
			Round(0).
			IntPart()
	}

	vatExempt := taxableSales < setting.VATThresholdCents
	vat := int64(0)
	if !vatExempt {
		if priceIncludesTax {
			vat = priceCents - taxableSales
		} else {
			vat = roundBasisPoints(taxableSales, vatRate)
		}
	}

	reliefMultiplier := 10_000 - setting.SurchargeReliefBasisPoints
	urban := roundBasisPoints(roundBasisPoints(vat, setting.UrbanMaintenanceTaxRateBasisPoints), reliefMultiplier)
	education := roundBasisPoints(roundBasisPoints(vat, setting.EducationSurchargeRateBasisPoints), reliefMultiplier)
	localEducation := roundBasisPoints(roundBasisPoints(vat, setting.LocalEducationRateBasisPoints), reliefMultiplier)

	pit := int64(0)
	if setting.PITWithholdingEnabled {
		pitIncome := priceCents
		if priceIncludesTax {
			pitIncome -= vat
		}
		taxableIncome := int64(0)
		if pitIncome <= 400_000 {
			taxableIncome = pitIncome - 80_000
			if taxableIncome < 0 {
				taxableIncome = 0
			}
		} else {
			taxableIncome = roundBasisPoints(pitIncome, 8_000)
		}
		switch {
		case taxableIncome <= 2_000_000:
			pit = roundBasisPoints(taxableIncome, 2_000)
		case taxableIncome <= 5_000_000:
			pit = roundBasisPoints(taxableIncome, 3_000) - 200_000
		default:
			pit = roundBasisPoints(taxableIncome, 4_000) - 700_000
		}
		if pit < 0 {
			pit = 0
		}
	}

	return invoiceTaxComponents{
		taxableSales:   taxableSales,
		vatExempt:      vatExempt,
		vat:            vat,
		urban:          urban,
		education:      education,
		localEducation: localEducation,
		pit:            pit,
		total:          vat + urban + education + localEducation + pit,
	}
}

func grossUpInvoiceTaxes(netAmountCents int64, vatRate int, setting invoice_setting.InvoiceSetting) (int64, invoiceTaxComponents, error) {
	grossAmountCents := netAmountCents
	for range 256 {
		components := calculateInvoiceTaxComponents(grossAmountCents, true, vatRate, setting)
		if components.total < 0 || components.total > maxInvoiceAmountCents-netAmountCents {
			return 0, invoiceTaxComponents{}, errors.New("invoice tax gross-up exceeds the supported amount")
		}
		nextGrossAmountCents := netAmountCents + components.total
		if nextGrossAmountCents == grossAmountCents {
			return grossAmountCents, components, nil
		}
		if nextGrossAmountCents < grossAmountCents {
			return 0, invoiceTaxComponents{}, errors.New("invoice tax gross-up did not converge")
		}
		grossAmountCents = nextGrossAmountCents
	}
	return 0, invoiceTaxComponents{}, errors.New("invoice tax gross-up did not converge")
}

func CalculateInvoiceTax(orderAmountCents int64, setting invoice_setting.InvoiceSetting, calculationTime time.Time) (InvoiceTaxEstimate, error) {
	if orderAmountCents <= 0 || orderAmountCents > maxInvoiceAmountCents {
		return InvoiceTaxEstimate{}, errors.New("invoice order amount is invalid")
	}
	if err := validateInvoiceSetting(&setting); err != nil {
		return InvoiceTaxEstimate{}, err
	}

	vatRate := setting.VATRateBasisPoints
	if setting.VATPreferentialEndDate != "" {
		endDate, err := time.ParseInLocation("2006-01-02", setting.VATPreferentialEndDate, calculationTime.Location())
		if err != nil {
			return InvoiceTaxEstimate{}, errors.New("VAT preferential end date is invalid")
		}
		if calculationTime.After(endDate.Add(24*time.Hour - time.Nanosecond)) {
			vatRate = setting.VATStandardRateBasisPoints
		}
	}

	priceIncludesTax := setting.TaxBurdenMode == invoice_setting.TaxBurdenIncluded
	components := calculateInvoiceTaxComponents(orderAmountCents, priceIncludesTax, vatRate, setting)
	suggestedSupplement := int64(0)
	if setting.TaxBurdenMode == invoice_setting.TaxBurdenSupplement {
		grossAmountCents, grossedUpComponents, err := grossUpInvoiceTaxes(orderAmountCents, vatRate, setting)
		if err != nil {
			return InvoiceTaxEstimate{}, err
		}
		components = grossedUpComponents
		suggestedSupplement = grossAmountCents - orderAmountCents
	}

	return InvoiceTaxEstimate{
		OrderAmountCents:                 orderAmountCents,
		TaxableSalesCents:                components.taxableSales,
		VATExemptByThreshold:             components.vatExempt,
		EstimatedVATCents:                components.vat,
		EstimatedUrbanTaxCents:           components.urban,
		EstimatedEducationSurchargeCents: components.education,
		EstimatedLocalEducationCents:     components.localEducation,
		EstimatedPITWithholdingCents:     components.pit,
		EstimatedTotalTaxCents:           components.total,
		SuggestedSupplementCents:         suggestedSupplement,
		CalculationDate:                  calculationTime.Format("2006-01-02"),
	}, nil
}
