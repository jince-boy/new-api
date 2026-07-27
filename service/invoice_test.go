package service

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
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
		InvoiceItemName:                    "AI Agent服务",
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
	assert.Equal(t, int64(1_000), atThreshold.SuggestedSupplementCents)
	assert.Zero(t, atThreshold.EstimatedUrbanTaxCents)
	assert.Zero(t, atThreshold.EstimatedEducationSurchargeCents)
	assert.Zero(t, atThreshold.EstimatedLocalEducationCents)
	assert.Zero(t, atThreshold.EstimatedPITWithholdingCents)
}

func TestCalculateInvoiceTaxExcludesAncillaryTaxesAndIndividualWithholding(t *testing.T) {
	setting := invoiceTaxTestSetting()
	setting.VATThresholdCents = 0
	calculationTime := time.Date(2026, time.July, 27, 12, 0, 0, 0, time.Local)

	estimate, err := CalculateInvoiceTax(400_000, setting, calculationTime)
	require.NoError(t, err)

	assert.Equal(t, estimate.EstimatedVATCents, estimate.EstimatedTotalTaxCents)
	assert.Equal(t, estimate.EstimatedVATCents, estimate.SuggestedSupplementCents)
	assert.Zero(t, estimate.EstimatedUrbanTaxCents)
	assert.Zero(t, estimate.EstimatedEducationSurchargeCents)
	assert.Zero(t, estimate.EstimatedLocalEducationCents)
	assert.Zero(t, estimate.EstimatedPITWithholdingCents)
}

func TestInvoiceReviewThenOnlinePaymentCompletesWithoutCreatingTopUp(t *testing.T) {
	require.NoError(t, model.DB.AutoMigrate(&model.InvoicePaymentOrder{}))
	setting := invoice_setting.GetInvoiceSetting()
	original := *setting
	*setting = invoiceTaxTestSetting()
	t.Cleanup(func() {
		*setting = original
		model.LOG_DB.Where("request_id = ?", "invoice-payment-test").Delete(&model.Log{})
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
	assert.Zero(t, application.SuggestedSupplementCents)
	assert.Zero(t, application.EstimatedPITCents)
	assert.Equal(t, "AI Agent服务", application.InvoiceItemName)
	assert.Equal(t, "Please include the project name.", application.ApplicantNote)

	finalAmount := int64(1_060)
	require.NoError(t, ReviewInvoiceApplication(application.Id, 1, true, &finalAmount, "", "", "reviewed"))
	reviewed, err := model.GetInvoiceApplication(application.Id, 701)
	require.NoError(t, err)
	assert.Equal(t, model.InvoiceStatusPendingPayment, reviewed.Status)
	assert.Equal(t, model.InvoicePaymentPending, reviewed.PaymentStatus)
	assert.Equal(t, int64(101_060), reviewed.InvoiceAmountCents)

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

	var supplementLogs []model.Log
	require.NoError(t, model.LOG_DB.Where("request_id = ?", "invoice-payment-test").Find(&supplementLogs).Error)
	require.Len(t, supplementLogs, 1)
	assert.Equal(t, model.LogTypeTopup, supplementLogs[0].Type)
	assert.Contains(t, supplementLogs[0].Content, "发票补税支付成功")
	var supplementLogOther map[string]interface{}
	require.NoError(t, common.UnmarshalJsonStr(supplementLogs[0].Other, &supplementLogOther))
	assert.Equal(t, float64(application.Id), supplementLogOther["invoice_application_id"])
	assert.Equal(t, "invoice-payment-test", supplementLogOther["invoice_payment_trade_no"])

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

	_, err := CreateInvoiceApplication(703, CreateInvoiceApplicationInput{TopUpIds: []int{smallOrder.Id}, InvoiceTitle: "测试企业", TaxNumber: "91310000TEST", RecipientEmail: "finance@example.com"})
	require.ErrorContains(t, err, "minimum invoice amount")
	_, err = CreateInvoiceApplication(703, CreateInvoiceApplicationInput{TopUpIds: []int{expiredOrder.Id}, InvoiceTitle: "测试企业", TaxNumber: "91310000TEST", RecipientEmail: "finance@example.com"})
	require.ErrorContains(t, err, "outside the invoice application window")
}

func TestResolveInvoiceFilePathRejectsPathOutsideInvoiceDirectory(t *testing.T) {
	_, err := resolveInvoiceFilePath(filepath.Join("upload", "outside.pdf"))
	require.ErrorContains(t, err, "invalid invoice file path")
	path, err := resolveInvoiceFilePath(filepath.Join("upload", "invoices", "1", "invoice.pdf"))
	require.NoError(t, err)
	assert.True(t, filepath.IsAbs(path))
}

func TestInvoiceOrderCanOnlyBeAppliedOnce(t *testing.T) {
	require.NoError(t, model.DB.AutoMigrate(&model.InvoiceApplication{}, &model.InvoiceOrder{}))
	setting := invoice_setting.GetInvoiceSetting()
	original := *setting
	*setting = invoiceTaxTestSetting()
	t.Cleanup(func() {
		*setting = original
	})

	now := time.Now().Unix()
	paidOrder := model.TopUp{
		UserId:        704,
		Money:         200,
		TradeNo:       "invoice-unique-order",
		PaymentMethod: "stripe",
		CreateTime:    now,
		CompleteTime:  now,
		Status:        common.TopUpStatusSuccess,
	}
	require.NoError(t, model.DB.Create(&paidOrder).Error)
	t.Cleanup(func() {
		model.DB.Where("top_up_id = ?", paidOrder.Id).Delete(&model.InvoiceOrder{})
		model.DB.Where("user_id = ?", 704).Delete(&model.InvoiceApplication{})
		model.DB.Delete(&model.TopUp{}, paidOrder.Id)
	})
	input := CreateInvoiceApplicationInput{
		TopUpIds:       []int{paidOrder.Id},
		InvoiceTitle:   "Example Technology Co., Ltd.",
		TaxNumber:      "91310000UNIQUE",
		RecipientEmail: "finance@example.com",
	}

	_, err := CreateInvoiceApplication(704, input)
	require.NoError(t, err)
	_, err = CreateInvoiceApplication(704, input)
	require.ErrorIs(t, err, model.ErrInvoiceOrderAlreadyApplied)

	eligible, err := ListEligibleInvoiceOrders(704)
	require.NoError(t, err)
	for _, order := range eligible {
		assert.NotEqual(t, paidOrder.Id, order.Id)
	}
}

func TestSendInvoiceEmailEnforcesOwnershipAndTracksResends(t *testing.T) {
	require.NoError(t, model.DB.AutoMigrate(&model.InvoiceApplication{}))
	directory := filepath.Join("upload", "invoices", "service-email-test")
	require.NoError(t, os.MkdirAll(directory, 0755))
	filePath := filepath.Join(directory, "invoice.pdf")
	payload := []byte("invoice-content")
	require.NoError(t, os.WriteFile(filePath, payload, 0600))
	t.Cleanup(func() {
		_ = os.RemoveAll(directory)
	})

	application := model.InvoiceApplication{
		UserId:                 705,
		Status:                 model.InvoiceStatusApproved,
		PaymentStatus:          model.InvoicePaymentNotRequired,
		InvoiceTitle:           "Example Technology Co., Ltd.",
		InvoiceItemName:        "AI Agent服务",
		RecipientEmail:         "finance@example.com",
		InvoiceFileName:        "invoice.pdf",
		InvoiceFilePath:        filePath,
		InvoiceFileContentType: "application/pdf",
		CreatedAt:              time.Now().Unix(),
		UpdatedAt:              time.Now().Unix(),
	}
	require.NoError(t, model.DB.Create(&application).Error)
	t.Cleanup(func() {
		model.DB.Delete(&model.InvoiceApplication{}, application.Id)
	})

	originalSender := invoiceEmailSender
	sendCount := 0
	invoiceEmailSender = func(subject string, receiver string, content string, attachments []common.EmailAttachment) error {
		sendCount++
		assert.Equal(t, fmt.Sprintf("发票 #%d", application.Id), subject)
		assert.Equal(t, "finance@example.com", receiver)
		assert.Contains(t, content, "您的发票已随邮件附上")
		assert.Contains(t, content, "AI Agent服务")
		require.Len(t, attachments, 1)
		assert.Equal(t, payload, attachments[0].Data)
		return nil
	}
	t.Cleanup(func() {
		invoiceEmailSender = originalSender
	})

	_, err := SendInvoiceEmail(application.Id, 706)
	require.ErrorIs(t, err, model.ErrInvoiceNotFound)
	assert.Zero(t, sendCount)
	_, err = SendInvoiceEmail(application.Id, 705)
	require.True(t, errors.Is(err, model.ErrInvoiceStatusInvalid))
	assert.Zero(t, sendCount)

	issued, err := SendInvoiceEmail(application.Id, 0)
	require.NoError(t, err)
	assert.Equal(t, model.InvoiceStatusIssued, issued.Status)
	assert.NotZero(t, issued.InvoiceEmailSentAt)
	assert.Equal(t, 1, issued.InvoiceEmailSendCount)

	resent, err := SendInvoiceEmail(application.Id, 705)
	require.NoError(t, err)
	assert.Equal(t, 2, resent.InvoiceEmailSendCount)
	assert.Equal(t, 2, sendCount)
}

func TestInvoiceEmailMessageUsesSupportedLanguage(t *testing.T) {
	application := &model.InvoiceApplication{
		Id:              42,
		InvoiceTitle:    "Example & Company",
		InvoiceItemName: "AI Agent服务",
	}
	tests := []struct {
		language string
		subject  string
		fragment string
	}{
		{language: "en", subject: "Invoice #42", fragment: "Your invoice is attached."},
		{language: "zh", subject: "发票 #42", fragment: "您的发票已随邮件附上。"},
		{language: "zh-TW", subject: "發票 #42", fragment: "您的發票已隨郵件附上。"},
		{language: "fr", subject: "Facture n° 42", fragment: "Votre facture est jointe"},
		{language: "ja", subject: "請求書 #42", fragment: "請求書を添付しました。"},
		{language: "ru", subject: "Счёт-фактура №42", fragment: "Счёт-фактура прикреплён"},
		{language: "vi", subject: "Hóa đơn #42", fragment: "Hóa đơn của bạn"},
	}

	for _, test := range tests {
		t.Run(test.language, func(t *testing.T) {
			subject, content := invoiceEmailMessage(test.language, application)
			assert.Equal(t, test.subject, subject)
			assert.Contains(t, content, test.fragment)
			assert.Contains(t, content, "Example &amp; Company")
			assert.Contains(t, content, "AI Agent服务")
		})
	}
}

func TestInvoiceEmailMessageUsesCurrentItemNameForLegacyUnissuedApplication(t *testing.T) {
	application := &model.InvoiceApplication{
		Id:              43,
		Status:          model.InvoiceStatusApproved,
		InvoiceTitle:    "Example Company",
		InvoiceItemName: "技术服务费",
	}

	_, content := invoiceEmailMessage("zh", application)

	assert.Contains(t, content, "AI Agent服务")
	assert.NotContains(t, content, "技术服务费")
}

func TestUploadInvoiceFileKeepsFileWhenInitialEmailFails(t *testing.T) {
	require.NoError(t, model.DB.AutoMigrate(&model.InvoiceApplication{}))
	application := model.InvoiceApplication{
		UserId:         707,
		Status:         model.InvoiceStatusApproved,
		PaymentStatus:  model.InvoicePaymentNotRequired,
		InvoiceTitle:   "Example Technology Co., Ltd.",
		RecipientEmail: "finance@example.com",
		CreatedAt:      time.Now().Unix(),
		UpdatedAt:      time.Now().Unix(),
	}
	require.NoError(t, model.DB.Create(&application).Error)
	t.Cleanup(func() {
		_ = os.RemoveAll(filepath.Join("upload", "invoices", strconv.Itoa(application.Id)))
		model.DB.Delete(&model.InvoiceApplication{}, application.Id)
	})

	originalSender := invoiceEmailSender
	invoiceEmailSender = func(_ string, _ string, _ string, _ []common.EmailAttachment) error {
		return errors.New("SMTP unavailable")
	}
	t.Cleanup(func() {
		invoiceEmailSender = originalSender
	})

	stored, err := UploadInvoiceFile(application.Id, "invoice.pdf", []byte("%PDF-1.4\n%test invoice\n"))
	require.ErrorContains(t, err, "file was saved")
	require.NotNil(t, stored)
	assert.Equal(t, model.InvoiceStatusApproved, stored.Status)
	assert.Equal(t, "invoice.pdf", stored.InvoiceFileName)
	_, statErr := os.Stat(stored.InvoiceFilePath)
	require.NoError(t, statErr)

	invoiceEmailSender = func(_ string, _ string, _ string, _ []common.EmailAttachment) error {
		return nil
	}
	issued, err := SendInvoiceEmail(application.Id, 0)
	require.NoError(t, err)
	assert.Equal(t, model.InvoiceStatusIssued, issued.Status)
	assert.Equal(t, 1, issued.InvoiceEmailSendCount)
}
