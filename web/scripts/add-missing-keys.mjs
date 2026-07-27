import fs from 'node:fs/promises'
import path from 'node:path'

const LOCALES_DIR = path.resolve('src/i18n/locales')

function stableStringify(obj) {
  return JSON.stringify(obj, null, 2) + '\n'
}

const newKeys = {
  en: {
    '{{count}} orders': '{{count}} orders',
    'Configure application eligibility and the invoice item used for paid orders. Buyer information is collected from each application.':
      'Configure application eligibility and the invoice item used for paid orders. Buyer information is collected from each application.',
    'Currency must be CNY.': 'Currency must be CNY.',
    'Email delivery': 'Email delivery',
    'Enter the actual supplement confirmed for this invoice, or 0 when none is required.':
      'Enter the actual supplement confirmed for this invoice, or 0 when none is required.',
    'Failed to review invoice application.':
      'Failed to review invoice application.',
    'Failed to save invoice settings.': 'Failed to save invoice settings.',
    'Failed to send invoice email.': 'Failed to send invoice email.',
    'Final invoice amount': 'Final invoice amount',
    'Invoice email sent.': 'Invoice email sent.',
    'Invoice information': 'Invoice information',
    'Invoice settings': 'Invoice settings',
    'Invoice upload or email delivery failed. Refresh the list and try again.':
      'Invoice upload or email delivery failed. Refresh the list and try again.',
    'Invoice uploaded and sent.': 'Invoice uploaded and sent.',
    'Last sent at': 'Last sent at',
    'Mainland China invoices use CNY.': 'Mainland China invoices use CNY.',
    'Not sent': 'Not sent',
    'Recipient email is required.': 'Recipient email is required.',
    'Replace and send invoice': 'Replace and send invoice',
    'Resend invoice': 'Resend invoice',
    'Review invoice application': 'Review invoice application',
    'Save invoice settings': 'Save invoice settings',
    'Search by ID, invoice title, tax number, or email...':
      'Search by ID, invoice title, tax number, or email...',
    'Select paid orders and provide the invoice and delivery information.':
      'Select paid orders and provide the invoice and delivery information.',
    'Send count': 'Send count',
    'Send invoice': 'Send invoice',
    'Sent {{count}} times': 'Sent {{count}} times',
    'Tax supplement amount': 'Tax supplement amount',
    'The invoice will be sent to this email address.':
      'The invoice will be sent to this email address.',
    'Upload and send invoice': 'Upload and send invoice',
    'Use the actual service name shown on the invoice.':
      'Use the actual service name shown on the invoice.',
  },
  zh: {
    '{{count}} orders': '{{count}} 个订单',
    'Configure application eligibility and the invoice item used for paid orders. Buyer information is collected from each application.':
      '配置申请条件和已支付订单使用的发票项目。购方信息由每次申请单独收集。',
    'Currency must be CNY.': '币种必须为人民币（CNY）。',
    'Email delivery': '邮件发送',
    'Enter the actual supplement confirmed for this invoice, or 0 when none is required.':
      '输入本次发票确认的实际补税金额；无需补税时填写 0。',
    'Failed to review invoice application.': '审核发票申请失败。',
    'Failed to save invoice settings.': '保存发票设置失败。',
    'Failed to send invoice email.': '发送发票邮件失败。',
    'Final invoice amount': '最终开票金额',
    'Invoice email sent.': '发票邮件已发送。',
    'Invoice information': '发票信息',
    'Invoice settings': '发票设置',
    'Invoice upload or email delivery failed. Refresh the list and try again.':
      '发票上传或邮件发送失败，请刷新列表后重试。',
    'Invoice uploaded and sent.': '发票已上传并发送。',
    'Last sent at': '最近发送时间',
    'Mainland China invoices use CNY.': '中国大陆发票使用人民币（CNY）。',
    'Not sent': '未发送',
    'Recipient email is required.': '收件邮箱为必填项。',
    'Replace and send invoice': '更换并发送发票',
    'Resend invoice': '重新发送发票',
    'Review invoice application': '审核发票申请',
    'Save invoice settings': '保存发票设置',
    'Search by ID, invoice title, tax number, or email...':
      '按 ID、发票抬头、纳税人识别号或邮箱搜索...',
    'Select paid orders and provide the invoice and delivery information.':
      '选择已支付订单，并填写发票信息和收件邮箱。',
    'Send count': '发送次数',
    'Send invoice': '发送发票',
    'Sent {{count}} times': '已发送 {{count}} 次',
    'Tax supplement amount': '补税金额',
    'The invoice will be sent to this email address.':
      '发票将发送至此邮箱。',
    'Upload and send invoice': '上传并发送发票',
    'Use the actual service name shown on the invoice.':
      '请填写发票上实际展示的服务项目名称。',
  },
  'zh-TW': {
    '{{count}} orders': '{{count}} 筆訂單',
    'Configure application eligibility and the invoice item used for paid orders. Buyer information is collected from each application.':
      '設定申請條件與已付款訂單使用的發票項目。購方資料由每次申請分別收集。',
    'Currency must be CNY.': '幣別必須為人民幣（CNY）。',
    'Email delivery': '郵件傳送',
    'Enter the actual supplement confirmed for this invoice, or 0 when none is required.':
      '輸入本次發票確認的實際補稅金額；無需補稅時填寫 0。',
    'Failed to review invoice application.': '審核發票申請失敗。',
    'Failed to save invoice settings.': '儲存發票設定失敗。',
    'Failed to send invoice email.': '傳送發票郵件失敗。',
    'Final invoice amount': '最終開票金額',
    'Invoice email sent.': '發票郵件已傳送。',
    'Invoice information': '發票資訊',
    'Invoice settings': '發票設定',
    'Invoice upload or email delivery failed. Refresh the list and try again.':
      '發票上傳或郵件傳送失敗，請重新整理清單後再試。',
    'Invoice uploaded and sent.': '發票已上傳並傳送。',
    'Last sent at': '最近傳送時間',
    'Mainland China invoices use CNY.': '中國大陸發票使用人民幣（CNY）。',
    'Not sent': '尚未傳送',
    'Recipient email is required.': '收件電子郵件為必填。',
    'Replace and send invoice': '更換並傳送發票',
    'Resend invoice': '重新傳送發票',
    'Review invoice application': '審核發票申請',
    'Save invoice settings': '儲存發票設定',
    'Search by ID, invoice title, tax number, or email...':
      '依 ID、發票抬頭、納稅人識別號或電子郵件搜尋...',
    'Select paid orders and provide the invoice and delivery information.':
      '選擇已付款訂單，並填寫發票資料與收件電子郵件。',
    'Send count': '傳送次數',
    'Send invoice': '傳送發票',
    'Sent {{count}} times': '已傳送 {{count}} 次',
    'Tax supplement amount': '補稅金額',
    'The invoice will be sent to this email address.':
      '發票將傳送至此電子郵件。',
    'Upload and send invoice': '上傳並傳送發票',
    'Use the actual service name shown on the invoice.':
      '請填寫發票上實際顯示的服務項目名稱。',
  },
  fr: {
    '{{count}} orders': '{{count}} commandes',
    'Configure application eligibility and the invoice item used for paid orders. Buyer information is collected from each application.':
      'Configurez les conditions de demande et la prestation facturée. Les coordonnées de l’acheteur sont saisies dans chaque demande.',
    'Currency must be CNY.': 'La devise doit être le CNY.',
    'Email delivery': 'Envoi par e-mail',
    'Enter the actual supplement confirmed for this invoice, or 0 when none is required.':
      'Saisissez le complément réellement confirmé pour cette facture, ou 0 si aucun complément n’est requis.',
    'Failed to review invoice application.':
      'Échec de l’examen de la demande de facture.',
    'Failed to save invoice settings.':
      'Échec de l’enregistrement des paramètres de facturation.',
    'Failed to send invoice email.': 'Échec de l’envoi de la facture.',
    'Final invoice amount': 'Montant final facturé',
    'Invoice email sent.': 'E-mail de facture envoyé.',
    'Invoice information': 'Informations de facturation',
    'Invoice settings': 'Paramètres de facturation',
    'Invoice upload or email delivery failed. Refresh the list and try again.':
      'Échec du téléversement ou de l’envoi de la facture. Actualisez la liste et réessayez.',
    'Invoice uploaded and sent.': 'Facture téléversée et envoyée.',
    'Last sent at': 'Dernier envoi',
    'Mainland China invoices use CNY.':
      'Les factures de Chine continentale utilisent le CNY.',
    'Not sent': 'Non envoyée',
    'Recipient email is required.': 'L’adresse e-mail du destinataire est requise.',
    'Replace and send invoice': 'Remplacer et envoyer la facture',
    'Resend invoice': 'Renvoyer la facture',
    'Review invoice application': 'Examiner la demande de facture',
    'Save invoice settings': 'Enregistrer les paramètres de facturation',
    'Search by ID, invoice title, tax number, or email...':
      'Rechercher par ID, intitulé, numéro fiscal ou e-mail...',
    'Select paid orders and provide the invoice and delivery information.':
      'Sélectionnez les commandes payées et renseignez la facture ainsi que l’adresse d’envoi.',
    'Send count': 'Nombre d’envois',
    'Send invoice': 'Envoyer la facture',
    'Sent {{count}} times': 'Envoyée {{count}} fois',
    'Tax supplement amount': 'Complément de taxe',
    'The invoice will be sent to this email address.':
      'La facture sera envoyée à cette adresse e-mail.',
    'Upload and send invoice': 'Téléverser et envoyer la facture',
    'Use the actual service name shown on the invoice.':
      'Utilisez le nom réel de la prestation indiqué sur la facture.',
  },
  ja: {
    '{{count}} orders': '{{count}} 件の注文',
    'Configure application eligibility and the invoice item used for paid orders. Buyer information is collected from each application.':
      '申請条件と支払済み注文の請求項目を設定します。購入者情報は申請ごとに入力されます。',
    'Currency must be CNY.': '通貨は CNY である必要があります。',
    'Email delivery': 'メール送信',
    'Enter the actual supplement confirmed for this invoice, or 0 when none is required.':
      'この請求書で確定した追加税額を入力します。不要な場合は 0 を入力してください。',
    'Failed to review invoice application.': '請求書申請を審査できませんでした。',
    'Failed to save invoice settings.': '請求書設定を保存できませんでした。',
    'Failed to send invoice email.': '請求書メールを送信できませんでした。',
    'Final invoice amount': '最終請求額',
    'Invoice email sent.': '請求書メールを送信しました。',
    'Invoice information': '請求書情報',
    'Invoice settings': '請求書設定',
    'Invoice upload or email delivery failed. Refresh the list and try again.':
      '請求書のアップロードまたはメール送信に失敗しました。一覧を更新して再試行してください。',
    'Invoice uploaded and sent.': '請求書をアップロードして送信しました。',
    'Last sent at': '最終送信日時',
    'Mainland China invoices use CNY.': '中国本土の請求書では CNY を使用します。',
    'Not sent': '未送信',
    'Recipient email is required.': '受取先メールアドレスは必須です。',
    'Replace and send invoice': '請求書を差し替えて送信',
    'Resend invoice': '請求書を再送信',
    'Review invoice application': '請求書申請を審査',
    'Save invoice settings': '請求書設定を保存',
    'Search by ID, invoice title, tax number, or email...':
      'ID、請求書名義、納税者番号、メールで検索...',
    'Select paid orders and provide the invoice and delivery information.':
      '支払済み注文を選択し、請求書情報と送付先を入力してください。',
    'Send count': '送信回数',
    'Send invoice': '請求書を送信',
    'Sent {{count}} times': '{{count}} 回送信済み',
    'Tax supplement amount': '追加税額',
    'The invoice will be sent to this email address.':
      '請求書はこのメールアドレスに送信されます。',
    'Upload and send invoice': '請求書をアップロードして送信',
    'Use the actual service name shown on the invoice.':
      '請求書に表示する実際のサービス名を入力してください。',
  },
  ru: {
    '{{count}} orders': 'Заказов: {{count}}',
    'Configure application eligibility and the invoice item used for paid orders. Buyer information is collected from each application.':
      'Настройте условия подачи заявки и услугу для оплаченных заказов. Данные покупателя указываются в каждой заявке.',
    'Currency must be CNY.': 'Валютой должен быть CNY.',
    'Email delivery': 'Отправка по электронной почте',
    'Enter the actual supplement confirmed for this invoice, or 0 when none is required.':
      'Укажите подтверждённую доплату для этого счёта или 0, если доплата не требуется.',
    'Failed to review invoice application.':
      'Не удалось рассмотреть заявку на счёт.',
    'Failed to save invoice settings.': 'Не удалось сохранить настройки счетов.',
    'Failed to send invoice email.': 'Не удалось отправить счёт по электронной почте.',
    'Final invoice amount': 'Итоговая сумма счёта',
    'Invoice email sent.': 'Письмо со счётом отправлено.',
    'Invoice information': 'Данные счёта',
    'Invoice settings': 'Настройки счетов',
    'Invoice upload or email delivery failed. Refresh the list and try again.':
      'Не удалось загрузить или отправить счёт. Обновите список и повторите попытку.',
    'Invoice uploaded and sent.': 'Счёт загружен и отправлен.',
    'Last sent at': 'Последняя отправка',
    'Mainland China invoices use CNY.':
      'Для счетов в материковом Китае используется CNY.',
    'Not sent': 'Не отправлен',
    'Recipient email is required.': 'Электронная почта получателя обязательна.',
    'Replace and send invoice': 'Заменить и отправить счёт',
    'Resend invoice': 'Отправить счёт повторно',
    'Review invoice application': 'Рассмотреть заявку на счёт',
    'Save invoice settings': 'Сохранить настройки счетов',
    'Search by ID, invoice title, tax number, or email...':
      'Поиск по ID, названию, ИНН или электронной почте...',
    'Select paid orders and provide the invoice and delivery information.':
      'Выберите оплаченные заказы и укажите данные счёта и получателя.',
    'Send count': 'Количество отправок',
    'Send invoice': 'Отправить счёт',
    'Sent {{count}} times': 'Отправлено раз: {{count}}',
    'Tax supplement amount': 'Сумма доплаты налога',
    'The invoice will be sent to this email address.':
      'Счёт будет отправлен на этот адрес электронной почты.',
    'Upload and send invoice': 'Загрузить и отправить счёт',
    'Use the actual service name shown on the invoice.':
      'Укажите фактическое наименование услуги в счёте.',
  },
  vi: {
    '{{count}} orders': '{{count}} đơn hàng',
    'Configure application eligibility and the invoice item used for paid orders. Buyer information is collected from each application.':
      'Cấu hình điều kiện đăng ký và hạng mục hóa đơn cho đơn đã thanh toán. Thông tin người mua được nhập trong từng đơn đăng ký.',
    'Currency must be CNY.': 'Đơn vị tiền tệ phải là CNY.',
    'Email delivery': 'Gửi qua email',
    'Enter the actual supplement confirmed for this invoice, or 0 when none is required.':
      'Nhập khoản thuế bổ sung đã xác nhận cho hóa đơn này, hoặc 0 nếu không cần bổ sung.',
    'Failed to review invoice application.': 'Không thể duyệt đơn đăng ký hóa đơn.',
    'Failed to save invoice settings.': 'Không thể lưu cài đặt hóa đơn.',
    'Failed to send invoice email.': 'Không thể gửi email hóa đơn.',
    'Final invoice amount': 'Tổng tiền hóa đơn',
    'Invoice email sent.': 'Đã gửi email hóa đơn.',
    'Invoice information': 'Thông tin hóa đơn',
    'Invoice settings': 'Cài đặt hóa đơn',
    'Invoice upload or email delivery failed. Refresh the list and try again.':
      'Không thể tải lên hoặc gửi hóa đơn. Hãy làm mới danh sách rồi thử lại.',
    'Invoice uploaded and sent.': 'Đã tải lên và gửi hóa đơn.',
    'Last sent at': 'Lần gửi gần nhất',
    'Mainland China invoices use CNY.': 'Hóa đơn tại Trung Quốc đại lục sử dụng CNY.',
    'Not sent': 'Chưa gửi',
    'Recipient email is required.': 'Email người nhận là bắt buộc.',
    'Replace and send invoice': 'Thay thế và gửi hóa đơn',
    'Resend invoice': 'Gửi lại hóa đơn',
    'Review invoice application': 'Duyệt đơn đăng ký hóa đơn',
    'Save invoice settings': 'Lưu cài đặt hóa đơn',
    'Search by ID, invoice title, tax number, or email...':
      'Tìm theo ID, tên hóa đơn, mã số thuế hoặc email...',
    'Select paid orders and provide the invoice and delivery information.':
      'Chọn đơn đã thanh toán và nhập thông tin hóa đơn cùng email nhận.',
    'Send count': 'Số lần gửi',
    'Send invoice': 'Gửi hóa đơn',
    'Sent {{count}} times': 'Đã gửi {{count}} lần',
    'Tax supplement amount': 'Khoản thuế bổ sung',
    'The invoice will be sent to this email address.':
      'Hóa đơn sẽ được gửi đến địa chỉ email này.',
    'Upload and send invoice': 'Tải lên và gửi hóa đơn',
    'Use the actual service name shown on the invoice.':
      'Nhập đúng tên dịch vụ hiển thị trên hóa đơn.',
  },
}

async function main() {
  let totalAdded = 0

  for (const [locale, trans] of Object.entries(newKeys)) {
    const filePath = path.join(LOCALES_DIR, `${locale}.json`)
    const json = JSON.parse(await fs.readFile(filePath, 'utf8'))

    let count = 0
    for (const [key, value] of Object.entries(trans)) {
      if (!Object.prototype.hasOwnProperty.call(json.translation, key)) {
        json.translation[key] = value
        count++
      } else if (json.translation[key] !== value) {
        json.translation[key] = value
        count++
      }
    }

    if (count > 0) {
      json.translation = Object.fromEntries(
        Object.entries(json.translation).sort(([a], [b]) => a.localeCompare(b))
      )
      await fs.writeFile(filePath, stableStringify(json), 'utf8')
    }

    console.log(`${locale}: ${count} translations applied`)
    totalAdded += count
  }

  console.log(`\nTotal: ${totalAdded} translations applied`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
