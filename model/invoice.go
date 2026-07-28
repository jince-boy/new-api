package model

import (
	"errors"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

const (
	InvoiceStatusPendingReview  = "pending_review"
	InvoiceStatusPendingPayment = "pending_payment"
	InvoiceStatusApproved       = "approved"
	InvoiceStatusRejected       = "rejected"
	InvoiceStatusIssued         = "issued"

	InvoicePaymentNotRequired = "not_required"
	InvoicePaymentPending     = "pending"
	InvoicePaymentPaid        = "paid"

	InvoicePaymentOrderPending = "pending"
	InvoicePaymentOrderPaid    = "paid"
	InvoicePaymentOrderFailed  = "failed"
	InvoicePaymentOrderExpired = "expired"
)

var (
	ErrInvoiceNotFound              = errors.New("invoice application not found")
	ErrInvoiceOrderAlreadyApplied   = errors.New("one or more paid orders already have an invoice application")
	ErrInvoiceStatusInvalid         = errors.New("invoice application status invalid")
	ErrInvoicePaymentRequired       = errors.New("invoice tax supplement payment is required")
	ErrInvoicePaymentOrderNotFound  = errors.New("invoice payment order not found")
	ErrInvoicePaymentOrderInvalid   = errors.New("invoice payment order status invalid")
	ErrInvoicePaymentMethodMismatch = errors.New("invoice payment method mismatch")
)

type InvoiceApplication struct {
	Id                           int            `json:"id"`
	UserId                       int            `json:"user_id" gorm:"index"`
	Status                       string         `json:"status" gorm:"type:varchar(32);index"`
	PaymentStatus                string         `json:"payment_status" gorm:"type:varchar(32);index"`
	InvoiceTitle                 string         `json:"invoice_title" gorm:"type:varchar(255)"`
	TaxNumber                    string         `json:"tax_number" gorm:"type:varchar(64)"`
	CompanyAddress               string         `json:"company_address" gorm:"type:varchar(255)"`
	CompanyPhone                 string         `json:"company_phone" gorm:"type:varchar(64)"`
	BankName                     string         `json:"bank_name" gorm:"type:varchar(255)"`
	BankAccount                  string         `json:"bank_account" gorm:"type:varchar(128)"`
	RecipientEmail               string         `json:"recipient_email" gorm:"type:varchar(255)"`
	ApplicantNote                string         `json:"applicant_note" gorm:"type:text"`
	InvoiceItemName              string         `json:"invoice_item_name" gorm:"type:varchar(255)"`
	Currency                     string         `json:"currency" gorm:"type:varchar(8)"`
	OrderAmountCents             int64          `json:"order_amount_cents"`
	InvoiceAmountCents           int64          `json:"invoice_amount_cents"`
	EstimatedVATCents            int64          `json:"estimated_vat_cents"`
	EstimatedUrbanTaxCents       int64          `json:"estimated_urban_tax_cents"`
	EstimatedEducationCents      int64          `json:"estimated_education_surcharge_cents"`
	EstimatedLocalEducationCents int64          `json:"estimated_local_education_surcharge_cents"`
	EstimatedPITCents            int64          `json:"estimated_pit_withholding_cents"`
	EstimatedTotalTaxCents       int64          `json:"estimated_total_tax_cents"`
	SuggestedSupplementCents     int64          `json:"suggested_supplement_cents"`
	FinalSupplementCents         int64          `json:"final_supplement_cents"`
	TaxBreakdown                 string         `json:"-" gorm:"type:text"`
	RuleSnapshot                 string         `json:"-" gorm:"type:text"`
	TaxAdjustmentReason          string         `json:"tax_adjustment_reason" gorm:"type:text"`
	AdminNote                    string         `json:"admin_note" gorm:"type:text"`
	RejectReason                 string         `json:"reject_reason" gorm:"type:text"`
	ReviewerId                   int            `json:"reviewer_id"`
	ReviewedAt                   int64          `json:"reviewed_at"`
	PaymentTradeNo               string         `json:"payment_trade_no" gorm:"type:varchar(128);index"`
	PaymentMethod                string         `json:"payment_method" gorm:"type:varchar(50)"`
	PaymentConfirmedAt           int64          `json:"payment_confirmed_at"`
	InvoiceFileName              string         `json:"invoice_file_name" gorm:"type:varchar(255)"`
	InvoiceFilePath              string         `json:"-" gorm:"type:text"`
	InvoiceFileContentType       string         `json:"invoice_file_content_type" gorm:"type:varchar(128)"`
	InvoiceEmailSentAt           int64          `json:"invoice_email_sent_at"`
	InvoiceEmailSendCount        int            `json:"invoice_email_send_count"`
	CreatedAt                    int64          `json:"created_at" gorm:"index"`
	UpdatedAt                    int64          `json:"updated_at"`
	IssuedAt                     int64          `json:"issued_at"`
	Orders                       []InvoiceOrder `json:"orders" gorm:"foreignKey:ApplicationId"`
}

type InvoiceOrder struct {
	Id              int    `json:"id"`
	ApplicationId   int    `json:"application_id" gorm:"index"`
	TopUpId         int    `json:"top_up_id" gorm:"uniqueIndex"`
	TradeNo         string `json:"trade_no" gorm:"type:varchar(128)"`
	PaidAmountCents int64  `json:"paid_amount_cents"`
	PaymentMethod   string `json:"payment_method" gorm:"type:varchar(50)"`
	CompletedAt     int64  `json:"completed_at"`
}

type InvoicePaymentOrder struct {
	Id                 int    `json:"id"`
	ApplicationId      int    `json:"application_id" gorm:"index"`
	UserId             int    `json:"user_id" gorm:"index"`
	TradeNo            string `json:"trade_no" gorm:"type:varchar(128);uniqueIndex"`
	AmountCents        int64  `json:"amount_cents"`
	Currency           string `json:"currency" gorm:"type:varchar(8)"`
	PaymentMethod      string `json:"payment_method" gorm:"type:varchar(50)"`
	PaymentProvider    string `json:"payment_provider" gorm:"type:varchar(50)"`
	Status             string `json:"status" gorm:"type:varchar(32);index"`
	ProviderPayload    string `json:"provider_payload" gorm:"type:text"`
	CreateTime         int64  `json:"create_time"`
	CompleteTime       int64  `json:"complete_time"`
	UsageLogRecordedAt int64  `json:"usage_log_recorded_at"`
}

func ListInvoiceApplications(userId int, status string, keyword string, pageInfo *common.PageInfo) ([]*InvoiceApplication, int64, error) {
	query := DB.Model(&InvoiceApplication{})
	if userId > 0 {
		query = query.Where("user_id = ?", userId)
	}
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if keyword != "" {
		like := "%" + keyword + "%"
		if numericKeyword, err := strconv.Atoi(keyword); err == nil && numericKeyword > 0 {
			query = query.Where("id = ? OR user_id = ? OR invoice_title LIKE ? OR tax_number LIKE ? OR recipient_email LIKE ?", numericKeyword, numericKeyword, like, like, like)
		} else {
			query = query.Where("invoice_title LIKE ? OR tax_number LIKE ? OR recipient_email LIKE ?", like, like, like)
		}
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var applications []*InvoiceApplication
	err := query.Preload("Orders").Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&applications).Error
	return applications, total, err
}

func GetInvoiceApplication(id int, userId int) (*InvoiceApplication, error) {
	query := DB.Preload("Orders").Where("id = ?", id)
	if userId > 0 {
		query = query.Where("user_id = ?", userId)
	}
	var application InvoiceApplication
	if err := query.First(&application).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrInvoiceNotFound
		}
		return nil, err
	}
	return &application, nil
}

func UpdateInvoiceApplication(id int, update func(*gorm.DB, *InvoiceApplication) error) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		var application InvoiceApplication
		if err := lockForUpdate(tx).Where("id = ?", id).First(&application).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrInvoiceNotFound
			}
			return err
		}
		return update(tx, &application)
	})
}

func GetInvoiceApplicationForUpdate(tx *gorm.DB, id int) (*InvoiceApplication, error) {
	if tx == nil {
		return nil, errors.New("invoice transaction is required")
	}
	var application InvoiceApplication
	if err := lockForUpdate(tx).Where("id = ?", id).First(&application).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrInvoiceNotFound
		}
		return nil, err
	}
	return &application, nil
}

func DeleteInvoiceApplication(id int) (*InvoiceApplication, error) {
	var deleted InvoiceApplication
	err := DB.Transaction(func(tx *gorm.DB) error {
		application, err := GetInvoiceApplicationForUpdate(tx, id)
		if err != nil {
			return err
		}
		deletable := application.Status == InvoiceStatusPendingReview || application.Status == InvoiceStatusRejected
		if application.Status == InvoiceStatusPendingPayment && application.PaymentStatus == InvoicePaymentPending && application.PaymentConfirmedAt == 0 {
			var activePaymentCount int64
			if err = tx.Model(&InvoicePaymentOrder{}).
				Where("application_id = ? AND status IN ?", id, []string{InvoicePaymentOrderPending, InvoicePaymentOrderPaid}).
				Count(&activePaymentCount).Error; err != nil {
				return err
			}
			deletable = activePaymentCount == 0
		}
		if !deletable {
			return ErrInvoiceStatusInvalid
		}
		deleted = *application

		if err = tx.Where("application_id = ?", id).Delete(&InvoicePaymentOrder{}).Error; err != nil {
			return err
		}
		if err = tx.Where("application_id = ?", id).Delete(&InvoiceOrder{}).Error; err != nil {
			return err
		}
		result := tx.Delete(&InvoiceApplication{}, id)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return ErrInvoiceNotFound
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &deleted, nil
}

func GetInvoicePaymentOrderByTradeNo(tradeNo string) (*InvoicePaymentOrder, error) {
	var order InvoicePaymentOrder
	if err := DB.Where("trade_no = ?", tradeNo).First(&order).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrInvoicePaymentOrderNotFound
		}
		return nil, err
	}
	return &order, nil
}

func UpdateInvoicePaymentOrder(tradeNo string, update func(*gorm.DB, *InvoicePaymentOrder) error) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		var order InvoicePaymentOrder
		if err := lockForUpdate(tx).Where("trade_no = ?", tradeNo).First(&order).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrInvoicePaymentOrderNotFound
			}
			return err
		}
		return update(tx, &order)
	})
}
