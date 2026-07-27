package service

import (
	"errors"
	"fmt"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/invoice_setting"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

const maxInvoiceOrdersPerApplication = 100
const maxInvoiceAmountCents = int64(100_000_000_000)
const InvoiceFileMaxBytes = int64(20 << 20)

var invoiceFileContentTypes = map[string]string{
	"application/pdf": ".pdf",
	"image/jpeg":      ".jpg",
	"image/png":       ".png",
}

type InvoiceTaxEstimate struct {
	OrderAmountCents                 int64  `json:"order_amount_cents"`
	TaxableSalesCents                int64  `json:"taxable_sales_cents"`
	VATThresholdCents                int64  `json:"vat_threshold_cents"`
	VATRateBasisPoints               int    `json:"vat_rate_basis_points"`
	VATExemptByThreshold             bool   `json:"vat_exempt_by_threshold"`
	EstimatedVATCents                int64  `json:"estimated_vat_cents"`
	EstimatedUrbanTaxCents           int64  `json:"estimated_urban_tax_cents"`
	EstimatedEducationSurchargeCents int64  `json:"estimated_education_surcharge_cents"`
	EstimatedLocalEducationCents     int64  `json:"estimated_local_education_surcharge_cents"`
	EstimatedPITWithholdingCents     int64  `json:"estimated_pit_withholding_cents"`
	EstimatedTotalTaxCents           int64  `json:"estimated_total_tax_cents"`
	SuggestedSupplementCents         int64  `json:"suggested_supplement_cents"`
	PITIncludedInSuggestedSupplement bool   `json:"pit_included_in_suggested_supplement"`
	CalculationDate                  string `json:"calculation_date"`
	Notice                           string `json:"notice"`
}

type InvoicePublicConfig struct {
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

type CreateInvoiceApplicationInput struct {
	TopUpIds       []int
	InvoiceTitle   string
	TaxNumber      string
	CompanyAddress string
	CompanyPhone   string
	BankName       string
	BankAccount    string
	RecipientEmail string
	ApplicantNote  string
}

type InvoiceDownload struct {
	Path        string
	FileName    string
	ContentType string
}

func GetInvoiceConfig() InvoicePublicConfig {
	setting := invoice_setting.GetInvoiceSetting()
	return InvoicePublicConfig{
		Enabled:                            setting.Enabled,
		PriceIncludesTax:                   setting.PriceIncludesTax,
		TaxBurdenMode:                      setting.TaxBurdenMode,
		MinimumAmount:                      setting.MinimumAmount,
		ApplicationWindowDays:              setting.ApplicationWindowDays,
		Currency:                           setting.Currency,
		InvoiceItemName:                    setting.InvoiceItemName,
		VATPeriodMode:                      setting.VATPeriodMode,
		VATThresholdCents:                  setting.VATThresholdCents,
		VATRateBasisPoints:                 setting.VATRateBasisPoints,
		VATStandardRateBasisPoints:         setting.VATStandardRateBasisPoints,
		VATPreferentialEndDate:             setting.VATPreferentialEndDate,
		UrbanMaintenanceTaxRateBasisPoints: setting.UrbanMaintenanceTaxRateBasisPoints,
		EducationSurchargeRateBasisPoints:  setting.EducationSurchargeRateBasisPoints,
		LocalEducationRateBasisPoints:      setting.LocalEducationRateBasisPoints,
		SurchargeReliefBasisPoints:         setting.SurchargeReliefBasisPoints,
		PITWithholdingEnabled:              setting.PITWithholdingEnabled,
		PolicyEffectiveDate:                setting.PolicyEffectiveDate,
		PolicyNotice:                       setting.PolicyNotice,
		PolicySourceURLs:                   setting.PolicySourceURLs,
	}
}

func ListInvoiceApplications(userId int, status string, keyword string, pageInfo *common.PageInfo) ([]*model.InvoiceApplication, int64, error) {
	return model.ListInvoiceApplications(userId, status, keyword, pageInfo)
}

func GetInvoiceApplication(applicationId int, userId int) (*model.InvoiceApplication, error) {
	return model.GetInvoiceApplication(applicationId, userId)
}

func validateInvoiceSetting(setting *invoice_setting.InvoiceSetting) error {
	if setting == nil {
		return errors.New("invoice rules are unavailable")
	}
	if math.IsNaN(setting.MinimumAmount) || math.IsInf(setting.MinimumAmount, 0) || setting.MinimumAmount < 0 || setting.MinimumAmount > 1_000_000_000 || setting.ApplicationWindowDays < 0 || setting.ApplicationWindowDays > 3650 {
		return errors.New("invoice amount or application window is invalid")
	}
	if setting.VATPeriodMode != invoice_setting.VATPeriodPerTransaction && setting.VATPeriodMode != invoice_setting.VATPeriodMonthly {
		return errors.New("invoice VAT period mode is invalid")
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
	currency := strings.ToUpper(strings.TrimSpace(setting.Currency))
	if currency != "CNY" {
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

	taxableSales := orderAmountCents
	if setting.PriceIncludesTax && vatRate > 0 {
		taxableSales = decimal.NewFromInt(orderAmountCents).
			Mul(decimal.NewFromInt(10_000)).
			Div(decimal.NewFromInt(int64(10_000 + vatRate))).
			Round(0).
			IntPart()
	}
	vatExempt := taxableSales < setting.VATThresholdCents
	vat := int64(0)
	if !vatExempt {
		if setting.PriceIncludesTax {
			vat = orderAmountCents - taxableSales
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
		pitIncome := orderAmountCents
		if setting.PriceIncludesTax {
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

	estimatedTotal := vat + urban + education + localEducation + pit
	suggestedSupplement := int64(0)
	if !setting.PriceIncludesTax && setting.TaxBurdenMode == invoice_setting.TaxBurdenSupplement {
		// PIT is a withholding estimate for the individual and is deliberately
		// excluded here: grossing it up changes the taxable income recursively.
		suggestedSupplement = vat + urban + education + localEducation
	}

	return InvoiceTaxEstimate{
		OrderAmountCents:                 orderAmountCents,
		TaxableSalesCents:                taxableSales,
		VATThresholdCents:                setting.VATThresholdCents,
		VATRateBasisPoints:               vatRate,
		VATExemptByThreshold:             vatExempt,
		EstimatedVATCents:                vat,
		EstimatedUrbanTaxCents:           urban,
		EstimatedEducationSurchargeCents: education,
		EstimatedLocalEducationCents:     localEducation,
		EstimatedPITWithholdingCents:     pit,
		EstimatedTotalTaxCents:           estimatedTotal,
		SuggestedSupplementCents:         suggestedSupplement,
		PITIncludedInSuggestedSupplement: false,
		CalculationDate:                  calculationTime.Format("2006-01-02"),
		Notice:                           setting.PolicyNotice,
	}, nil
}

func ListEligibleInvoiceOrders(userId int) ([]model.TopUp, error) {
	setting := invoice_setting.GetInvoiceSetting()
	if !setting.Enabled {
		return []model.TopUp{}, nil
	}

	query := model.DB.Where("user_id = ? AND status = ? AND money > ?", userId, common.TopUpStatusSuccess, 0)
	if setting.ApplicationWindowDays > 0 {
		cutoff := time.Now().AddDate(0, 0, -setting.ApplicationWindowDays).Unix()
		query = query.Where("CASE WHEN complete_time > 0 THEN complete_time ELSE create_time END >= ?", cutoff)
	}

	var topUps []model.TopUp
	if err := query.Order("id desc").Limit(500).Find(&topUps).Error; err != nil {
		return nil, err
	}
	if len(topUps) == 0 {
		return topUps, nil
	}

	topUpIds := make([]int, 0, len(topUps))
	for _, topUp := range topUps {
		topUpIds = append(topUpIds, topUp.Id)
	}
	var usedIds []int
	if err := model.DB.Model(&model.InvoiceOrder{}).Where("top_up_id IN ?", topUpIds).Pluck("top_up_id", &usedIds).Error; err != nil {
		return nil, err
	}
	used := make(map[int]struct{}, len(usedIds))
	for _, id := range usedIds {
		used[id] = struct{}{}
	}
	eligible := make([]model.TopUp, 0, len(topUps))
	for _, topUp := range topUps {
		if _, exists := used[topUp.Id]; !exists {
			eligible = append(eligible, topUp)
		}
	}
	return eligible, nil
}

func CreateInvoiceApplication(userId int, input CreateInvoiceApplicationInput) (*model.InvoiceApplication, error) {
	setting := invoice_setting.GetInvoiceSetting()
	if !setting.Enabled {
		return nil, errors.New("invoice applications are disabled")
	}
	if err := validateInvoiceSetting(setting); err != nil {
		return nil, err
	}
	if len(input.TopUpIds) == 0 || len(input.TopUpIds) > maxInvoiceOrdersPerApplication {
		return nil, fmt.Errorf("select between 1 and %d paid orders", maxInvoiceOrdersPerApplication)
	}
	applicantNote := strings.TrimSpace(input.ApplicantNote)
	if len([]rune(applicantNote)) > 2000 {
		return nil, errors.New("invoice application note must be 2000 characters or fewer")
	}

	uniqueIds := make([]int, 0, len(input.TopUpIds))
	seen := make(map[int]struct{}, len(input.TopUpIds))
	for _, id := range input.TopUpIds {
		if id <= 0 {
			return nil, errors.New("invalid paid order")
		}
		if _, exists := seen[id]; exists {
			continue
		}
		seen[id] = struct{}{}
		uniqueIds = append(uniqueIds, id)
	}

	var created model.InvoiceApplication
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		var topUps []model.TopUp
		if err := tx.Where("id IN ? AND user_id = ? AND status = ? AND money > ?", uniqueIds, userId, common.TopUpStatusSuccess, 0).
			Order("id asc").Find(&topUps).Error; err != nil {
			return err
		}
		if len(topUps) != len(uniqueIds) {
			return errors.New("one or more paid orders are invalid")
		}

		if setting.ApplicationWindowDays > 0 {
			cutoff := time.Now().AddDate(0, 0, -setting.ApplicationWindowDays).Unix()
			for _, topUp := range topUps {
				completedAt := topUp.CompleteTime
				if completedAt <= 0 {
					completedAt = topUp.CreateTime
				}
				if completedAt < cutoff {
					return errors.New("one or more paid orders are outside the invoice application window")
				}
			}
		}

		var existing int64
		if err := tx.Model(&model.InvoiceOrder{}).Where("top_up_id IN ?", uniqueIds).Count(&existing).Error; err != nil {
			return err
		}
		if existing > 0 {
			return errors.New("one or more paid orders already have an invoice application")
		}

		var totalCents int64
		orders := make([]model.InvoiceOrder, 0, len(topUps))
		for _, topUp := range topUps {
			if math.IsNaN(topUp.Money) || math.IsInf(topUp.Money, 0) || topUp.Money <= 0 {
				return errors.New("paid order amount is invalid")
			}
			paidCents := decimal.NewFromFloat(topUp.Money).Mul(decimal.NewFromInt(100)).Round(0).IntPart()
			if paidCents <= 0 || totalCents > maxInvoiceAmountCents-paidCents {
				return errors.New("paid order amount is invalid")
			}
			totalCents += paidCents
			completedAt := topUp.CompleteTime
			if completedAt <= 0 {
				completedAt = topUp.CreateTime
			}
			orders = append(orders, model.InvoiceOrder{
				TopUpId:         topUp.Id,
				TradeNo:         topUp.TradeNo,
				PaidAmountCents: paidCents,
				PaymentMethod:   topUp.PaymentMethod,
				CompletedAt:     completedAt,
			})
		}

		minimumCents := decimal.NewFromFloat(setting.MinimumAmount).Mul(decimal.NewFromInt(100)).Round(0).IntPart()
		if totalCents < minimumCents {
			return errors.New("selected paid orders do not meet the minimum invoice amount")
		}
		estimate, err := CalculateInvoiceTax(totalCents, *setting, time.Now())
		if err != nil {
			return err
		}
		snapshotBytes, err := common.Marshal(setting)
		if err != nil {
			return err
		}
		breakdownBytes, err := common.Marshal(estimate)
		if err != nil {
			return err
		}
		now := time.Now().Unix()
		created = model.InvoiceApplication{
			UserId:                       userId,
			Status:                       model.InvoiceStatusPendingReview,
			PaymentStatus:                model.InvoicePaymentNotRequired,
			InvoiceTitle:                 strings.TrimSpace(input.InvoiceTitle),
			TaxNumber:                    strings.TrimSpace(input.TaxNumber),
			CompanyAddress:               strings.TrimSpace(input.CompanyAddress),
			CompanyPhone:                 strings.TrimSpace(input.CompanyPhone),
			BankName:                     strings.TrimSpace(input.BankName),
			BankAccount:                  strings.TrimSpace(input.BankAccount),
			RecipientEmail:               strings.TrimSpace(input.RecipientEmail),
			ApplicantNote:                applicantNote,
			InvoiceItemName:              strings.TrimSpace(setting.InvoiceItemName),
			Currency:                     strings.ToUpper(strings.TrimSpace(setting.Currency)),
			OrderAmountCents:             totalCents,
			InvoiceAmountCents:           totalCents,
			EstimatedVATCents:            estimate.EstimatedVATCents,
			EstimatedUrbanTaxCents:       estimate.EstimatedUrbanTaxCents,
			EstimatedEducationCents:      estimate.EstimatedEducationSurchargeCents,
			EstimatedLocalEducationCents: estimate.EstimatedLocalEducationCents,
			EstimatedPITCents:            estimate.EstimatedPITWithholdingCents,
			EstimatedTotalTaxCents:       estimate.EstimatedTotalTaxCents,
			SuggestedSupplementCents:     estimate.SuggestedSupplementCents,
			TaxBreakdown:                 string(breakdownBytes),
			RuleSnapshot:                 string(snapshotBytes),
			CreatedAt:                    now,
			UpdatedAt:                    now,
		}
		if err := tx.Create(&created).Error; err != nil {
			return err
		}
		for index := range orders {
			orders[index].ApplicationId = created.Id
		}
		if err := tx.Create(&orders).Error; err != nil {
			return err
		}
		created.Orders = orders
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &created, nil
}

func ReviewInvoiceApplication(applicationId int, reviewerId int, approve bool, finalSupplementCents *int64, adjustmentReason string, rejectReason string, note string) error {
	return model.UpdateInvoiceApplication(applicationId, func(tx *gorm.DB, application *model.InvoiceApplication) error {
		if application.Status != model.InvoiceStatusPendingReview {
			return model.ErrInvoiceStatusInvalid
		}
		now := time.Now().Unix()
		if !approve {
			if strings.TrimSpace(rejectReason) == "" {
				return errors.New("rejection reason is required")
			}
			return tx.Model(application).Updates(map[string]interface{}{
				"status":        model.InvoiceStatusRejected,
				"reviewer_id":   reviewerId,
				"reviewed_at":   now,
				"reject_reason": strings.TrimSpace(rejectReason),
				"admin_note":    strings.TrimSpace(note),
				"updated_at":    now,
			}).Error
		}

		finalAmount := application.SuggestedSupplementCents
		if finalSupplementCents != nil {
			finalAmount = *finalSupplementCents
		}
		if finalAmount < 0 || finalAmount > maxInvoiceAmountCents || application.OrderAmountCents > maxInvoiceAmountCents-finalAmount {
			return errors.New("final tax supplement amount is invalid")
		}
		if finalAmount != application.SuggestedSupplementCents && strings.TrimSpace(adjustmentReason) == "" {
			return errors.New("tax adjustment reason is required when the final amount differs from the system estimate")
		}
		status := model.InvoiceStatusApproved
		paymentStatus := model.InvoicePaymentNotRequired
		if finalAmount > 0 {
			status = model.InvoiceStatusPendingPayment
			paymentStatus = model.InvoicePaymentPending
		}
		return tx.Model(application).Updates(map[string]interface{}{
			"status":                 status,
			"payment_status":         paymentStatus,
			"final_supplement_cents": finalAmount,
			"tax_adjustment_reason":  strings.TrimSpace(adjustmentReason),
			"reviewer_id":            reviewerId,
			"reviewed_at":            now,
			"reject_reason":          "",
			"admin_note":             strings.TrimSpace(note),
			"updated_at":             now,
		}).Error
	})
}

func CreateInvoicePaymentOrder(applicationId int, userId int, tradeNo string, paymentMethod string, paymentProvider string) (*model.InvoicePaymentOrder, error) {
	var created model.InvoicePaymentOrder
	err := model.UpdateInvoiceApplication(applicationId, func(tx *gorm.DB, application *model.InvoiceApplication) error {
		if application.UserId != userId {
			return model.ErrInvoiceNotFound
		}
		if application.Status != model.InvoiceStatusPendingPayment || application.PaymentStatus != model.InvoicePaymentPending || application.FinalSupplementCents <= 0 {
			return model.ErrInvoiceStatusInvalid
		}
		created = model.InvoicePaymentOrder{
			ApplicationId:   application.Id,
			UserId:          userId,
			TradeNo:         tradeNo,
			AmountCents:     application.FinalSupplementCents,
			Currency:        application.Currency,
			PaymentMethod:   paymentMethod,
			PaymentProvider: paymentProvider,
			Status:          model.InvoicePaymentOrderPending,
			CreateTime:      time.Now().Unix(),
		}
		return tx.Create(&created).Error
	})
	if err != nil {
		return nil, err
	}
	return &created, nil
}

func FailInvoicePaymentOrder(tradeNo string) {
	_ = model.DB.Model(&model.InvoicePaymentOrder{}).
		Where("trade_no = ? AND status = ?", tradeNo, model.InvoicePaymentOrderPending).
		Updates(map[string]interface{}{"status": model.InvoicePaymentOrderFailed, "complete_time": time.Now().Unix()}).Error
}

func CompleteInvoicePaymentOrder(tradeNo string, providerPayload string, expectedProvider string, actualPaymentMethod string) error {
	return model.UpdateInvoicePaymentOrder(tradeNo, func(tx *gorm.DB, order *model.InvoicePaymentOrder) error {
		if expectedProvider != "" && order.PaymentProvider != expectedProvider {
			return model.ErrInvoicePaymentMethodMismatch
		}
		if order.Status == model.InvoicePaymentOrderPaid {
			return nil
		}
		if order.Status != model.InvoicePaymentOrderPending {
			return model.ErrInvoicePaymentOrderInvalid
		}
		application, err := model.GetInvoiceApplicationForUpdate(tx, order.ApplicationId)
		if err != nil {
			return err
		}
		if application.UserId != order.UserId || application.FinalSupplementCents != order.AmountCents {
			return model.ErrInvoicePaymentOrderInvalid
		}
		if application.PaymentStatus != model.InvoicePaymentPaid {
			if application.Status != model.InvoiceStatusPendingPayment || application.PaymentStatus != model.InvoicePaymentPending {
				return model.ErrInvoiceStatusInvalid
			}
			now := time.Now().Unix()
			method := order.PaymentMethod
			if actualPaymentMethod != "" {
				method = actualPaymentMethod
			}
			if err := tx.Model(application).Updates(map[string]interface{}{
				"status":               model.InvoiceStatusApproved,
				"payment_status":       model.InvoicePaymentPaid,
				"payment_trade_no":     order.TradeNo,
				"payment_method":       method,
				"payment_confirmed_at": now,
				"updated_at":           now,
			}).Error; err != nil {
				return err
			}
		}
		order.Status = model.InvoicePaymentOrderPaid
		order.CompleteTime = time.Now().Unix()
		order.ProviderPayload = providerPayload
		if actualPaymentMethod != "" {
			order.PaymentMethod = actualPaymentMethod
		}
		return tx.Save(order).Error
	})
}

func UploadInvoiceFile(applicationId int, originalName string, data []byte) (*model.InvoiceApplication, error) {
	if len(data) == 0 {
		return nil, errors.New("invoice file is empty")
	}
	if int64(len(data)) > InvoiceFileMaxBytes {
		return nil, errors.New("invoice file must be 20 MB or smaller")
	}
	head := data
	if len(head) > 512 {
		head = head[:512]
	}
	contentType := http.DetectContentType(head)
	extension, allowed := invoiceFileContentTypes[contentType]
	if !allowed {
		return nil, errors.New("invoice file must be PDF, PNG, or JPEG")
	}
	application, err := model.GetInvoiceApplication(applicationId, 0)
	if err != nil {
		return nil, err
	}
	if application.Status != model.InvoiceStatusApproved && application.Status != model.InvoiceStatusIssued {
		return nil, model.ErrInvoiceStatusInvalid
	}
	directory := filepath.Join("upload", "invoices", strconv.Itoa(applicationId))
	if err = os.MkdirAll(directory, 0755); err != nil {
		return nil, fmt.Errorf("failed to create invoice upload directory: %w", err)
	}
	fileName := fmt.Sprintf("invoice-%d-%d%s", applicationId, time.Now().UnixNano(), extension)
	targetPath := filepath.Join(directory, fileName)
	tempPath := targetPath + ".tmp"
	if err = os.WriteFile(tempPath, data, 0644); err != nil {
		return nil, fmt.Errorf("failed to save invoice file: %w", err)
	}
	if err = os.Rename(tempPath, targetPath); err != nil {
		_ = os.Remove(tempPath)
		return nil, fmt.Errorf("failed to finalize invoice file: %w", err)
	}
	displayName := filepath.Base(strings.TrimSpace(originalName))
	if displayName == "." || displayName == "" {
		displayName = fileName
	}
	now := time.Now().Unix()
	err = model.UpdateInvoiceApplication(applicationId, func(tx *gorm.DB, current *model.InvoiceApplication) error {
		if current.Status != model.InvoiceStatusApproved && current.Status != model.InvoiceStatusIssued {
			return model.ErrInvoiceStatusInvalid
		}
		return tx.Model(current).Updates(map[string]interface{}{
			"status":                    model.InvoiceStatusIssued,
			"invoice_file_name":         displayName,
			"invoice_file_path":         targetPath,
			"invoice_file_content_type": contentType,
			"issued_at":                 now,
			"updated_at":                now,
		}).Error
	})
	if err != nil {
		_ = os.Remove(targetPath)
		return nil, err
	}
	if application.InvoiceFilePath != "" && application.InvoiceFilePath != targetPath {
		oldPath, resolveErr := resolveInvoiceFilePath(application.InvoiceFilePath)
		if resolveErr == nil {
			_ = os.Remove(oldPath)
		}
	}
	return model.GetInvoiceApplication(applicationId, 0)
}

func GetInvoiceDownload(applicationId int, userId int) (InvoiceDownload, error) {
	application, err := model.GetInvoiceApplication(applicationId, userId)
	if err != nil {
		return InvoiceDownload{}, err
	}
	if application.Status != model.InvoiceStatusIssued || application.InvoiceFilePath == "" {
		return InvoiceDownload{}, errors.New("invoice file is not available")
	}
	target, err := resolveInvoiceFilePath(application.InvoiceFilePath)
	if err != nil {
		return InvoiceDownload{}, err
	}
	if _, err = os.Stat(target); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return InvoiceDownload{}, errors.New("invoice file is not available")
		}
		return InvoiceDownload{}, err
	}
	return InvoiceDownload{Path: target, FileName: application.InvoiceFileName, ContentType: application.InvoiceFileContentType}, nil
}

func resolveInvoiceFilePath(storedPath string) (string, error) {
	root, err := filepath.Abs(filepath.Join("upload", "invoices"))
	if err != nil {
		return "", err
	}
	target, err := filepath.Abs(storedPath)
	if err != nil {
		return "", err
	}
	relative, err := filepath.Rel(root, target)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return "", errors.New("invalid invoice file path")
	}
	return target, nil
}
