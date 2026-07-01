package model

import (
	"errors"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	TokenDefaultPurposeChat          = "chat"
	TokenDefaultPurposeImage         = "image"
	TokenDefaultPurposeVideo         = "video"
	TokenDefaultPurposeAudio         = "audio"
	TokenDefaultPurposeEmbedding     = "embedding"
	TokenDefaultKeyPurposesOptionKey = "TokenDefaultKeyPurposes"
)

type TokenDefaultPurposeDefinition struct {
	Purpose string `json:"purpose"`
	Label   string `json:"label"`
	Token   string `json:"token"`
}

var defaultTokenDefaultPurposeDefinitions = []TokenDefaultPurposeDefinition{
	{Purpose: TokenDefaultPurposeChat, Label: "Chat", Token: "chatKey"},
	{Purpose: TokenDefaultPurposeImage, Label: "Image", Token: "imageKey"},
	{Purpose: TokenDefaultPurposeVideo, Label: "Video", Token: "videoKey"},
	{Purpose: TokenDefaultPurposeAudio, Label: "Audio", Token: "audioKey"},
	{Purpose: TokenDefaultPurposeEmbedding, Label: "Embeddings", Token: "embeddingKey"},
}

type TokenDefault struct {
	Id      int    `json:"id"`
	UserId  int    `json:"user_id" gorm:"uniqueIndex:idx_user_token_default_purpose"`
	Purpose string `json:"purpose" gorm:"type:varchar(32);uniqueIndex:idx_user_token_default_purpose"`
	TokenId int    `json:"token_id" gorm:"index"`
}

func NormalizeTokenDefaultPurpose(purpose string) (string, error) {
	normalized := strings.ToLower(strings.TrimSpace(purpose))
	if normalized == "" {
		normalized = TokenDefaultPurposeChat
	}
	if !isConfiguredTokenDefaultPurpose(normalized) {
		return "", errors.New("unsupported default API key purpose")
	}
	return normalized, nil
}

func DefaultTokenDefaultPurposeDefinitions() []TokenDefaultPurposeDefinition {
	definitions := make([]TokenDefaultPurposeDefinition, len(defaultTokenDefaultPurposeDefinitions))
	copy(definitions, defaultTokenDefaultPurposeDefinitions)
	return definitions
}

func TokenDefaultPurposeDefinitions2JSONString() string {
	jsonBytes, err := common.Marshal(DefaultTokenDefaultPurposeDefinitions())
	if err != nil {
		common.SysLog("error marshalling token default key purposes: " + err.Error())
		return "[]"
	}
	return string(jsonBytes)
}

func GetTokenDefaultPurposeDefinitions() []TokenDefaultPurposeDefinition {
	common.OptionMapRWMutex.RLock()
	raw := common.OptionMap[TokenDefaultKeyPurposesOptionKey]
	common.OptionMapRWMutex.RUnlock()

	definitions, err := NormalizeTokenDefaultPurposeDefinitions(raw)
	if err != nil {
		return DefaultTokenDefaultPurposeDefinitions()
	}
	return definitions
}

func NormalizeTokenDefaultPurposeDefinitions(raw string) ([]TokenDefaultPurposeDefinition, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return DefaultTokenDefaultPurposeDefinitions(), nil
	}

	var definitions []TokenDefaultPurposeDefinition
	if err := common.Unmarshal([]byte(raw), &definitions); err != nil {
		return nil, err
	}

	normalizedDefinitions := make([]TokenDefaultPurposeDefinition, 0, len(definitions))
	seenPurposes := map[string]bool{}
	seenTokens := map[string]bool{}
	hasChat := false

	for _, definition := range definitions {
		purpose := strings.ToLower(strings.TrimSpace(definition.Purpose))
		label := strings.TrimSpace(definition.Label)
		token := strings.TrimSpace(definition.Token)
		if purpose == "" {
			return nil, errors.New("default API key purpose cannot be empty")
		}
		if len(purpose) > 32 {
			return nil, errors.New("default API key purpose cannot exceed 32 characters")
		}
		if !isValidTokenDefaultIdentifier(purpose) {
			return nil, errors.New("default API key purpose may only contain letters, numbers, underscore, and hyphen")
		}
		if seenPurposes[purpose] {
			return nil, errors.New("duplicate default API key purpose")
		}
		if label == "" {
			label = purpose
		}
		if token == "" {
			token = purpose + "Key"
		}
		if !isValidTokenDefaultIdentifier(token) {
			return nil, errors.New("default API key token may only contain letters, numbers, underscore, and hyphen")
		}
		if seenTokens[token] {
			return nil, errors.New("duplicate default API key token")
		}

		seenPurposes[purpose] = true
		seenTokens[token] = true
		if purpose == TokenDefaultPurposeChat {
			hasChat = true
		}
		normalizedDefinitions = append(normalizedDefinitions, TokenDefaultPurposeDefinition{
			Purpose: purpose,
			Label:   label,
			Token:   token,
		})
	}

	if len(normalizedDefinitions) == 0 {
		return nil, errors.New("at least one default API key purpose is required")
	}
	if !hasChat {
		return nil, errors.New("default API key purposes must include chat")
	}
	return normalizedDefinitions, nil
}

func NormalizeTokenDefaultPurposeDefinitionsJSONString(raw string) (string, error) {
	definitions, err := NormalizeTokenDefaultPurposeDefinitions(raw)
	if err != nil {
		return "", err
	}
	jsonBytes, err := common.Marshal(definitions)
	if err != nil {
		return "", err
	}
	return string(jsonBytes), nil
}

func isConfiguredTokenDefaultPurpose(purpose string) bool {
	for _, definition := range GetTokenDefaultPurposeDefinitions() {
		if definition.Purpose == purpose {
			return true
		}
	}
	return false
}

func isValidTokenDefaultIdentifier(value string) bool {
	for _, char := range value {
		if char >= 'a' && char <= 'z' {
			continue
		}
		if char >= 'A' && char <= 'Z' {
			continue
		}
		if char >= '0' && char <= '9' {
			continue
		}
		if char == '_' || char == '-' {
			continue
		}
		return false
	}
	return true
}

func tokenDefaultTableExists() bool {
	return DB != nil && DB.Migrator().HasTable(&TokenDefault{})
}

func ensureTokenDefaultTable() error {
	if tokenDefaultTableExists() {
		return nil
	}
	return DB.AutoMigrate(&TokenDefault{})
}

func SetDefaultToken(userId int, tokenId int, purpose string) (*Token, error) {
	purpose, err := NormalizeTokenDefaultPurpose(purpose)
	if err != nil {
		return nil, err
	}
	if err := ensureTokenDefaultTable(); err != nil {
		return nil, err
	}

	var selectedToken Token
	err = DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("id = ? AND user_id = ?", tokenId, userId).First(&selectedToken).Error; err != nil {
			return err
		}
		if selectedToken.Status != common.TokenStatusEnabled {
			return errors.New("only enabled tokens can be used as a default API key")
		}

		tokenDefault := TokenDefault{
			UserId:  userId,
			Purpose: purpose,
			TokenId: tokenId,
		}
		if err := tx.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "user_id"}, {Name: "purpose"}},
			DoUpdates: clause.AssignmentColumns([]string{"token_id"}),
		}).Create(&tokenDefault).Error; err != nil {
			return err
		}

		if purpose == TokenDefaultPurposeChat {
			if err := tx.Model(&Token{}).
				Where("user_id = ? AND default_chat = ?", userId, true).
				Update("default_chat", false).Error; err != nil {
				return err
			}
			if err := tx.Model(&Token{}).
				Where("id = ? AND user_id = ?", tokenId, userId).
				Update("default_chat", true).Error; err != nil {
				return err
			}
			selectedToken.DefaultChat = true
		}

		return nil
	})
	if err != nil {
		return nil, err
	}

	selectedToken.DefaultPurposes = []string{purpose}
	return &selectedToken, nil
}

func SetDefaultChatToken(userId int, tokenId int) (*Token, error) {
	return SetDefaultToken(userId, tokenId, TokenDefaultPurposeChat)
}

func GetDefaultToken(userId int, purpose string) (*Token, error) {
	purpose, err := NormalizeTokenDefaultPurpose(purpose)
	if err != nil {
		return nil, err
	}

	var token Token
	if tokenDefaultTableExists() {
		err = DB.Model(&Token{}).
			Select("tokens.*").
			Joins("JOIN token_defaults ON token_defaults.token_id = tokens.id").
			Where("token_defaults.user_id = ? AND token_defaults.purpose = ? AND tokens.status = ?", userId, purpose, common.TokenStatusEnabled).
			Order("tokens.id desc").
			First(&token).Error
		if err == nil {
			token.DefaultPurposes = []string{purpose}
			if purpose == TokenDefaultPurposeChat {
				token.DefaultChat = true
			}
			return &token, nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
	}

	if purpose == TokenDefaultPurposeChat {
		err = DB.Where("user_id = ? AND status = ? AND default_chat = ?", userId, common.TokenStatusEnabled, true).
			Order("id desc").
			First(&token).Error
		if err == nil {
			token.DefaultPurposes = []string{TokenDefaultPurposeChat}
			return &token, nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
	}

	err = DB.Where("user_id = ? AND status = ?", userId, common.TokenStatusEnabled).
		Order("id desc").
		First(&token).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("No enabled API keys found. Create or enable one first.")
		}
		return nil, err
	}
	token.DefaultPurposes = []string{}
	return &token, nil
}

func GetDefaultChatToken(userId int) (*Token, error) {
	return GetDefaultToken(userId, TokenDefaultPurposeChat)
}

func GetUserTokenDefaultPurposes(userId int) (map[int][]string, error) {
	if !tokenDefaultTableExists() {
		return map[int][]string{}, nil
	}

	var defaults []TokenDefault
	if err := DB.Where("user_id = ?", userId).Find(&defaults).Error; err != nil {
		return nil, err
	}

	purposesByToken := make(map[int][]string, len(defaults))
	configuredPurposes := make(map[string]bool)
	for _, definition := range GetTokenDefaultPurposeDefinitions() {
		configuredPurposes[definition.Purpose] = true
	}
	for _, item := range defaults {
		if !configuredPurposes[item.Purpose] {
			continue
		}
		purposesByToken[item.TokenId] = append(purposesByToken[item.TokenId], item.Purpose)
	}
	return purposesByToken, nil
}

func AttachDefaultPurposes(userId int, tokens []*Token) error {
	if len(tokens) == 0 {
		return nil
	}

	purposesByToken, err := GetUserTokenDefaultPurposes(userId)
	if err != nil {
		return err
	}

	for _, token := range tokens {
		token.DefaultPurposes = purposesByToken[token.Id]
		if token.DefaultPurposes == nil {
			token.DefaultPurposes = []string{}
		}
		if token.DefaultChat && !containsTokenDefaultPurpose(token.DefaultPurposes, TokenDefaultPurposeChat) {
			token.DefaultPurposes = append(token.DefaultPurposes, TokenDefaultPurposeChat)
		}
	}
	return nil
}

func DeleteTokenDefaultsForToken(tokenId int) error {
	if !tokenDefaultTableExists() {
		return nil
	}
	return DB.Where("token_id = ?", tokenId).Delete(&TokenDefault{}).Error
}

func containsTokenDefaultPurpose(purposes []string, purpose string) bool {
	for _, item := range purposes {
		if item == purpose {
			return true
		}
	}
	return false
}
