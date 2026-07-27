package service

import (
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/invoice_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func invoiceTaxTestSetting() invoice_setting.InvoiceSetting {
	return invoice_setting.InvoiceSetting{
		Enabled:                            true,
		PriceIncludesTax:                   false,
		TaxBurdenMode:                      invoice_setting.TaxBurdenSupplement,
		MinimumAmount:                      0,
		ApplicationWindowDays:              30,
		Currency:                           "CNY",
		InvoiceItemName:                    "技术服务费",
		VATPeriodMode:                      invoice_setting.VATPeriodPerTransaction,
		VATThresholdCents:                  100_000,
		VATRateBasisPoints:                 100,
		VATStandardRateBasisPoints:         300,
		VATPreferentialEndDate:             "2027-12-31",
		UrbanMaintenanceTaxRateBasisPoints: 700,
		EducationSurchargeRateBasisPoints:  300,
		LocalEducationRateBasisPoints:      200,
		SurchargeReliefBasisPoints:         5_000,
		PITWithholdingEnabled:              true,
		PolicyEffectiveDate:                "2026-01-01",
	}
}

func TestCalculateInvoiceTaxVATThresholdUsesFullSalesAtThreshold(t *testing.T) {
	setting := invoiceTaxTestSetting()
	calculationTime := time.Date(2026, time.July, 27, 12, 0, 0, 0, time.Local)

	below, err := CalculateInvoiceTax(99_999, setting, calculationTime)
	require.NoError(t, err)
	atThreshold, err := CalculateInvoiceTax(100_000, setting, calculationTime)
	require.NoError(t, err)
	above, err := CalculateInvoiceTax(100_001, setting, calculationTime)
	require.NoError(t, err)

	assert.True(t, below.VATExemptByThreshold)
	assert.Zero(t, below.EstimatedVATCents)
	assert.False(t, atThreshold.VATExemptByThreshold)
	assert.Equal(t, int64(1_000), atThreshold.EstimatedVATCents)
	assert.Equal(t, int64(1_000), above.EstimatedVATCents)
	assert.Equal(t, int64(1_060), atThreshold.SuggestedSupplementCents)
}

func TestCalculateInvoiceTaxPITWithholdingBoundaries(t *testing.T) {
	setting := invoiceTaxTestSetting()
	setting.VATThresholdCents = 100_000_000
	calculationTime := time.Date(2026, time.July, 27, 12, 0, 0, 0, time.Local)

	tests := []struct {
		name        string
		incomeCents int64
		wantPIT     int64
	}{
		{name: "income exactly 4000 yuan", incomeCents: 400_000, wantPIT: 64_000},
		{name: "income just above 4000 yuan", incomeCents: 400_001, wantPIT: 64_000},
		{name: "thirty percent withholding band", incomeCents: 3_000_000, wantPIT: 520_000},
		{name: "forty percent withholding band", incomeCents: 7_000_000, wantPIT: 1_540_000},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			estimate, err := CalculateInvoiceTax(test.incomeCents, setting, calculationTime)
			require.NoError(t, err)
			assert.Equal(t, test.wantPIT, estimate.EstimatedPITWithholdingCents)
			assert.Zero(t, estimate.SuggestedSupplementCents, "PIT must not be automatically passed through to the customer")
		})
	}
}

func TestInvoiceReviewThenOnlinePaymentCompletesWithoutCreatingTopUp(t *testing.T) {
	require.NoError(t, model.DB.AutoMigrate(&model.InvoicePaymentOrder{}))
	setting := invoice_setting.GetInvoiceSetting()
	original := *setting
	*setting = invoiceTaxTestSetting()
	t.Cleanup(func() {
		*setting = original
		model.DB.Where("trade_no = ?", "invoice-payment-test").Delete(&model.InvoicePaymentOrder{})
		model.DB.Exec("DELETE FROM invoice_orders")
		model.DB.Exec("DELETE FROM invoice_applications")
		model.DB.Where("trade_no LIKE ?", "invoice-test-%").Delete(&model.TopUp{})
	})

	now := time.Now().Unix()
	paidOrder := model.TopUp{
		UserId:        701,
		Money:         1000,
		TradeNo:       "invoice-test-paid",
		PaymentMethod: "stripe",
		CreateTime:    now - 60,
		CompleteTime:  now,
		Status:        common.TopUpStatusSuccess,
	}
	require.NoError(t, model.DB.Create(&paidOrder).Error)

	application, err := CreateInvoiceApplication(701, CreateInvoiceApplicationInput{
		TopUpIds:       []int{paidOrder.Id},
		InvoiceTitle:   "测试企业",
		TaxNumber:      "91310000TEST",
		RecipientEmail: "finance@example.com",
		ApplicantNote:  "Please include the project name.",
	})
	require.NoError(t, err)
	assert.Equal(t, model.InvoiceStatusPendingReview, application.Status)
	assert.Equal(t, int64(1_060), application.SuggestedSupplementCents)
	assert.Equal(t, int64(4_000), application.EstimatedPITCents)
	assert.Equal(t, "Please include the project name.", application.ApplicantNote)

	adjusted := int64(1_061)
	err = ReviewInvoiceApplication(application.Id, 1, true, &adjusted, "", "", "")
	require.ErrorContains(t, err, "adjustment reason")

	finalAmount := int64(1_060)
	require.NoError(t, ReviewInvoiceApplication(application.Id, 1, true, &finalAmount, "", "", "reviewed"))
	reviewed, err := model.GetInvoiceApplication(application.Id, 701)
	require.NoError(t, err)
	assert.Equal(t, model.InvoiceStatusPendingPayment, reviewed.Status)
	assert.Equal(t, model.InvoicePaymentPending, reviewed.PaymentStatus)

	paymentOrder, err := CreateInvoicePaymentOrder(application.Id, 701, "invoice-payment-test", "alipay", model.PaymentProviderEpay)
	require.NoError(t, err)
	assert.Equal(t, finalAmount, paymentOrder.AmountCents)
	require.NoError(t, CompleteInvoicePaymentOrder("invoice-payment-test", `{"verified":true}`, model.PaymentProviderEpay, "alipay"))
	require.NoError(t, CompleteInvoicePaymentOrder("invoice-payment-test", `{"verified":true}`, model.PaymentProviderEpay, "alipay"))

	completed, err := model.GetInvoiceApplication(application.Id, 701)
	require.NoError(t, err)
	assert.Equal(t, model.InvoiceStatusApproved, completed.Status)
	assert.Equal(t, model.InvoicePaymentPaid, completed.PaymentStatus)
	assert.Equal(t, "invoice-payment-test", completed.PaymentTradeNo)

	var topUpCount int64
	require.NoError(t, model.DB.Model(&model.TopUp{}).Where("trade_no = ?", "invoice-payment-test").Count(&topUpCount).Error)
	assert.Zero(t, topUpCount, "invoice supplement payment must never credit wallet quota")
}

func TestCreateInvoiceApplicationRejectsApplicantNoteOverLimit(t *testing.T) {
	setting := invoice_setting.GetInvoiceSetting()
	original := *setting
	*setting = invoiceTaxTestSetting()
	t.Cleanup(func() {
		*setting = original
	})

	_, err := CreateInvoiceApplication(702, CreateInvoiceApplicationInput{
		TopUpIds:      []int{1},
		InvoiceTitle:  "Example Technology Co., Ltd.",
		TaxNumber:     "91310000EXAMPLE",
		ApplicantNote: strings.Repeat("a", 2001),
	})

	require.ErrorContains(t, err, "2000 characters or fewer")
}

func TestInvoiceApplicationRejectsMinimumAndExpiredOrders(t *testing.T) {
	setting := invoice_setting.GetInvoiceSetting()
	original := *setting
	rules := invoiceTaxTestSetting()
	rules.PriceIncludesTax = true
	rules.TaxBurdenMode = invoice_setting.TaxBurdenIncluded
	rules.MinimumAmount = 100
	*setting = rules
	t.Cleanup(func() {
		*setting = original
		model.DB.Exec("DELETE FROM invoice_orders")
		model.DB.Exec("DELETE FROM invoice_applications")
		model.DB.Where("trade_no LIKE ?", "invoice-boundary-%").Delete(&model.TopUp{})
	})

	now := time.Now()
	smallOrder := model.TopUp{UserId: 703, Money: 99, TradeNo: "invoice-boundary-small", PaymentMethod: "stripe", CreateTime: now.Unix(), CompleteTime: now.Unix(), Status: common.TopUpStatusSuccess}
	expiredOrder := model.TopUp{UserId: 703, Money: 200, TradeNo: "invoice-boundary-expired", PaymentMethod: "stripe", CreateTime: now.AddDate(0, 0, -31).Unix(), CompleteTime: now.AddDate(0, 0, -31).Unix(), Status: common.TopUpStatusSuccess}
	require.NoError(t, model.DB.Create(&smallOrder).Error)
	require.NoError(t, model.DB.Create(&expiredOrder).Error)

	_, err := CreateInvoiceApplication(703, CreateInvoiceApplicationInput{TopUpIds: []int{smallOrder.Id}, InvoiceTitle: "测试企业", TaxNumber: "91310000TEST"})
	require.ErrorContains(t, err, "minimum invoice amount")
	_, err = CreateInvoiceApplication(703, CreateInvoiceApplicationInput{TopUpIds: []int{expiredOrder.Id}, InvoiceTitle: "测试企业", TaxNumber: "91310000TEST"})
	require.ErrorContains(t, err, "outside the invoice application window")
}

func TestResolveInvoiceFilePathRejectsPathOutsideInvoiceDirectory(t *testing.T) {
	_, err := resolveInvoiceFilePath(filepath.Join("upload", "outside.pdf"))
	require.ErrorContains(t, err, "invalid invoice file path")
	path, err := resolveInvoiceFilePath(filepath.Join("upload", "invoices", "1", "invoice.pdf"))
	require.NoError(t, err)
	assert.True(t, filepath.IsAbs(path))
}
